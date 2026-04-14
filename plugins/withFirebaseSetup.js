const { withDangerousMod, withAppDelegate } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to add 'use_modular_headers!' to the Podfile
 * and ensure Firebase is initialized in AppDelegate.swift
 */
const withFirebaseSetup = (config) => {
  // 1. Add use_modular_headers! to Podfile
  config = withDangerousMod(config, [
    'ios',
    async (config) => {
      const podfilePath = path.join(config.modRequest.projectRoot, 'ios', 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      if (!contents.includes('use_modular_headers!')) {
        contents = contents.replace(
          /target 'TrueFeel' do/,
          "target 'TrueFeel' do\n  use_modular_headers!"
        );
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);

  // 2. Ensure Firebase is configured in AppDelegate.swift
  config = withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    // Add import if missing
    if (!contents.includes('import FirebaseCore')) {
      contents = contents.replace(/import Expo/, 'import Expo\nimport FirebaseCore');
    }

    // Add configure() if missing
    if (!contents.includes('FirebaseApp.configure()')) {
      const insertionPoint = 'super.application(application, didFinishLaunchingWithOptions: launchOptions)';
      contents = contents.replace(
        insertionPoint,
        `FirebaseApp.configure()\n    ${insertionPoint}\n    return true`
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

module.exports = withFirebaseSetup;
