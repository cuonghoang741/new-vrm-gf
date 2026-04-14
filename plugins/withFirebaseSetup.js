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
      const launchMethodRegex = /(func\s+application\([\s\S]*?didFinishLaunchingWithOptions[\s\S]*?->\s+Bool\s+\{)([\s\S]*?)(return\s+super\.application\(application,\s+didFinishLaunchingWithOptions:\s+launchOptions\))/m;
      if (launchMethodRegex.test(contents)) {
        contents = contents.replace(launchMethodRegex, (match, signature, body, oldReturn) => {
          return `${signature}${body}\n    FirebaseApp.configure()\n    super.application(application, didFinishLaunchingWithOptions: launchOptions)\n    return true`;
        });
      }
    }

    // B. Fix Link return type (Void to Bool)
    const linkRegex = /return\s+super\.application\(app,\s+open:\s+url,\s+options:\s+options\)\s+\|\|\s+RCTLinkingManager\.application\(app,\s+open:\s+url,\s+options:\s+options\)/g;
    if (linkRegex.test(contents)) {
      contents = contents.replace(
        linkRegex,
        'super.application(app, open: url, options: options)\n    return RCTLinkingManager.application(app, open: url, options: options)'
      );
    }

    // C. Fix Universal Link return type (Void to Bool)
    const universalLinkRegex = /return\s+super\.application\(application,\s+continue:\s+userActivity,\s+restorationHandler:\s+restorationHandler\)\s+\|\|\s+result/g;
    if (universalLinkRegex.test(contents)) {
      contents = contents.replace(
        universalLinkRegex,
        'super.application(application, continue: userActivity, restorationHandler: restorationHandler)\n    return result'
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};

module.exports = withFirebaseSetup;
