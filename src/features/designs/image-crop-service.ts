import sharp from "sharp";
import type { z } from "zod";
import { imageFieldConfigSchema } from "@/lib/validation/schemas";

export const ALLOWED_IMAGE_MIME = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export type ImageCropErrorCode =
  | "IMAGE_MIME_FORBIDDEN"
  | "IMAGE_MIME_UNSUPPORTED"
  | "IMAGE_TOO_SMALL"
  | "IMAGE_TOO_LARGE"
  | "IMAGE_RATIO_INVALID"
  | "IMAGE_CORRUPT"
  | "IMAGE_UPSCALE_FORBIDDEN"
  | "IMAGE_INACCESSIBLE";

/** Max upload size for crop inputs (spec: limit file size). */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export interface CropArea {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CropRequest {
  buffer: Buffer;
  mimeType: string;
  targetWidth: number;
  targetHeight: number;
  focalX?: number;
  focalY?: number;
  allowUpscale?: boolean;
  minimumWidth: number;
  minimumHeight: number;
  expectedRatio?: string;
}

export interface ImageCropResult {
  success: boolean;
  width: number;
  height: number;
  mimeType: string;
  cropArea: CropArea;
  outputBuffer: Buffer;
  error?: { code: ImageCropErrorCode; message: string };
}

/** @deprecated Use ImageCropResult */
export type CropResult = ImageCropResult;

export class ImageCropError extends Error {
  readonly code: ImageCropErrorCode;

  constructor(code: ImageCropErrorCode, message: string) {
    super(message);
    this.name = "ImageCropError";
    this.code = code;
  }
}

type ImageFieldConfig = z.infer<typeof imageFieldConfigSchema>;

const EMPTY_CROP: CropArea = { left: 0, top: 0, width: 0, height: 0 };

function fail(
  code: ImageCropErrorCode,
  message: string,
): ImageCropResult {
  return {
    success: false,
    width: 0,
    height: 0,
    mimeType: "",
    cropArea: EMPTY_CROP,
    outputBuffer: Buffer.alloc(0),
    error: { code, message },
  };
}

function detectMimeFromMagic(buffer: Buffer): AllowedImageMime | null {
  if (buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e) {
    return "image/png";
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return "image/jpeg";
  if (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

function parseRatio(ratio: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio.trim());
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || h === 0) return null;
  return w / h;
}

function ratiosMatch(a: number, b: number, epsilon = 0.02): boolean {
  return Math.abs(a - b) <= epsilon * Math.max(a, b);
}

async function encodeOutput(
  pipeline: ReturnType<typeof sharp>,
  mime: AllowedImageMime,
): Promise<Buffer> {
  if (mime === "image/jpeg") {
    return pipeline.jpeg({ quality: 90 }).toBuffer();
  }
  if (mime === "image/webp") {
    return pipeline.webp({ quality: 90 }).toBuffer();
  }
  return pipeline.png().toBuffer();
}

export class ImageCropService {
  async crop(request: CropRequest): Promise<ImageCropResult> {
    if (
      request.buffer.byteLength === 0 ||
      request.buffer.byteLength > MAX_IMAGE_BYTES
    ) {
      return fail(
        "IMAGE_TOO_LARGE",
        `Image exceeds max size of ${MAX_IMAGE_BYTES} bytes`,
      );
    }

    if (request.mimeType === "image/svg+xml") {
      return fail("IMAGE_MIME_FORBIDDEN", "SVG uploads are forbidden");
    }

    const magic = detectMimeFromMagic(request.buffer);
    if (!magic || !ALLOWED_IMAGE_MIME.includes(magic)) {
      return fail(
        "IMAGE_MIME_UNSUPPORTED",
        "Unsupported or mismatched image MIME type",
      );
    }

    if (
      ALLOWED_IMAGE_MIME.includes(request.mimeType as AllowedImageMime) &&
      request.mimeType !== magic
    ) {
      return fail(
        "IMAGE_MIME_UNSUPPORTED",
        "Declared MIME does not match file contents",
      );
    }

    let width = 0;
    let height = 0;
    let image: ReturnType<typeof sharp>;
    try {
      image = sharp(request.buffer, { failOn: "error" });
      const meta = await image.metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      if (width <= 0 || height <= 0) {
        return fail("IMAGE_CORRUPT", "Image metadata missing dimensions");
      }
    } catch {
      return fail("IMAGE_CORRUPT", "Image file is corrupt or unreadable");
    }

    if (width < request.minimumWidth || height < request.minimumHeight) {
      return fail("IMAGE_TOO_SMALL", "Image too small for required frame");
    }

    const allowUpscale = request.allowUpscale === true;
    if (
      !allowUpscale &&
      (width < request.targetWidth || height < request.targetHeight)
    ) {
      return fail("IMAGE_UPSCALE_FORBIDDEN", "Upscale is not allowed");
    }

    const targetRatio = request.targetWidth / request.targetHeight;
    if (request.expectedRatio) {
      const expected = parseRatio(request.expectedRatio);
      if (expected === null) {
        return fail("IMAGE_RATIO_INVALID", "Invalid expectedRatio format");
      }
      if (!ratiosMatch(targetRatio, expected)) {
        return fail(
          "IMAGE_RATIO_INVALID",
          "Target dimensions do not match expectedRatio",
        );
      }
      const sourceRatio = width / height;
      const drift = Math.max(sourceRatio / expected, expected / sourceRatio);
      if (drift > 2) {
        return fail(
          "IMAGE_RATIO_INVALID",
          "Source aspect ratio too far from expectedRatio",
        );
      }
    }

    const sourceRatio = width / height;
    let cropWidth = width;
    let cropHeight = height;
    if (sourceRatio > targetRatio) {
      cropWidth = Math.round(height * targetRatio);
    } else {
      cropHeight = Math.round(width / targetRatio);
    }

    const focalX = request.focalX ?? 0.5;
    const focalY = request.focalY ?? 0.5;
    const left = Math.min(
      Math.max(0, Math.round(focalX * width - cropWidth / 2)),
      width - cropWidth,
    );
    const top = Math.min(
      Math.max(0, Math.round(focalY * height - cropHeight / 2)),
      height - cropHeight,
    );

    const cropArea: CropArea = {
      left,
      top,
      width: cropWidth,
      height: cropHeight,
    };

    try {
      const processed = image
        .extract({ left, top, width: cropWidth, height: cropHeight })
        .resize(request.targetWidth, request.targetHeight, {
          fit: "fill",
          withoutEnlargement: !allowUpscale,
        });

      const outputBuffer = await encodeOutput(processed, magic);

      return {
        success: true,
        width: request.targetWidth,
        height: request.targetHeight,
        mimeType: magic,
        cropArea,
        outputBuffer,
      };
    } catch {
      return fail("IMAGE_CORRUPT", "Failed to crop or encode image");
    }
  }

  async cropOrThrow(request: CropRequest): Promise<ImageCropResult> {
    const result = await this.crop(request);
    if (!result.success) {
      throw new ImageCropError(
        result.error?.code ?? "IMAGE_CORRUPT",
        result.error?.message ?? "Image crop failed",
      );
    }
    return result;
  }
}

export async function cropForTemplateField(
  buffer: Buffer,
  mimeType: string,
  field: ImageFieldConfig,
  targetWidth: number,
  targetHeight: number,
  focal?: { focalX?: number; focalY?: number },
): Promise<ImageCropResult> {
  return imageCropService.crop({
    buffer,
    mimeType,
    targetWidth,
    targetHeight,
    minimumWidth: field.minimumWidth,
    minimumHeight: field.minimumHeight,
    expectedRatio: field.expectedRatio,
    allowUpscale: field.allowUpscale,
    focalX: focal?.focalX,
    focalY: focal?.focalY,
  });
}

export const imageCropService = new ImageCropService();
