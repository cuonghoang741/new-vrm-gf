const {
  withAndroidManifest,
  withStringsXml,
  withInfoPlist,
  AndroidConfig,
} = require('@expo/config-plugins');

/**
 * Facebook SDK native wiring for `react-native-fbsdk-next`.
 *
 * `app.config.ts` referenced `./withFacebookConfig` while this file did not
 * exist, so `expo prebuild` failed outright; builds only kept working because
 * `android/` had been generated earlier and still carried the values from a
 * DIFFERENT Facebook app. That is why events were arriving at app
 * 1627762991596472 instead of the one Meta Ads is being run from.
 *
 * What ships here is the App ID and the CLIENT token. The App Secret must
 * never reach a mobile binary: `strings.xml` is readable by anyone who unzips
 * the APK, and the secret would let them act as the app against the Graph API.
 */

/** Android: SDK reads these three from string resources, by exact name. */
const withFacebookStrings = (config, { appId, clientToken, displayName }) =>
  withStringsXml(config, (config) => {
    const set = (name, value) =>
      AndroidConfig.Strings.setStringItem(
        [{ _: value, $: { name, translatable: 'false' } }],
        config.modResults
      );
    set('facebook_app_id', appId);
    set('facebook_client_token', clientToken);
    // The login redirect scheme is literally "fb" + the app id.
    set('fb_login_protocol_scheme', `fb${appId}`);
    if (displayName) set('facebook_display_name', displayName);
    return config;
  });

/** Android: the SDK looks these meta-data keys up at init. */
const withFacebookManifest = (config) =>
  withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    const meta = (name, resource) =>
      AndroidConfig.Manifest.addMetaDataItemToMainApplication(app, name, resource, 'value');
    meta('com.facebook.sdk.ApplicationId', '@string/facebook_app_id');
    meta('com.facebook.sdk.ClientToken', '@string/facebook_client_token');
    meta('com.facebook.sdk.AutoInitEnabled', 'true');
    // Let the SDK send install + app-activation itself; without activation
    // Meta cannot attribute an install to the ad that produced it.
    meta('com.facebook.sdk.AutoLogAppEventsEnabled', 'true');
    meta('com.facebook.sdk.AdvertiserIDCollectionEnabled', 'true');
    return config;
  });

/** iOS: the same four values, plus the URL scheme for Facebook login. */
const withFacebookInfoPlist = (config, { appId, clientToken, displayName }) =>
  withInfoPlist(config, (config) => {
    const plist = config.modResults;
    plist.FacebookAppID = appId;
    plist.FacebookClientToken = clientToken;
    if (displayName) plist.FacebookDisplayName = displayName;
    plist.FacebookAutoLogAppEventsEnabled = true;
    plist.FacebookAdvertiserIDCollectionEnabled = true;

    plist.CFBundleURLTypes = plist.CFBundleURLTypes || [];
    const scheme = `fb${appId}`;
    const already = plist.CFBundleURLTypes.some((t) =>
      (t.CFBundleURLSchemes || []).includes(scheme)
    );
    if (!already) {
      plist.CFBundleURLTypes.push({ CFBundleURLSchemes: [scheme] });
    }

    // Required so the SDK may ask iOS whether Facebook apps are installed.
    plist.LSApplicationQueriesSchemes = Array.from(
      new Set([...(plist.LSApplicationQueriesSchemes || []), 'fbapi', 'fb-messenger-share-api'])
    );
    return config;
  });

module.exports = (config, props = {}) => {
  const { appId, clientToken, displayName } = props;
  if (!appId || !clientToken) {
    throw new Error('withFacebookConfig: appId and clientToken are required');
  }
  config = withFacebookStrings(config, { appId, clientToken, displayName });
  config = withFacebookManifest(config);
  config = withFacebookInfoPlist(config, { appId, clientToken, displayName });
  return config;
};
