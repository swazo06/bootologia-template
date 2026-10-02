import type { TemplateConfig } from "@/types";
import {
  ALLOWED_DYNAMIC_FIELDS,
  NON_VISUAL_DYNAMIC_FIELDS,
} from "@/features/templates/locked-properties";
import {
  textFitService,
  type TextFitResult,
} from "@/features/designs/text-fit-service";
import type { ImageCropResult } from "@/features/designs/image-crop-service";

export interface RenderTextValues {
  [field: string]: string;
}

export interface RenderResult {
  svg: string;
  appliedFontSizes: Record<string, number>;
}

export type TemplateRenderErrorCode =
  | "TEMPLATE_NOT_ACTIVE"
  | "DISALLOWED_FIELD"
  | "MISSING_PLACEHOLDER"
  | "DUPLICATE_PLACEHOLDER"
  | "MISSING_IMAGE"
  | "TEXT_OVERFLOW"
  | "TEXT_INJECT_FAILED"
  | "INVALID_SVG"
  | "UNRESOLVED_PLACEHOLDERS";

export class TemplateRenderError extends Error {
  readonly code: TemplateRenderErrorCode;

  constructor(code: TemplateRenderErrorCode, message?: string) {
    super(message ?? code);
    this.name = "TemplateRenderError";
    this.code = code;
  }
}

export interface RenderInput {
  sourceSvg: string;
  config: TemplateConfig;
  values: RenderTextValues;
  boxHints?: Record<string, { width: number; height: number }>;
  textFits?: Record<string, TextFitResult>;
  croppedImages?: Record<string, ImageCropResult>;
}

const PLACEHOLDER_RE = /\{\{[A-Z0-9_]+\}\}/g;
const NON_VISUAL = new Set<string>(NON_VISUAL_DYNAMIC_FIELDS);
const ALLOWED = new Set<string>(ALLOWED_DYNAMIC_FIELDS);

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

function assertValidSvg(sourceSvg: string, config: TemplateConfig): void {
  if (!/<svg[\s>]/i.test(sourceSvg)) {
    throw new TemplateRenderError("INVALID_SVG", "Missing svg root element");
  }
  const widthMatch = /<svg[^>]*\bwidth="(\d+)"/i.exec(sourceSvg);
  const heightMatch = /<svg[^>]*\bheight="(\d+)"/i.exec(sourceSvg);
  if (!widthMatch || !heightMatch) {
    throw new TemplateRenderError(
      "INVALID_SVG",
      "SVG missing width/height attributes",
    );
  }
  if (
    Number(widthMatch[1]) !== config.dimensions.width ||
    Number(heightMatch[1]) !== config.dimensions.height
  ) {
    throw new TemplateRenderError(
      "INVALID_SVG",
      "SVG dimensions do not match template config",
    );
  }
}

function assertPlaceholderCardinality(
  svg: string,
  placeholder: string,
  fieldName: string,
): void {
  const count = countOccurrences(svg, placeholder);
  if (count === 0) {
    throw new TemplateRenderError(
      "MISSING_PLACEHOLDER",
      `MISSING_PLACEHOLDER:${fieldName}`,
    );
  }
  if (count > 1) {
    throw new TemplateRenderError(
      "DUPLICATE_PLACEHOLDER",
      `DUPLICATE_PLACEHOLDER:${fieldName}`,
    );
  }
}

function extractAttr(tag: string, name: string): string | null {
  const match = new RegExp(`\\b${name}="([^"]*)"`, "i").exec(tag);
  return match?.[1] ?? null;
}

function buildTspanContent(lines: string[], x: string): string {
  return lines
    .map((line, index) => {
      const dy = index === 0 ? "0" : "1.2em";
      return `<tspan x="${escapeXml(x)}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");
}

/**
 * Replace the text node containing the placeholder: update font-size only,
 * inject tspans for multi-line, leave x/y/font-family/fill untouched.
 */
function injectFittedText(
  svg: string,
  placeholder: string,
  fit: TextFitResult,
): string {
  const textRe = /<text\b[^>]*>[\s\S]*?<\/text>/gi;
  let matched = false;
  const next = svg.replace(textRe, (block) => {
    if (!block.includes(placeholder)) return block;
    matched = true;
    const openEnd = block.indexOf(">");
    if (openEnd < 0) {
      throw new TemplateRenderError(
        "TEXT_INJECT_FAILED",
        "Malformed text element",
      );
    }
    const openTag = block.slice(0, openEnd + 1);
    const x = extractAttr(openTag, "x") ?? "0";
    const updatedOpen = openTag.replace(
      /\bfont-size="[^"]*"/i,
      `font-size="${fit.fontSize}"`,
    );
    const openWithSize = /\bfont-size=/i.test(updatedOpen)
      ? updatedOpen
      : updatedOpen.replace(/>$/, ` font-size="${fit.fontSize}">`);

    const inner =
      fit.lines.length <= 1
        ? escapeXml(fit.renderedText)
        : buildTspanContent(fit.lines, x);

    return `${openWithSize}${inner}</text>`;
  });

  if (!matched) {
    // Fallback: plain placeholder replace (e.g. placeholder outside <text>)
    if (!svg.includes(placeholder)) {
      throw new TemplateRenderError("TEXT_INJECT_FAILED", "Inject target missing");
    }
    return svg.split(placeholder).join(escapeXml(fit.renderedText));
  }
  return next;
}

function toDataUrl(crop: ImageCropResult): string {
  return `data:${crop.mimeType};base64,${crop.outputBuffer.toString("base64")}`;
}

/**
 * Deterministic SVG filler: replaces placeholders only.
 * Never mutates source files — operates on an in-memory copy.
 * Never invents layout — consumes TextFit / ImageCrop results.
 */
export class TemplateRenderer {
  renderSvg(input: RenderInput): RenderResult {
    if (input.config.status !== "ACTIVE") {
      throw new TemplateRenderError(
        "TEMPLATE_NOT_ACTIVE",
        `Template status is ${input.config.status}`,
      );
    }

    assertValidSvg(input.sourceSvg, input.config);

    for (const key of Object.keys(input.values)) {
      if (!ALLOWED.has(key)) {
        throw new TemplateRenderError(
          "DISALLOWED_FIELD",
          `DISALLOWED_FIELD:${key}`,
        );
      }
    }

    let svg = input.sourceSvg;
    const appliedFontSizes: Record<string, number> = {};
    const fontFamily =
      input.config.fonts[0]?.family ??
      input.config.fonts[0]?.fallback ??
      "Inter";

    for (const [fieldName, field] of Object.entries(input.config.fields)) {
      if (!ALLOWED.has(fieldName)) {
        throw new TemplateRenderError(
          "DISALLOWED_FIELD",
          `DISALLOWED_FIELD:${fieldName}`,
        );
      }
      if (NON_VISUAL.has(fieldName)) continue;
      if (field.type !== "text") continue;

      assertPlaceholderCardinality(svg, field.placeholder, fieldName);

      const value = input.values[fieldName] ?? "";
      const provided = input.textFits?.[fieldName];
      let fit: TextFitResult;
      if (provided) {
        fit = provided;
      } else {
        const hint = input.boxHints?.[fieldName] ?? {
          width: input.config.dimensions.width * 0.8,
          height: field.maxLines * field.fontSize.default * 1.2,
        };
        fit = textFitService.fit(value, {
          width: hint.width,
          height: hint.height,
          fontSize: field.fontSize,
          maxLines: field.maxLines,
          fontFamily,
        });
      }

      if (!fit.success) {
        throw new TemplateRenderError(
          "TEXT_OVERFLOW",
          `TEXT_OVERFLOW:${fieldName}`,
        );
      }

      try {
        svg = injectFittedText(svg, field.placeholder, fit);
      } catch (error) {
        if (error instanceof TemplateRenderError) throw error;
        throw new TemplateRenderError(
          "TEXT_INJECT_FAILED",
          `TEXT_INJECT_FAILED:${fieldName}`,
        );
      }
      appliedFontSizes[fieldName] = fit.fontSize;
    }

    for (const [fieldName, field] of Object.entries(input.config.fields)) {
      if (field.type !== "image") continue;
      assertPlaceholderCardinality(svg, field.placeholder, fieldName);

      const cropped = input.croppedImages?.[fieldName];
      const href =
        cropped?.success && cropped.outputBuffer.length > 0
          ? toDataUrl(cropped)
          : (input.values[fieldName] ?? "");

      if (!href && field.required) {
        throw new TemplateRenderError(
          "MISSING_IMAGE",
          `MISSING_IMAGE:${fieldName}`,
        );
      }
      if (href) {
        svg = svg.split(field.placeholder).join(escapeXml(href));
      }
    }

    const leftovers = svg.match(PLACEHOLDER_RE) ?? [];
    if (leftovers.length > 0) {
      throw new TemplateRenderError(
        "UNRESOLVED_PLACEHOLDERS",
        `UNRESOLVED_PLACEHOLDERS:${leftovers.join(",")}`,
      );
    }

    return { svg, appliedFontSizes };
  }
}

export const templateRenderer = new TemplateRenderer();
