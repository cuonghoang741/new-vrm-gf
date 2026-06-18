const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Copy assets/index.html into the Android app's android_asset directory at
 * prebuild time so the VRM WebView can load it via
 * `file:///android_asset/index.html`.
 *
 * react-native-webview cannot reliably load a `require()`'d HTML asset on
 * Android (it resolves to a Metro/http URL → ERR_CLEARTEXT / ERR_NAME_NOT_RESOLVED
 * in standalone/dev). A real file in android_asset avoids all of that.
 */
const withCopyIndexHtml = (config) => {
    return withDangerousMod(config, [
        'android',
        async (config) => {
            const src = path.join(
                config.modRequest.projectRoot,
                'assets',
                'index.html'
            );
            const destDir = path.join(
                config.modRequest.platformProjectRoot,
                'app',
                'src',
                'main',
                'assets'
            );
            const dest = path.join(destDir, 'index.html');

            if (fs.existsSync(src)) {
                fs.mkdirSync(destDir, { recursive: true });
                fs.copyFileSync(src, dest);
            } else {
                console.warn('[withCopyIndexHtml] assets/index.html not found at', src);
            }
            return config;
        },
    ]);
};

module.exports = withCopyIndexHtml;
