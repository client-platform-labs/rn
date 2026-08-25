export const DEMO_MARKER = "client-platform-rn-demo";
export const DEMO_STATE_DIR = ".rn-demo";
export const DEMO_SAMPLE_DIR = "src/sample";
export const DEMO_STATE_FILE = "state.json";

export const DEMO_NPM_DEPS = [
  "react-native-gesture-handler",
  "react-native-image-picker",
  "@react-navigation/native",
  "@react-navigation/bottom-tabs",
  "@react-navigation/native-stack",
  "react-native-screens",
  "react-native-safe-area-context",
  "react-native-webview",
] as const;

export const DEMO_APP_ENTRY_WIRE = `/**
 * Wired by \`rn demo add\` — restore with \`rn demo remove\`.
 */
import SampleApp from './src/sample/app/SampleApp';

export default SampleApp;
`;

export const DEMO_INDEX_GESTURE_IMPORT = "import 'react-native-gesture-handler';\n";
