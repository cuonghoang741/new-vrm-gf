const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Add HTML to asset extensions so the WebView can load local HTML via require()
config.resolver.assetExts.push("html");

module.exports = config;
