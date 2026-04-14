const { withDangerousMod, withAppDelegate } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Expo Config Plugin to add 'use_modular_headers!' to the Podfile
 * and ensure Firebase is initialized in AppDelegate.swift,
 * and fix return type issues (Void vs Bool) in AppDelegate methods.
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

  // 2. Ensure Firebase is configured and fix Return types in AppDelegate.swift
  config = withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    // Add import if missing
    if (!contents.includes('import FirebaseCore')) {
      contents = contents.replace(/import Expo/, 'import Expo\nimport FirebaseCore');
    }

    // A. Fix didFinishLaunchingWithOptions (Add Firebase + Fix Return)
    if (!contents.includes('FirebaseApp.configure()')) {
      const insertionPoint = 'super.application(application, didFinishLaunchingWithOptions: launchOptions)';
      contents = contents.replace(
        insertionPoint,
        `FirebaseApp.configure()\n    ${insertionPoint}\n    return true`
      );
    }

    // B. Fix Link return type (Void to Bool)
    const linkSearch = 'return super.application(app, open: url, options: options) || RCTLinkingManager.application(app, open: url, options: options)';
    if (contents.includes(linkSearch)) {
      contents = contents.replace(
        linkSearch,
        'super.application(app, open: url, options: options)\n    return RCTLinkingManager.application(app, open: url, options: options)'
      );
    }

    // C. Fix Universal Link return type (Void to Bool)
    const universalLinkSearch = 'return super.application(application, continue: userActivity, restorationHandler: restorationHandler) || result';
    if (contents.includes(universalLinkSearch)) {
      contents = contents.replace(
        universalLinkSearch,
        'super.application(application, continue: userActivity, restorationHandler: restorationHandler)\n    return result'
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

module.exports = withFirebaseSetup;
