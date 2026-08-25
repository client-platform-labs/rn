import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEMO_MARKER } from "./constants.js";

const MARKER = `<!-- ${DEMO_MARKER} -->`;

const ANDROID_PERMISSIONS = `${MARKER}
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_MEDIA_VIDEO" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />`;

const ANDROID_SCHEME = `${MARKER}
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="cpl-sample" />
</intent-filter>`;

const IOS_BLOCK = `${MARKER}
<key>NSCameraUsageDescription</key>
<string>样板 Demo 演示拍照与附件上传</string>
<key>NSPhotoLibraryUsageDescription</key>
<string>样板 Demo 演示从相册选择图片或视频</string>
<key>NSMicrophoneUsageDescription</key>
<string>样板 Demo 演示视频录制</string>
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLSchemes</key>
    <array>
      <string>cpl-sample</string>
    </array>
  </dict>
</array>`;

function findAndroidManifest(projectRoot: string): string | undefined {
  const manifest = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "AndroidManifest.xml",
  );
  return existsSync(manifest) ? manifest : undefined;
}

function findIosInfoPlist(projectRoot: string): string | undefined {
  const iosDir = path.join(projectRoot, "ios");
  if (!existsSync(iosDir)) {
    return undefined;
  }
  for (const entry of readdirSync(iosDir)) {
    const plist = path.join(iosDir, entry, "Info.plist");
    if (existsSync(plist)) {
      return plist;
    }
  }
  return undefined;
}

function removeMarkedSections(content: string): string {
  const parts = content.split(MARKER);
  if (parts.length === 1) {
    return content;
  }
  let out = parts[0] ?? "";
  for (let i = 1; i < parts.length; i += 2) {
    if (i + 1 < parts.length) {
      out += parts[i + 1] ?? "";
    }
  }
  return out;
}

function patchAndroid(content: string, apply: boolean): string {
  let next = removeMarkedSections(content);
  if (!apply) {
    return next;
  }
  if (!next.includes("android.permission.CAMERA")) {
    next = next.replace(/<manifest([^>]*)>/, `<manifest$1>\n${ANDROID_PERMISSIONS}`);
  }
  if (!next.includes('android:scheme="cpl-sample"')) {
    next = next.replace(
      /(<activity[^>]*MainActivity[^>]*>)/,
      `$1\n        ${ANDROID_SCHEME.replace(/\n/g, "\n        ")}`,
    );
  }
  return next;
}

function patchIos(content: string, apply: boolean): string {
  let next = removeMarkedSections(content);
  if (!apply) {
    return next;
  }
  if (next.includes("cpl-sample")) {
    return next;
  }
  return next.replace("</dict>\n</plist>", `${IOS_BLOCK}\n</dict>\n</plist>`);
}

export function patchNativeProject(
  projectRoot: string,
  mode: "add" | "remove",
): string[] {
  const touched: string[] = [];
  const apply = mode === "add";

  const androidManifest = findAndroidManifest(projectRoot);
  if (androidManifest) {
    const raw = readFileSync(androidManifest, "utf8");
    const patched = patchAndroid(raw, apply);
    if (patched !== raw) {
      writeFileSync(androidManifest, patched, "utf8");
      touched.push(androidManifest);
    }
  }

  const iosPlist = findIosInfoPlist(projectRoot);
  if (iosPlist) {
    const raw = readFileSync(iosPlist, "utf8");
    const patched = patchIos(raw, apply);
    if (patched !== raw) {
      writeFileSync(iosPlist, patched, "utf8");
      touched.push(iosPlist);
    }
  }

  return touched;
}
