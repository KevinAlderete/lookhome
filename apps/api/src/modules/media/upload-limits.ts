export const MAX_IMAGE_UPLOAD_BYTES = 8 * 1024 * 1024;

export const IMAGE_UPLOAD_LIMITS = {
  fileSize: MAX_IMAGE_UPLOAD_BYTES,
  files: 1,
  fields: 0,
  parts: 1,
  fieldNameSize: 64,
};
