/**
 * Client-side image downscaling for avatar uploads.
 *
 * There's no blob/file storage wired up in this project yet, so an
 * "uploaded" avatar has nowhere to live except the User row itself
 * (`avatar_url`, a `data:` URI — see its docstring on the backend). That
 * only works if the picture is small: this resizes/crops whatever the
 * user picks down to a fixed square thumbnail *before* it ever leaves the
 * browser, so a 12MB phone photo doesn't become a 12MB request (and a
 * multi-KB row forever after).
 */

const AVATAR_SIZE = 128;
const AVATAR_QUALITY = 0.82;

/** Resize+center-crop an image file to a square JPEG data URI.
 * Rejects on anything that isn't decodable as an image. */
export function resizeImageToDataUrl(
  file: File,
  size: number = AVATAR_SIZE,
  quality: number = AVATAR_QUALITY,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D context unavailable"));
        return;
      }

      // Center-crop to a square before scaling, so a wide/tall photo
      // doesn't come out squished — same "cover" behavior as CSS
      // object-fit: cover.
      const side = Math.min(img.naturalWidth, img.naturalHeight);
      const sx = (img.naturalWidth - side) / 2;
      const sy = (img.naturalHeight - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not load the selected file as an image"));
    };
    img.src = objectUrl;
  });
}
