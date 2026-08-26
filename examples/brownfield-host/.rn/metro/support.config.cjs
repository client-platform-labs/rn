/**
 * Auto-generated for brownfield reference host (map-a/#5).
 * Module: support · preferred entry: index.support
 */
const path = require("node:path");
const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

const projectRoot = path.resolve(__dirname, "../..");
const defaultConfig = getDefaultConfig(projectRoot);

module.exports = mergeConfig(defaultConfig, {
  projectRoot,
  cacheVersion: "rn-module-support",
  resetCache: false,
  resolver: {
    ...defaultConfig.resolver,
  },
  server: {
    ...defaultConfig.server,
    enhanceMiddleware: (middleware) => {
      return (req, res, next) => {
        res.setHeader("X-RN-Business-Module", "support");
        res.setHeader("X-RN-Bundle-Kind", "base");
        return middleware(req, res, next);
      };
    },
  },
});
