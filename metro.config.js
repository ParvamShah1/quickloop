// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Add polyfills for Node.js modules
config.resolver.extraNodeModules = {
  events: require.resolve('events/'),
  stream: require.resolve('stream-browserify'),
  zlib: require.resolve('browserify-zlib'),
  util: require.resolve('util/'),
  buffer: require.resolve('buffer/'),
  process: require.resolve('process/browser'),
  // Use our mock for the ws module
  ws: path.resolve(__dirname, './mocks/ws.js'),
  // Provide empty mocks for Node.js standard library modules
  http: path.resolve(__dirname, './mocks/empty.js'),
  https: path.resolve(__dirname, './mocks/empty.js'),
  net: path.resolve(__dirname, './mocks/empty.js'),
  tls: path.resolve(__dirname, './mocks/empty.js'),
  crypto: require.resolve('crypto-browserify'),
};

module.exports = config; 