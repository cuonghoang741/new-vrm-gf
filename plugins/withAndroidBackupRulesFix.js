const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * Fix Android manifest merger conflict between expo-secure-store and the
 * AppsFlyer SDK. Both declare `android:dataExtractionRules` and
 * `android:fullBackupContent` on <application>, which the merger cannot
 * reconcile (build fails at :app:processReleaseMainManifest).
 *
 * We tell the merger that the app manifest's values win (keeping
 * expo-secure-store's rules, which exclude secure data from backup).
 */
const ATTRS = ['android:dataExtractionRules', 'android:fullBackupContent'];

const withAndroidBackupRulesFix = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    // Ensure the tools namespace is available.
    manifest.$ = manifest.$ || {};
    if (!manifest.$['xmlns:tools']) {
      manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    }

    const application = manifest.application?.[0];
    if (application) {
      application.$ = application.$ || {};
      const existing = (application.$['tools:replace'] || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = Array.from(new Set([...existing, ...ATTRS]));
      application.$['tools:replace'] = merged.join(',');
    }

    return config;
  });
};

module.exports = withAndroidBackupRulesFix;
