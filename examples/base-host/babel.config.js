// Resolve @react-native/babel-preset via the external RN root so the
// example project does not need a node_modules tree of its own.
const path = require("node:path");
const EXTERNAL_RN_ROOT =
  process.env.RN_EXTERNAL_ROOT || "/Users/xuwei/code/tiangong-host";

const babelPreset = require.resolve("@react-native/babel-preset", {
  paths: [EXTERNAL_RN_ROOT],
});

module.exports = {
  presets: [babelPreset],
};
