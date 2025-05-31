const path = require('path');

module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Add support for static class blocks (needed for AWS SDK)
      "@babel/plugin-transform-class-static-block",
      
      // Handle Node.js module polyfills
      ["module:react-native-dotenv", {
        "moduleName": "@env",
        "path": ".env",
        "blacklist": null,
        "whitelist": null,
        "safe": false,
        "allowUndefined": true
      }],
      
      ["module-resolver", {
        alias: {
          "events": "events",
          "stream": "stream-browserify",
          "zlib": "browserify-zlib",
          "util": "util",
          "buffer": "buffer",
          "process": "process/browser",
          // Use our mock for the ws module
          "ws": path.resolve(__dirname, './mocks/ws.js'),
          // Provide empty mocks for Node.js standard library modules
          "http": path.resolve(__dirname, './mocks/empty.js'),
          "https": path.resolve(__dirname, './mocks/empty.js'),
          "net": path.resolve(__dirname, './mocks/empty.js'),
          "tls": path.resolve(__dirname, './mocks/empty.js'),
          "crypto": "crypto-browserify",
        }
      }]
    ]
  };
}; 