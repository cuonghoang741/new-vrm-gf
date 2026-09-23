const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Drops dependencies that ride in with other packages and that this app never
 * uses. `android/` is generated and gitignored, so an edit made there by hand
 * survives exactly until the next `expo prebuild` — hence a plugin.
 *
 * Currently one entry: ML Kit's barcode scanner. `expo-camera` declares
 * `com.google.mlkit:barcode-scanning`, and nothing here scans a barcode — the
 * camera is only ever the FaceTime preview during a call. It was costing
 * `libbarhopper_v3.so` (4.7 MB), its model assets (0.8 MB) and some dex.
 *
 * Measured on the arm64 release APK: 89.6 MB → 83.9 MB.
 *
 * ⚠️ After changing this list, open a video call once. If some expo-camera
 * path does touch the scanner, that is where it throws NoClassDefFoundError.
 */
const EXCLUDES = [
  { group: 'com.google.mlkit', module: 'barcode-scanning' },
  { group: 'com.google.android.gms', module: 'play-services-mlkit-barcode-scanning' },
];

const MARKER = '// slim-build (withSlimBuild)';

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error('withSlimBuild: app/build.gradle is not groovy');
    }
    if (config.modResults.contents.includes(MARKER)) return config;

    const block = [
      MARKER,
      'configurations.configureEach {',
      ...EXCLUDES.map((e) => `    exclude group: '${e.group}', module: '${e.module}'`),
      '}',
      '',
    ].join('\n');

    // Before the `android {` block, where a top-level configuration belongs.
    const at = config.modResults.contents.indexOf('android {');
    if (at < 0) throw new Error('withSlimBuild: no `android {` block to anchor to');
    config.modResults.contents =
      config.modResults.contents.slice(0, at) + block + config.modResults.contents.slice(at);
    return config;
  });
