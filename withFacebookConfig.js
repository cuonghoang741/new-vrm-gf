// Expo config plugin to inject Facebook SDK configuration for iOS & Android
// Usage in app.config.ts:
//   [
//     './withFacebookConfig',
//     {
//       appId: '1166950728892948',
//       displayName: 'Mashi',
//       clientToken: '6079741410e7433fa15dff010b7e2141'
//     }
//   ]

const {
  withInfoPlist,
  withAndroidManifest,
  AndroidConfig,
  withStringsXml,
  withAppDelegate,
} = require('expo/config-plugins');

const FB_QUERY_SCHEMES = ['fbapi', 'fb-messenger-share-api', 'fbauth2', 'fbshareextension'];

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function addUrlScheme(plist, scheme) {
  plist.CFBundleURLTypes = ensureArray(plist.CFBundleURLTypes);
  // Find dict that contains CFBundleURLSchemes array, or create new
  let urlType = plist.CFBundleURLTypes.find((d) => d && d.CFBundleURLSchemes);
  if (!urlType) {
    urlType = { CFBundleURLSchemes: [] };
    plist.CFBundleURLTypes.push(urlType);
  }
  const schemes = ensureArray(urlType.CFBundleURLSchemes);
  if (!schemes.includes(scheme)) {
    schemes.push(scheme);
  }
  urlType.CFBundleURLSchemes = schemes;
}

function withIOS(config, { appId, displayName, clientToken }) {
  // Info.plist keys
  config = withInfoPlist(config, (cfg) => {
    const plist = cfg.modResults;

    plist.FacebookAppID = appId;
    plist.FacebookDisplayName = displayName;
    plist.FacebookClientToken = clientToken;

    addUrlScheme(plist, `fb${appId}`);

    const existing = new Set(ensureArray(plist.LSApplicationQueriesSchemes));
    FB_QUERY_SCHEMES.forEach((s) => existing.add(s));
    plist.LSApplicationQueriesSchemes = Array.from(existing);

    // if (!plist.NSUserTrackingUsageDescription) {
    //   plist.NSUserTrackingUsageDescription =
    //     'We use tracking to provide personalized experience and improve our services.';
    // }

    return cfg;
  });

  // AppDelegate (Swift) modifications: import and initialize ApplicationDelegate
  config = withAppDelegate(config, (cfg) => {
    const mod = cfg.modResults;
    const isSwift = mod.language === 'swift';
    if (!isSwift) return cfg;

    // 1) Ensure import
    if (!mod.contents.includes('import FBSDKCoreKit')) {
      mod.contents = mod.contents.replace(
        /import React\nimport ReactAppDependencyProvider\n/,
        (m) => m + 'import FBSDKCoreKit\n'
      );
    }

    // 2) Ensure didFinishLaunching has ApplicationDelegate init
    const launchRegex = /(didFinishLaunchingWithOptions:[\s\S]*?\{[\s\S]*?)(factory.startReactNative\([\s\S]*?\);)/m;
    if (launchRegex.test(mod.contents) && !mod.contents.includes('ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)')) {
      mod.contents = mod.contents.replace(
        launchRegex,
        (match, prefix, factoryCall) =>
          `${prefix}// Initialize Facebook SDK\n    ApplicationDelegate.shared.application(application, didFinishLaunchingWithOptions: launchOptions)\n\n    ${factoryCall}`
      );
    }

    // 3) Ensure openURL delegate forwards to FB
    if (!mod.contents.includes('ApplicationDelegate.shared.application')) {
      const openUrlMethodRegex = /(func\s+application\([\s\S]*?open\s+url:\s+URL[\s\S]*?->\s+Bool\s+\{)([\s\S]*?)(return\s+)([\s\S]*?)(RCTLinkingManager\.application\(app,\s+open:\s+url,\s+options:\s+options\))([\s\S]*?\})/m;
      if (openUrlMethodRegex.test(mod.contents)) {
        mod.contents = mod.contents.replace(
          openUrlMethodRegex,
          (match, signature, body, returnKeyword, prefix, linkingCall, suffix) => {
            return `${signature}${body}\n    let handledByFB = ApplicationDelegate.shared.application(app, open: url, options: options)\n    super.application(app, open: url, options: options)\n    return handledByFB || ${linkingCall}${suffix}`;
          }
        );
      }
    }

    return cfg;
  });

  return config;
}

function findMainApplication(androidManifest) {
  const app = androidManifest.manifest.application?.[0];
  if (!app) throw new Error('AndroidManifest.xml: <application> not found');
  return app;
}

function ensureMetaData(app, name, value) {
  app['meta-data'] = app['meta-data'] || [];
  const existing = app['meta-data'].find((m) => m.$ && m.$['android:name'] === name);
  if (existing) {
    existing.$['android:value'] = value;
  } else {
    app['meta-data'].push({
      $: { 'android:name': name, 'android:value': value },
    });
  }
}

function ensureActivity(app, activityName, attrs = {}, intentFilter = null) {
  app.activity = app.activity || [];
  const exists = app.activity.find((a) => a.$ && a.$['android:name'] === activityName);
  if (exists) {
    exists.$ = { ...(exists.$ || {}), ...attrs };
    if (intentFilter) exists['intent-filter'] = intentFilter;
    return;
  }
  const node = { $: { 'android:name': activityName, ...attrs } };
  if (intentFilter) node['intent-filter'] = intentFilter;
  app.activity.push(node);
}

function addFacebookQueries(androidManifest) {
  const root = androidManifest.manifest;
  root.queries = root.queries || [];

  const providersNode = {
    provider: [
      { $: { 'android:authorities': 'com.facebook.katana.provider.PlatformProvider' } },
      { $: { 'android:authorities': 'com.facebook.orca.provider.PlatformProvider' } },
    ],
  };

  const hasProviders = root.queries.some((q) => JSON.stringify(q) === JSON.stringify(providersNode));
  if (!hasProviders) {
    root.queries.push(providersNode);
  }
}

function withAndroid(config, { appId, clientToken }) {
  // strings.xml
  config = withStringsXml(config, (cfg) => {
    const strings = cfg.modResults;
    const setStr = (name, value) => {
      const existing = strings.resources.string?.find((s) => s.$.name === name);
      if (existing) existing._ = value;
      else {
        strings.resources.string = strings.resources.string || [];
        strings.resources.string.push({ _: value, $: { name } });
      }
    };

    setStr('facebook_app_id', appId);
    setStr('fb_login_protocol_scheme', `fb${appId}`);
    setStr('facebook_client_token', clientToken);
    return cfg;
  });

  // AndroidManifest.xml
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = findMainApplication(manifest);

    ensureMetaData(app, 'com.facebook.sdk.ApplicationId', '@string/facebook_app_id');
    ensureMetaData(app, 'com.facebook.sdk.ClientToken', '@string/facebook_client_token');

    ensureActivity(
      app,
      'com.facebook.FacebookActivity',
      {
        'android:configChanges': 'keyboard|keyboardHidden|screenLayout|screenSize|orientation',
        'android:label': '@string/app_name',
      },
    );

    ensureActivity(app, 'com.facebook.CustomTabActivity', { 'android:exported': 'true' }, [
      {
        action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
        category: [
          { $: { 'android:name': 'android.intent.category.DEFAULT' } },
          { $: { 'android:name': 'android.intent.category.BROWSABLE' } },
        ],
        data: [{ $: { 'android:scheme': '@string/fb_login_protocol_scheme' } }],
      },
    ]);

    addFacebookQueries(manifest);

    return cfg;
  });
}

module.exports = function withFacebookConfig(config, props) {
  const { appId, displayName, clientToken } = props || {};
  if (!appId || !clientToken) {
    throw new Error('withFacebookConfig: appId and clientToken are required');
  }
  config = withIOS(config, { appId, displayName: displayName || 'Facebook', clientToken });
  config = withAndroid(config, { appId, clientToken });
  return config;
};
