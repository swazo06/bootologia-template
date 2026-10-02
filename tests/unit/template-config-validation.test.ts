import { describe, expect, it } from "vitest";
import { readFileSync, promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  extractPlaceholders,
  validateTemplateConsistency,
  validateTemplateDirectory,
} from "@/features/templates/template-registry";
import {
  parseTemplateConfig,
  validatePlaceholdersBidirectional,
  validateTemplateFields,
  validateTemplateStructure,
  validateLockedProperties,
} from "@/features/templates/template-validator";
import { templateConfigSchema } from "@/lib/validation/schemas";
import { FORMAT_DIMENSIONS } from "@/features/templates/locked-properties";

describe("template-config-validation", () => {
  const dir = path.join(
    process.cwd(),
    "templates/brands/botoschool/poster-service-v1",
  );
  const raw = JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8"));
  const config = templateConfigSchema.parse(raw);
  const svg = readFileSync(path.join(dir, "template.svg"), "utf8");

  it("every declared placeholder exists in SVG", () => {
    const svgPlaceholders = extractPlaceholders(svg);
    for (const field of Object.values(config.fields)) {
      expect(svgPlaceholders).toContain(field.placeholder);
    }
  });

  it("every SVG placeholder is declared in config", () => {
    const issues = validatePlaceholdersBidirectional(config, {
      "template.svg": svg,
    });
    expect(
      issues.filter((i) => i.code === "UNDECLARED_SVG_PLACEHOLDER"),
    ).toHaveLength(0);
  });

  it("dimensions are positive and match format", () => {
    expect(config.dimensions.width).toBeGreaterThan(0);
    expect(config.dimensions.height).toBeGreaterThan(0);
    const expected = FORMAT_DIMENSIONS[config.format];
    expect(config.dimensions.width).toBe(expected.width);
    expect(config.dimensions.height).toBe(expected.height);
  });

  it("font sizes respect min <= default <= max", () => {
    for (const field of Object.values(config.fields)) {
      if (field.type !== "text") continue;
      expect(field.fontSize.min).toBeLessThanOrEqual(field.fontSize.default);
      expect(field.fontSize.default).toBeLessThanOrEqual(field.fontSize.max);
    }
  });

  it("validates the on-disk poster template directory as ok", async () => {
    const result = await validateTemplateDirectory(dir);
    expect(result.ok).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects missing SVG placeholder", () => {
    const parsed = templateConfigSchema.parse({
      ...raw,
      fields: {
        ...raw.fields,
        headline: {
          ...raw.fields.headline,
          placeholder: "{{MISSING_HEADLINE}}",
        },
      },
    });
    const issues = validatePlaceholdersBidirectional(parsed, {
      "template.svg": svg,
    });
    expect(issues.some((i) => i.code === "MISSING_SVG_PLACEHOLDER")).toBe(true);
  });

  it("rejects undeclared SVG placeholder", () => {
    const issues = validatePlaceholdersBidirectional(config, {
      "template.svg": `${svg}\n<text>{{EXTRA}}</text>`,
    });
    expect(issues.some((i) => i.code === "UNDECLARED_SVG_PLACEHOLDER")).toBe(
      true,
    );
  });

  it("rejects invalid font size range at schema or field validation", () => {
    const parsed = templateConfigSchema.safeParse({
      ...raw,
      fields: {
        ...raw.fields,
        headline: {
          ...raw.fields.headline,
          fontSize: { default: 40, min: 50, max: 60 },
        },
      },
    });
    if (!parsed.success) {
      expect(parsed.success).toBe(false);
      return;
    }
    const issues = validateTemplateFields(parsed.data);
    expect(issues.some((i) => i.code === "INVALID_FONT_SIZE_RANGE")).toBe(true);
  });

  it("rejects format/dimension mismatch", () => {
    const parsed = templateConfigSchema.parse({
      ...raw,
      format: "SQUARE",
      dimensions: { width: 1080, height: 1350 },
      export: { ...raw.export, width: 1080, height: 1350 },
    });
    const issues = validateTemplateStructure(parsed);
    expect(issues.some((i) => i.code === "FORMAT_DIMENSION_MISMATCH")).toBe(
      true,
    );
  });

  it("rejects forbidden user controls and SVG dimension drift", () => {
    const issues = validateLockedProperties(
      config,
      { "template.svg": svg.replace('width="1080"', 'width="900"') },
      { ...raw, freeColorPicker: true },
    );
    expect(issues.some((i) => i.code === "FORBIDDEN_USER_CONTROL")).toBe(true);
    expect(issues.some((i) => i.code === "SVG_DIMENSION_MISMATCH")).toBe(true);
  });

  it("rejects invalid config.json and invalid SVG markup", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-val-"));
    await fs.writeFile(path.join(tmp, "config.json"), "{not-json", "utf8");
    const invalidConfig = await validateTemplateDirectory(tmp);
    expect(invalidConfig.ok).toBe(false);
    expect(invalidConfig.issues.some((i) => i.code === "INVALID_CONFIG")).toBe(
      true,
    );

    const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-val2-"));
    await fs.writeFile(
      path.join(tmp2, "config.json"),
      JSON.stringify(raw),
      "utf8",
    );
    await fs.writeFile(path.join(tmp2, "template.svg"), "not-an-svg", "utf8");
    await fs.writeFile(path.join(tmp2, "preview.png"), Buffer.from([1, 2, 3]));
    const invalidSvg = await validateTemplateDirectory(tmp2);
    expect(invalidSvg.issues.some((i) => i.code === "INVALID_SVG")).toBe(true);
  });

  it("rejects missing source files", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-miss-"));
    await fs.writeFile(
      path.join(tmp, "config.json"),
      JSON.stringify(raw),
      "utf8",
    );
    const result = await validateTemplateDirectory(tmp);
    expect(result.issues.some((i) => i.code === "MISSING_SOURCE_FILE")).toBe(
      true,
    );
    expect(result.issues.some((i) => i.code === "MISSING_PREVIEW_FILE")).toBe(
      true,
    );
  });

  it("parseTemplateConfig returns INVALID_CONFIG for bad payloads", () => {
    const result = parseTemplateConfig({ id: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toBe("INVALID_CONFIG");
    }
  });

  it("full consistency helper aggregates checks", () => {
    const issues = validateTemplateConsistency(config, {
      "template.svg": svg,
    });
    expect(issues).toHaveLength(0);
  });
});
