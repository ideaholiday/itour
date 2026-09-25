import { api } from "./api.js";

// Photos are shrunk in the browser before upload: a phone photo (4–8 MB) becomes
// a few hundred KB, which stays under the API's size limit, uploads quickly on
// mobile data, and drops the camera's EXIF data (including GPS location).

const MAX_EDGE = 1600;
const MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function prepareImage(file) {
  if (!file?.type?.startsWith("image/")) throw new Error("Choose a photo (JPG, PNG or WEBP).");
  if (file.size > MAX_ORIGINAL_BYTES) throw new Error("That photo is over 20 MB. Choose a smaller one.");

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("This photo format isn't supported. Use a JPG, PNG or WEBP photo.");
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();

  // Browsers without WEBP encoding return a PNG instead; use JPEG for those.
  let blob = await canvasToBlob(canvas, "image/webp", 0.82);
  if (!blob || blob.type !== "image/webp") blob = await canvasToBlob(canvas, "image/jpeg", 0.85);
  if (!blob) throw new Error("Could not read this photo. Try another one.");
  return { dataUrl: await blobToDataUrl(blob), mimeType: blob.type };
}

// Returns the public link of the uploaded photo.
export async function uploadImage(file, { entityType = "GENERAL", entityId = null } = {}) {
  const { dataUrl, mimeType } = await prepareImage(file);
  let result;
  try {
    result = await api.uploadFile({ data: dataUrl, filename: file.name, mimeType, entityType, entityId });
  } catch (err) {
    if (err.status === 401) throw new Error("Your session has ended. Sign in again to upload photos.");
    if (err.status === 429) throw new Error("Too many uploads. Please try again in an hour.");
    throw new Error("Upload failed. Please try again.");
  }
  const url = result?.upload?.url;
  if (!url) throw new Error("Upload failed. Please try again.");
  return url;
}
