const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withCustomPodfile(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');

      try {
        let podfileContents = await fs.promises.readFile(podfilePath, 'utf8');

        // Add use_modular_headers! if not present
        if (!podfileContents.includes('use_modular_headers!')) {
          podfileContents = podfileContents.replace(
            /(target\s+['"][^'"]+['"]\s+do\s*\n\s*use_expo_modules!)/,
            '$1\n  use_modular_headers!',
          );
          console.log('✅ Added use_modular_headers! to Podfile');
        } else {
          console.log('ℹ️  use_modular_headers! already exists in Podfile');
        }

        // Add OneSignal pod to the OneSignalNotificationServiceExtension target
        const extensionTargetRegex = /(target\s+['"]OneSignalNotificationServiceExtension['"]\s+do)/;
        if (extensionTargetRegex.test(podfileContents)) {
          // Check if OneSignal pod is already added to the extension
          if (!podfileContents.includes("target 'OneSignalNotificationServiceExtension' do\n  pod 'OneSignalXCFramework'")) {
            podfileContents = podfileContents.replace(
              extensionTargetRegex,
              "$1\n  pod 'OneSignalXCFramework', '>= 5.0.0', '< 6.0'"
            );
            console.log('✅ Added OneSignalXCFramework pod to OneSignalNotificationServiceExtension target');
          }
        }

        await fs.promises.writeFile(podfilePath, podfileContents);
        return config;
      } catch (error) {
        console.warn('⚠️  Could not modify Podfile:', error.message);
        return config;
      }
    },
  ]);
};
