import { promises as fs } from "node:fs";
import path from "node:path";
import {
  templateConfigSchema,
  type TemplateConfig,
} from "@/lib/validation/schemas";
import {
  ALLOWED_DYNAMIC_FIELDS,
  FORBIDDEN_USER_CONTROLS,
  FORMAT_DIMENSIONS,
  LOCKED_TEMPLATE_PROPERTIES,
  NON_VISUAL_DYNAMIC_FIELDS,
} from "@/features/templates/locked-properties";

export const PLACEHOLDER_REGEX = /\{\{[A-Z0-9_]+\}\}/g;

export type TemplateValidationCode =
  | "INVALID_CONFIG"
  | "INVALID_SVG"
  | "INVALID_DIMENSIONS"
  | "FORMAT_DIMENSION_MISMATCH"
  | "EXPORT_DIMENSION_MISMATCH"
  | "MISSING_SVG_PLACEHOLDER"
  | "UNDECLARED_SVG_PLACEHOLDER"
  | "INVALID_FONT_SIZE_RANGE"
  | "MISSING_REQUIRED_FONT"
  | "MISSING_SOURCE_FILE"
  | "MISSING_PREVIEW_FILE"
  | "INVALID_FIELD"
  | "DISALLOWED_DYNAMIC_FIELD"
  | "FORBIDDEN_USER_CONTROL"
  | "LOCKED_PROPERTY_VIOLATION"
  | "TEMPLATE_NOT_USABLE"
  | "SVG_DIMENSION_MISMATCH";

export interface TemplateValidationIssue {
  code: TemplateValidationCode;
  message: string;
  field?: string;
}

export interface TemplateValidationResult {
  ok: boolean;
  issues: TemplateValidationIssue[];
  config?: TemplateConfig;
}

export function extractPlaceholders(svg: string): string[] {
  const matches = svg.match(PLACEHOLDER_REGEX) ?? [];
  return [...new Set(matches)];
}

function isValidSvgMarkup(svg: string): boolean {
  const trimmed = svg.trim();
  if (!trimmed.startsWith("<svg") && !trimmed.startsWith("<?xml")) {
    return false;
  }
  return /<\/svg>\s*$/i.test(trimmed) || /<svg[\s\S]*\/?>/i.test(trimmed);
}

function readSvgCanvasSize(
  svg: string,
): { width: number; height: number } | null {
  const widthMatch = svg.match(/\bwidth="(\d+(?:\.\d+)?)"/i);
  const heightMatch = svg.match(/\bheight="(\d+(?:\.\d+)?)"/i);
  const viewBoxMatch = svg.match(
    /\bviewBox="\s*([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s*"/i,
  );
  if (widthMatch && heightMatch) {
    return {
      width: Number(widthMatch[1]),
      height: Number(heightMatch[1]),
    };
  }
  if (viewBoxMatch) {
    return {
      width: Number(viewBoxMatch[3]),
      height: Number(viewBoxMatch[4]),
    };
  }
  return null;
}

export function validatePlaceholdersBidirectional(
  config: TemplateConfig,
  svgContents: Record<string, string>,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];
  const svgBlob = Object.values(svgContents).join("\n");
  const svgPlaceholders = extractPlaceholders(svgBlob);

  const visualFieldEntries = Object.entries(config.fields).filter(
    ([name]) =>
      !(NON_VISUAL_DYNAMIC_FIELDS as readonly string[]).includes(name),
  );

  for (const [name, field] of visualFieldEntries) {
    if (!svgPlaceholders.includes(field.placeholder)) {
      issues.push({
        code: "MISSING_SVG_PLACEHOLDER",
        field: name,
        message: `Declared placeholder ${field.placeholder} missing from SVG`,
      });
    }
  }

  const declared = new Set(
    Object.values(config.fields).map((field) => field.placeholder),
  );
  for (const placeholder of svgPlaceholders) {
    if (!declared.has(placeholder)) {
      issues.push({
        code: "UNDECLARED_SVG_PLACEHOLDER",
        message: `SVG placeholder ${placeholder} not declared in config.json`,
      });
    }
  }

  return issues;
}

export function validateTemplateStructure(
  config: TemplateConfig,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  if (config.dimensions.width <= 0 || config.dimensions.height <= 0) {
    issues.push({
      code: "INVALID_DIMENSIONS",
      message: "Dimensions must be positive",
    });
  }

  const expected = FORMAT_DIMENSIONS[config.format];
  if (
    expected &&
    (config.dimensions.width !== expected.width ||
      config.dimensions.height !== expected.height)
  ) {
    issues.push({
      code: "FORMAT_DIMENSION_MISMATCH",
      message: `Format ${config.format} requires ${expected.width}x${expected.height}, got ${config.dimensions.width}x${config.dimensions.height}`,
    });
  }

  if (
    config.export.width !== config.dimensions.width ||
    config.export.height !== config.dimensions.height
  ) {
    issues.push({
      code: "EXPORT_DIMENSION_MISMATCH",
      message: "Export dimensions must match template dimensions",
    });
  }

  if (!config.fonts.some((font) => font.required)) {
    issues.push({
      code: "MISSING_REQUIRED_FONT",
      message: "At least one required font must be declared",
    });
  }

  for (const font of config.fonts) {
    if (!font.family.trim()) {
      issues.push({
        code: "MISSING_REQUIRED_FONT",
        message: "Font family cannot be empty",
      });
    }
  }

  if (config.status === "ARCHIVED" || config.status === "INVALID") {
    issues.push({
      code: "TEMPLATE_NOT_USABLE",
      message: `Template status ${config.status} cannot be used`,
    });
  }

  return issues;
}

export function validateTemplateFields(
  config: TemplateConfig,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  for (const [name, field] of Object.entries(config.fields)) {
    if (!(ALLOWED_DYNAMIC_FIELDS as readonly string[]).includes(name)) {
      issues.push({
        code: "DISALLOWED_DYNAMIC_FIELD",
        field: name,
        message: `Field ${name} is not an allowed dynamic field`,
      });
    }

    if (!/^\{\{[A-Z0-9_]+\}\}$/.test(field.placeholder)) {
      issues.push({
        code: "INVALID_FIELD",
        field: name,
        message: `Invalid placeholder syntax for ${name}`,
      });
    }

    if (field.type === "text") {
      if (
        field.maxCharacters <= 0 ||
        field.maxWords <= 0 ||
        field.maxLines <= 0
      ) {
        issues.push({
          code: "INVALID_FIELD",
          field: name,
          message: `Text limits must be positive for ${name}`,
        });
      }
      const { min, default: def, max } = field.fontSize;
      if (!(min <= def && def <= max)) {
        issues.push({
          code: "INVALID_FONT_SIZE_RANGE",
          field: name,
          message: `fontSize must satisfy min <= default <= max for ${name}`,
        });
      }
    }

    if (field.type === "image") {
      if (field.minimumWidth <= 0 || field.minimumHeight <= 0) {
        issues.push({
          code: "INVALID_FIELD",
          field: name,
          message: `Image minimum size must be positive for ${name}`,
        });
      }
      if (field.allowUpscale !== false) {
        issues.push({
          code: "INVALID_FIELD",
          field: name,
          message: `Image field ${name} must set allowUpscale to false`,
        });
      }
    }
  }

  return issues;
}

export function validateLockedProperties(
  config: TemplateConfig,
  svgContents: Record<string, string>,
  rawConfig?: Record<string, unknown>,
): TemplateValidationIssue[] {
  const issues: TemplateValidationIssue[] = [];

  if (rawConfig) {
    for (const key of FORBIDDEN_USER_CONTROLS) {
      if (key in rawConfig) {
        issues.push({
          code: "FORBIDDEN_USER_CONTROL",
          message: `Forbidden user control present in config: ${key}`,
        });
      }
    }
    for (const key of Object.keys(rawConfig)) {
      if (
        (LOCKED_TEMPLATE_PROPERTIES as readonly string[]).includes(key) &&
        typeof rawConfig[key] === "object" &&
        rawConfig[key] !== null &&
        "editable" in (rawConfig[key] as object)
      ) {
        issues.push({
          code: "LOCKED_PROPERTY_VIOLATION",
          message: `Locked property ${key} must not be marked editable`,
        });
      }
    }
  }

  // Layout is locked: SVG canvas size must match config dimensions.
  for (const [fileName, svg] of Object.entries(svgContents)) {
    if (!isValidSvgMarkup(svg)) {
      issues.push({
        code: "INVALID_SVG",
        message: `Invalid SVG markup in ${fileName}`,
      });
      continue;
    }
    const size = readSvgCanvasSize(svg);
    if (
      size &&
      (size.width !== config.dimensions.width ||
        size.height !== config.dimensions.height)
    ) {
      issues.push({
        code: "SVG_DIMENSION_MISMATCH",
        message: `SVG ${fileName} canvas ${size.width}x${size.height} must match locked config ${config.dimensions.width}x${config.dimensions.height}`,
      });
    }
  }

  // Brand colors / fonts are the locked source of truth — must be present.
  for (const key of ["background", "primary", "secondary", "accent"] as const) {
    if (!config.colors[key]?.trim()) {
      issues.push({
        code: "LOCKED_PROPERTY_VIOLATION",
        message: `Locked brand color ${key} is missing`,
      });
    }
  }

  return issues;
}

export async function validateReferencedFiles(
  dir: string,
  config: TemplateConfig,
): Promise<TemplateValidationIssue[]> {
  const issues: TemplateValidationIssue[] = [];
  const previewPath = path.join(dir, config.source.preview);
  try {
    await fs.access(previewPath);
  } catch {
    issues.push({
      code: "MISSING_PREVIEW_FILE",
      message: `Missing preview file: ${config.source.preview}`,
    });
  }

  const requiredSvgs =
    config.type === "POSTER"
      ? [config.source.svg]
      : (config.slides ?? []).map((slide) => slide.svg);

  for (const svgName of requiredSvgs) {
    try {
      await fs.access(path.join(dir, svgName));
    } catch {
      issues.push({
        code: "MISSING_SOURCE_FILE",
        message: `Missing SVG source file: ${svgName}`,
      });
    }
  }

  return issues;
}

export function parseTemplateConfig(
  raw: unknown,
):
  | { ok: true; config: TemplateConfig; rawObject: Record<string, unknown> }
  | { ok: false; issues: TemplateValidationIssue[] } {
  if (!raw || typeof raw !== "object") {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_CONFIG",
          message: "config.json must be a JSON object",
        },
      ],
    };
  }
  const parsed = templateConfigSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "INVALID_CONFIG" as const,
        message: issue.message,
        field: issue.path.join("."),
      })),
    };
  }
  return {
    ok: true,
    config: parsed.data,
    rawObject: raw as Record<string, unknown>,
  };
}

export function validateTemplateConsistency(
  config: TemplateConfig,
  svgContents: Record<string, string>,
  rawConfig?: Record<string, unknown>,
): TemplateValidationIssue[] {
  return [
    ...validateTemplateStructure(config),
    ...validateTemplateFields(config),
    ...validatePlaceholdersBidirectional(config, svgContents),
    ...validateLockedProperties(config, svgContents, rawConfig),
  ];
}

export async function validateTemplateDirectory(
  dir: string,
): Promise<TemplateValidationResult> {
  let rawText: string;
  try {
    rawText = await fs.readFile(path.join(dir, "config.json"), "utf8");
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_CONFIG",
          message: "config.json is missing or unreadable",
        },
      ],
    };
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawText);
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_CONFIG",
          message: "config.json is not valid JSON",
        },
      ],
    };
  }

  const parsed = parseTemplateConfig(rawJson);
  if (!parsed.ok) {
    return { ok: false, issues: parsed.issues };
  }

  const { config, rawObject } = parsed;
  const fileIssues = await validateReferencedFiles(dir, config);

  const svgContents: Record<string, string> = {};
  const svgNames =
    config.type === "POSTER"
      ? [config.source.svg]
      : (config.slides ?? []).map((s) => s.svg);

  for (const svgName of svgNames) {
    try {
      svgContents[svgName] = await fs.readFile(path.join(dir, svgName), "utf8");
    } catch {
      // Already reported as MISSING_SOURCE_FILE
    }
  }

  const issues = [
    ...fileIssues,
    ...validateTemplateConsistency(config, svgContents, rawObject),
  ];

  return {
    ok: issues.length === 0,
    issues,
    config,
  };
}

export class TemplateValidationError extends Error {
  readonly issues: TemplateValidationIssue[];

  constructor(message: string, issues: TemplateValidationIssue[]) {
    super(message);
    this.name = "TemplateValidationError";
    this.issues = issues;
  }
}

export function assertTemplateValid(
  result: TemplateValidationResult,
  templateId: string,
): TemplateConfig {
  const blocking = result.issues.filter(
    (issue) => issue.code !== "TEMPLATE_NOT_USABLE",
  );
  if (result.config?.status !== "ACTIVE") {
    throw new TemplateValidationError("TEMPLATE_NOT_USABLE", result.issues);
  }
  if (!result.config || blocking.length > 0) {
    throw new TemplateValidationError(
      `Invalid template ${templateId}: ${blocking.map((i) => i.message).join("; ")}`,
      result.issues,
    );
  }
  return result.config;
}
