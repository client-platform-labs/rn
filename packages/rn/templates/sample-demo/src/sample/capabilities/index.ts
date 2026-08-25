import type { CapabilityProbeResult } from "../data/types";
import {
  pickPhotoFromLibrary,
  pickVideoFromLibrary,
  recordVideo,
  takePhoto,
  type PickedMedia,
} from "./mediaAdapter";

export type { CapabilityProbeResult, PickedMedia };

export async function probeCamera(): Promise<CapabilityProbeResult> {
  return {
    status: "ADAPTER_REQUIRED",
    message: "Camera via Sample Media Adapter (react-native-image-picker); L1 能力包待替换",
  };
}

export async function probeMediaLibrary(): Promise<CapabilityProbeResult> {
  return {
    status: "ADAPTER_REQUIRED",
    message: "MediaLibrary via Sample Media Adapter; 相册/视频单选已启用",
  };
}

/** @deprecated use takePhoto */
export async function capturePhoto(): Promise<{ uri: string; mimeType: string }> {
  const picked = await takePhoto();
  if (!picked) {
    throw new Error("用户取消或未授权相机");
  }
  return picked;
}

export async function pickImage(): Promise<PickedMedia | undefined> {
  return pickPhotoFromLibrary();
}

export { takePhoto, pickPhotoFromLibrary, pickVideoFromLibrary, recordVideo };

/** @deprecated use pickVideoFromLibrary */
export async function pickVideo(): Promise<{ uri: string; mimeType: string }> {
  const picked = await pickVideoFromLibrary();
  if (!picked) {
    throw new Error("用户取消或未选择视频");
  }
  return picked;
}

export async function probeDeepLink(): Promise<CapabilityProbeResult> {
  return {
    status: "SUPPORTED",
    message: "DeepLink stub（tel: / https: / cpl-sample:）",
  };
}

export async function openTel(phone: string): Promise<{ ok: boolean; message: string }> {
  const { Linking } = await import("react-native");
  const url = `tel:${phone.replace(/\s/g, "")}`;
  const can = await Linking.canOpenURL(url);
  if (!can) {
    return { ok: false, message: `无法打开 ${url}` };
  }
  await Linking.openURL(url);
  return { ok: true, message: `已调起拨号：${url}` };
}

export async function openHttps(url: string): Promise<{ ok: boolean; message: string }> {
  const { Linking } = await import("react-native");
  const can = await Linking.canOpenURL(url);
  if (!can) {
    return { ok: false, message: `无法打开 ${url}` };
  }
  await Linking.openURL(url);
  return { ok: true, message: `已外开浏览器：${url}` };
}

export async function mockUpload(
  uri: string,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; remoteUri: string }> {
  for (const pct of [20, 55, 85, 100]) {
    await new Promise((r) => setTimeout(r, 200));
    onProgress(pct);
  }
  return { ok: true, remoteUri: `${uri}?uploaded=1` };
}
