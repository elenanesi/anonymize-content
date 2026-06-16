import { redactImages as redactZipImages } from "./image-redactor.js";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

export async function collectDocxImages(zip) {
  const images = [];
  const mediaPaths = zip.paths(/^word\/media\/.+/).sort();

  for (const path of mediaPaths) {
    const blob = await zip.blob(path);
    const type = blob?.type || mimeFromPath(path);
    images.push({
      id: path,
      path,
      slide: null,
      label: path.split("/").pop(),
      type,
      url: blob && IMAGE_TYPES.has(type) ? URL.createObjectURL(blob) : ""
    });
  }

  return images;
}

export async function redactDocxImages(zip, imageIds) {
  return redactZipImages(zip, imageIds);
}

function mimeFromPath(path) {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.jpe?g$/i.test(path)) return "image/jpeg";
  if (/\.gif$/i.test(path)) return "image/gif";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "application/octet-stream";
}
