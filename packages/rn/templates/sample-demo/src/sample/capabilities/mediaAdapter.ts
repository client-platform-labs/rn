/**
 * Sample Media Adapter — community picker behind L1-shaped API.
 * Replace with @client-platform/rn-capability-media when L1 ships.
 */
import {
  launchCamera,
  launchImageLibrary,
  type CameraOptions,
  type ImageLibraryOptions,
} from "react-native-image-picker";

export interface PickedMedia {
  uri: string;
  mimeType: string;
  fileName?: string;
}

function mimeFromAsset(
  type: string | undefined,
  fileName: string | undefined,
  fallback: string,
): string {
  if (type) {
    return type;
  }
  if (fileName?.toLowerCase().endsWith(".png")) {
    return "image/png";
  }
  if (fileName?.toLowerCase().endsWith(".mov")) {
    return "video/quicktime";
  }
  return fallback;
}

function fromCameraResult(
  result: Awaited<ReturnType<typeof launchCamera>>,
  fallbackMime: string,
): PickedMedia | undefined {
  if (result.didCancel || result.errorCode || !result.assets?.[0]?.uri) {
    return undefined;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: mimeFromAsset(asset.type, asset.fileName, fallbackMime),
    fileName: asset.fileName,
  };
}

function fromLibraryResult(
  result: Awaited<ReturnType<typeof launchImageLibrary>>,
  fallbackMime: string,
): PickedMedia | undefined {
  if (result.didCancel || result.errorCode || !result.assets?.[0]?.uri) {
    return undefined;
  }
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: mimeFromAsset(asset.type, asset.fileName, fallbackMime),
    fileName: asset.fileName,
  };
}

const cameraBase: CameraOptions = {
  mediaType: "mixed",
  saveToPhotos: false,
  quality: 0.85,
};

const libraryBase: ImageLibraryOptions = {
  mediaType: "mixed",
  selectionLimit: 1,
  quality: 0.85,
};

export async function pickPhotoFromLibrary(): Promise<PickedMedia | undefined> {
  const result = await launchImageLibrary({ ...libraryBase, mediaType: "photo" });
  return fromLibraryResult(result, "image/jpeg");
}

export async function takePhoto(): Promise<PickedMedia | undefined> {
  const result = await launchCamera({ ...cameraBase, mediaType: "photo" });
  return fromCameraResult(result, "image/jpeg");
}

export async function pickVideoFromLibrary(): Promise<PickedMedia | undefined> {
  const result = await launchImageLibrary({ ...libraryBase, mediaType: "video" });
  return fromLibraryResult(result, "video/mp4");
}

export async function recordVideo(): Promise<PickedMedia | undefined> {
  const result = await launchCamera({
    ...cameraBase,
    mediaType: "video",
    videoQuality: "medium",
    durationLimit: 60,
  });
  return fromCameraResult(result, "video/mp4");
}
