const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Builds only the ABIs a real phone runs.
 *
 * `expo prebuild` writes `reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,
 * x86_64` every time it regenerates `android/`. The two x86 entries exist for
 * emulators; no phone on the Play Store can load them. Measured on this app
 * they cost **72 MB of a 179 MB APK — 40% of the download** — and that cost is
 * paid by every user on every install.
 *
 * `android/` is gitignored and generated, so setting this by hand lasts until
 * the next prebuild. That is exactly what happened: builds went out at 84 MB
 * for weeks, then one prebuild silently doubled them.
 *
 * Kept as an env override rather than a constant so an emulator build is still
 * one variable away:
 *
 *     TRUEMATE_ABIS=armeabi-v7a,arm64-v8a,x86,x86_64 npx expo prebuild -p android
 *
 * ⚠️ APKs only. An AAB must be built with ALL FOUR, because Play serves each
 * device only the split that matches it — extra ABIs cost the user nothing and
 * only make the upload bigger. Shipping an arm-only bundle crashes every
 * x86_64 install (Chromebook, Windows Subsystem for Android, emulators) at
 * launch with `SoLoaderDSONotFoundError: couldn't find DSO to load:
 * libreactnative.so`, because SoLoader looks in `lib/x86_64` inside the splits
 * and the bundle has nothing there. That has already happened once.
 */
const DEFAULT_ABIS = 'arm64-v8a';

module.exports = (config) =>
  withGradleProperties(config, (config) => {
    const value = process.env.TRUEMATE_ABIS || DEFAULT_ABIS;
    const key = 'reactNativeArchitectures';

    const existing = config.modResults.find(
      (item) => item.type === 'property' && item.key === key
    );
    if (existing) {
      existing.value = value;
    } else {
      config.modResults.push({ type: 'property', key, value });
    }
    return config;
  });
