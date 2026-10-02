import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  templateRenderer,
  TemplateRenderError,
} from "@/features/designs/template-renderer";
import { templateConfigSchema } from "@/lib/validation/schemas";
import type { ImageCropResult } from "@/features/designs/image-crop-service";
import type { TextFitResult } from "@/features/designs/text-fit-service";

const dir = path.join(
  process.cwd(),
  "templates/brands/botoschool/poster-service-v1",
);
const config = templateConfigSchema.parse(
  JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8")),
);
const sourceSvg = readFileSync(path.join(dir, "template.svg"), "utf8");

const baseValues = {
  label: "Formation",
  headline: "Titre court",
  subtitle: "Sous-titre de test pour rendu",
  cta: "Go",
  mainImage: "https://example.com/a.jpg",
};

describe("template-renderer", () => {
  it("does not mutate the source SVG file on disk", () => {
    const before = readFileSync(path.join(dir, "template.svg"), "utf8");
    templateRenderer.renderSvg({
      sourceSvg: before,
      config,
      values: baseValues,
    });
    const after = readFileSync(path.join(dir, "template.svg"), "utf8");
    expect(after).toBe(before);
  });

  it("rejects non-ACTIVE templates", () => {
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg,
        config: { ...config, status: "ARCHIVED" },
        values: baseValues,
      }),
    ).toThrow(TemplateRenderError);
    try {
      templateRenderer.renderSvg({
        sourceSvg,
        config: { ...config, status: "ARCHIVED" },
        values: baseValues,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(TemplateRenderError);
      if (error instanceof TemplateRenderError) {
        expect(error.code).toBe("TEMPLATE_NOT_ACTIVE");
      }
    }
  });

  it("rejects disallowed value fields", () => {
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg,
        config,
        values: { ...baseValues, layoutHint: "center" },
      }),
    ).toThrow(/DISALLOWED_FIELD/);
  });

  it("rejects missing placeholders", () => {
    const broken = sourceSvg.replace("{{LABEL}}", "STATIC");
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg: broken,
        config,
        values: baseValues,
      }),
    ).toThrow(/MISSING_PLACEHOLDER/);
  });

  it("rejects duplicate placeholders", () => {
    const dup = sourceSvg.replace(
      "{{LABEL}}",
      "{{LABEL}}</text><text>{{LABEL}}",
    );
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg: dup,
        config,
        values: baseValues,
      }),
    ).toThrow(/DUPLICATE_PLACEHOLDER/);
  });

  it("rejects missing required images", () => {
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg,
        config,
        values: { ...baseValues, mainImage: "" },
      }),
    ).toThrow(/MISSING_IMAGE/);
  });

  it("injects cropped image as data URL", () => {
    const cropped: ImageCropResult = {
      success: true,
      width: 1080,
      height: 1350,
      mimeType: "image/png",
      cropArea: { left: 0, top: 0, width: 1080, height: 1350 },
      outputBuffer: Buffer.from("fake-png-bytes"),
    };
    const result = templateRenderer.renderSvg({
      sourceSvg,
      config,
      values: { ...baseValues, mainImage: "" },
      croppedImages: { mainImage: cropped },
    });
    expect(result.svg).toContain("data:image/png;base64,");
    expect(result.svg).not.toContain("{{MAIN_IMAGE}}");
  });

  it("applies fitted font-size from TextFitResult", () => {
    const shrink: TextFitResult = {
      success: true,
      renderedText: "Titre shrink",
      fontSize: 58,
      lineCount: 1,
      overflow: false,
      lines: ["Titre shrink"],
    };
    const result = templateRenderer.renderSvg({
      sourceSvg,
      config,
      values: baseValues,
      textFits: {
        label: {
          success: true,
          renderedText: "Formation",
          fontSize: 24,
          lineCount: 1,
          overflow: false,
          lines: ["Formation"],
        },
        headline: shrink,
        subtitle: {
          success: true,
          renderedText: baseValues.subtitle,
          fontSize: 32,
          lineCount: 1,
          overflow: false,
          lines: [baseValues.subtitle],
        },
        cta: {
          success: true,
          renderedText: "Go",
          fontSize: 26,
          lineCount: 1,
          overflow: false,
          lines: ["Go"],
        },
      },
    });
    expect(result.appliedFontSizes.headline).toBe(58);
    expect(result.svg).toMatch(/font-size="58"[^>]*>Titre shrink</);
  });

  it("throws TEXT_OVERFLOW when fit fails", () => {
    const overflow: TextFitResult = {
      success: false,
      renderedText: "x",
      fontSize: 58,
      lineCount: 1,
      overflow: true,
      lines: ["x"],
      reason: "TEXT_OVERFLOW",
    };
    expect(() =>
      templateRenderer.renderSvg({
        sourceSvg,
        config,
        values: baseValues,
        textFits: {
          label: {
            success: true,
            renderedText: "Formation",
            fontSize: 24,
            lineCount: 1,
            overflow: false,
            lines: ["Formation"],
          },
          headline: overflow,
          subtitle: {
            success: true,
            renderedText: baseValues.subtitle,
            fontSize: 32,
            lineCount: 1,
            overflow: false,
            lines: [baseValues.subtitle],
          },
          cta: {
            success: true,
            renderedText: "Go",
            fontSize: 26,
            lineCount: 1,
            overflow: false,
            lines: ["Go"],
          },
        },
      }),
    ).toThrow(/TEXT_OVERFLOW/);
  });
});
