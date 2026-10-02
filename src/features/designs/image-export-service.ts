import { createHash } from "node:crypto";
import sharp from "sharp";
import type { TemplateConfig } from "@/types";

export type ImageExportErrorCode =
  | "EXPORT_INVALID_SVG"
  | "EXPORT_UNRESOLVED_PLACEHOLDERS"
  | "EXPORT_MISSING_IMAGE"
  | "EXPORT_MISSING_FONT"
  | "EXPORT_UNSUPPORTED_FORMAT"
  | "EXPORT_DIMENSION_MISMATCH"
  | "EXPORT_SHARP_FAILED";

export class ImageExportError extends Error {
  readonly code: ImageExportErrorCode;

  constructor(code: ImageExportErrorCode, message?: string) {
    super(message ?? code);
    this.name = "ImageExportError";
    this.code = code;
  }
}

export interface ExportResult {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg";
  width: number;
  height: number;
  size: number;
  checksum: string;
  format: "png" | "jpeg";
  quality: number;
}

const PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g;
const ALLOWED_FORMATS = new Set(["png", "jpg", "jpeg"]);

function resolveFormat(
  format: string,
): { format: "png" | "jpeg"; mimeType: "image/png" | "image/jpeg" } {
  if (!ALLOWED_FORMATS.has(format)) {
    throw new ImageExportError(
      "EXPORT_UNSUPPORTED_FORMAT",
      `Unsupported export format: ${format}`,
    );
  }
  if (format === "png") {
    return { format: "png", mimeType: "image/png" };
  }
  return { format: "jpeg", mimeType: "image/jpeg" };
}

function readSvgDimensions(svg: string): { width: number; height: number } {
  if (!/<svg[\s>]/i.test(svg)) {
    throw new ImageExportError("EXPORT_INVALID_SVG", "Missing svg root element");
  }
  const widthMatch = /<svg[^>]*\bwidth="(\d+)"/i.exec(svg);
  const heightMatch = /<svg[^>]*\bheight="(\d+)"/i.exec(svg);
  if (!widthMatch || !heightMatch) {
    throw new ImageExportError(
      "EXPORT_INVALID_SVG",
      "SVG missing width/height attributes",
    );
  }
  return { width: Number(widthMatch[1]), height: Number(heightMatch[1]) };
}

function assertPreExport(svg: string, config: TemplateConfig): void {
  const dims = readSvgDimensions(svg);
  if (
    dims.width !== config.export.width ||
    dims.height !== config.export.height
  ) {
    throw new ImageExportError(
      "EXPORT_DIMENSION_MISMATCH",
      `SVG ${dims.width}x${dims.height} != export ${config.export.width}x${config.export.height}`,
    );
  }
  if (
    dims.width !== config.dimensions.width ||
    dims.height !== config.dimensions.height
  ) {
    throw new ImageExportError(
      "EXPORT_DIMENSION_MISMATCH",
      "SVG dimensions do not match template dimensions",
    );
  }

  const leftovers = svg.match(PLACEHOLDER_RE) ?? [];
  if (leftovers.length > 0) {
    throw new ImageExportError(
      "EXPORT_UNRESOLVED_PLACEHOLDERS",
      `Unresolved placeholders: ${leftovers.join(",")}`,
    );
  }

  for (const [, field] of Object.entries(config.fields)) {
    if (field.type !== "image" || !field.required) continue;
    if (svg.includes(field.placeholder)) {
      throw new ImageExportError(
        "EXPORT_MISSING_IMAGE",
        `Required image placeholder still present: ${field.placeholder}`,
      );
    }
    if (/<image\b[^>]*\bhref=""/.test(svg) || /<image\b[^>]*\bxlink:href=""/.test(svg)) {
      throw new ImageExportError(
        "EXPORT_MISSING_IMAGE",
        "Required image has empty href",
      );
    }
  }

  if (!config.fonts.length) {
    throw new ImageExportError(
      "EXPORT_MISSING_FONT",
      "Template declares no fonts",
    );
  }
  for (const font of config.fonts) {
    if (font.required && !font.family.trim()) {
      throw new ImageExportError(
        "EXPORT_MISSING_FONT",
        "Required font family is empty",
      );
    }
  }

  const allowedFamilies = new Set(
    config.fonts.flatMap((f) =>
      [f.family, f.fallback].map((name) => name.trim().toLowerCase()),
    ),
  );
  const fontFamilyAttrs = [
    ...svg.matchAll(/\bfont-family="([^"]+)"/gi),
  ].map((m) => m[1] ?? "");
  for (const attr of fontFamilyAttrs) {
    const primaries = attr
      .split(",")
      .map((part) => part.trim().replace(/^['"]|['"]$/g, "").toLowerCase())
      .filter(Boolean);
    if (primaries.length === 0) continue;
    const ok = primaries.some((name) => allowedFamilies.has(name));
    if (!ok) {
      throw new ImageExportError(
        "EXPORT_MISSING_FONT",
        `SVG font-family not declared in config: ${attr}`,
      );
    }
  }
}

export class ImageExportService {
  async exportSvg(input: {
    svg: string;
    config: TemplateConfig;
  }): Promise<ExportResult> {
    assertPreExport(input.svg, input.config);

    const { format, mimeType } = resolveFormat(input.config.export.format);
    const width = input.config.export.width;
    const height = input.config.export.height;
    const quality = input.config.export.quality;

    let buffer: Buffer;
    try {
      const pipeline = sharp(Buffer.from(input.svg), {
        density: 150,
      }).resize(width, height, {
        fit: "fill",
      });

      buffer =
        format === "png"
          ? await pipeline.png({ quality }).toBuffer()
          : await pipeline.jpeg({ quality }).toBuffer();
    } catch (error) {
      if (error instanceof ImageExportError) throw error;
      throw new ImageExportError(
        "EXPORT_SHARP_FAILED",
        error instanceof Error ? error.message : "Sharp export failed",
      );
    }

    const meta = await sharp(buffer).metadata();
    if (meta.width !== width || meta.height !== height) {
      throw new ImageExportError(
        "EXPORT_DIMENSION_MISMATCH",
        `Export dimensions mismatch: got ${meta.width}x${meta.height}, expected ${width}x${height}`,
      );
    }

    const checksum = createHash("sha256").update(buffer).digest("hex");

    return {
      buffer,
      mimeType,
      width,
      height,
      size: buffer.length,
      checksum,
      format,
      quality,
    };
  }
}

export const imageExportService = new ImageExportService();
