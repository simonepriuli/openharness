import { insertImageInDraft, type ComposerSegment, type ImageSegment } from "./composer-draft";

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

const DEFAULT_MAX_DIMENSION = 2000;

function baseMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() ?? mimeType.toLowerCase();
}

function isSupportedImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(baseMimeType(mimeType));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Failed to read image data"));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read image data"));
    reader.readAsDataURL(blob);
  });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode image"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

export async function resizeImageForModel(
  file: Blob,
  maxDim = DEFAULT_MAX_DIMENSION,
): Promise<{ data: string; mimeType: string; previewBlob: Blob }> {
  const sourceMime = baseMimeType(file.type || "image/png");
  const image = await loadImageFromBlob(file);

  let { width, height } = image;
  const scale = Math.min(1, maxDim / Math.max(width, height));
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not available");
  }
  ctx.drawImage(image, 0, 0, width, height);

  const outputMime =
    sourceMime === "image/png" || sourceMime === "image/gif" ? sourceMime : "image/jpeg";
  const quality = outputMime === "image/jpeg" ? 0.92 : undefined;
  const previewBlob = await canvasToBlob(canvas, outputMime, quality);
  const data = await blobToBase64(previewBlob);

  return { data, mimeType: outputMime, previewBlob };
}

export async function readImageFromClipboard(
  clipboardData: DataTransfer,
): Promise<Omit<ImageSegment, "id" | "type"> | null> {
  const imageItem = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
  if (!imageItem) return null;

  const file = imageItem.getAsFile();
  if (!file || !isSupportedImageMimeType(file.type)) return null;

  const { data, mimeType, previewBlob } = await resizeImageForModel(file);
  const previewUrl = URL.createObjectURL(previewBlob);

  return {
    mimeType,
    data,
    previewUrl,
  };
}

export async function addClipboardImageToDraft(
  segments: ComposerSegment[],
  clipboardData: DataTransfer,
): Promise<ComposerSegment[] | null> {
  const image = await readImageFromClipboard(clipboardData);
  if (!image) return null;
  return insertImageInDraft(segments, image);
}
