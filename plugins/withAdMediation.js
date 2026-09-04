const {
  withProjectBuildGradle,
  withAppBuildGradle,
} = require('@expo/config-plugins');

/**
 * AdMob mediation adapters — same set and versions yuuki-ai-3d ships.
 *
 * The version string is `<network SDK version>.<adapter revision>`: the last
 * component tracks Google's adapter, the ones before it the network's own SDK.
 * AdMob validates that pairing, so pin exact versions — never a range.
 *
 * An adapter only makes a network *available*. Each one stays dark until its
 * credentials and unit mapping are filled in on the AdMob console's mediation
 * group; adding the dependency alone changes no fill.
 */
const ADAPTERS = [
  'com.google.ads.mediation:adcolony:4.8.0.2',
  'com.google.ads.mediation:applovin:13.5.1.0',
  'com.google.ads.mediation:facebook:6.20.0.1',
  'com.google.ads.mediation:ironsource:9.3.0.1',
  'com.google.ads.mediation:mintegral:17.0.91.0',
  'com.google.ads.mediation:pangle:6.4.0.6.0',
  'com.google.ads.mediation:unity:4.16.6.0',
  'com.google.ads.mediation:vungle:7.5.1.0',
];

/**
 * Networks that do not publish to Maven Central and need their own repo.
 * Only add a repo alongside the adapter that needs it — a missing one surfaces
 * as `Could not find <artifact>` at build time.
 */
const REPOS = [
  'https://dl-maven-android.mintegral.com/repository/mbridge_android_sdk_oversea',
  'https://artifact.bytedance.com/repository/pangle',
];

const MARKER = '// ad-mediation (withAdMediation)';

/** Add the network repos to the `allprojects { repositories { … } }` block. */
const withMediationRepos = (config) =>
  withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withAdMediation: expected a Groovy android/build.gradle, got ' +
          config.modResults.language
      );
    }
    if (config.modResults.contents.includes(MARKER)) return config;

    const lines = REPOS.map((url) => `    maven { url '${url}' }`).join('\n');
    // Anchor on allprojects' repositories, not buildscript's — the adapters are
    // app dependencies, not build-script classpath entries.
    const anchor = /allprojects\s*\{\s*\n(\s*)repositories\s*\{\s*\n/;
    if (!anchor.test(config.modResults.contents)) {
      throw new Error(
        'withAdMediation: could not find allprojects { repositories { in android/build.gradle'
      );
    }
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      (match) => `${match}${MARKER}\n${lines}\n`
    );
    return config;
  });

/** Add the adapter dependencies to the app module. */
const withMediationDeps = (config) =>
  withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withAdMediation: expected a Groovy android/app/build.gradle, got ' +
          config.modResults.language
      );
    }
    if (config.modResults.contents.includes(MARKER)) return config;

    const lines = ADAPTERS.map((a) => `    implementation '${a}'`).join('\n');
    // The app module's own `dependencies {` block sits at column 0; nested
    // blocks are indented, so anchoring on the line start picks the right one.
    const anchor = /^dependencies\s*\{\s*$/m;
    if (!anchor.test(config.modResults.contents)) {
      throw new Error(
        'withAdMediation: could not find the dependencies block in android/app/build.gradle'
      );
    }
    config.modResults.contents = config.modResults.contents.replace(
      anchor,
      (match) => `${match}\n${MARKER}\n${lines}`
    );
    return config;
  });

module.exports = (config) => withMediationDeps(withMediationRepos(config));
