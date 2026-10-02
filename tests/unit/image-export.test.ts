import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { templateRenderer } from "@/features/designs/template-renderer";
import {
  imageExportService,
  ImageExportError,
} from "@/features/designs/image-export-service";
import { templateConfigSchema } from "@/lib/validation/schemas";

const dir = path.join(
  process.cwd(),
  "templates/brands/botoschool/poster-service-v1",
);
const config = templateConfigSchema.parse(
  JSON.parse(readFileSync(path.join(dir, "config.json"), "utf8")),
);
const sourceSvg = readFileSync(path.join(dir, "template.svg"), "utf8");

function renderPoster() {
  return templateRenderer.renderSvg({
    sourceSvg,
    config,
    values: {
      label: "Formation",
      headline: "Titre court",
      subtitle: "Sous-titre de test pour export",
      cta: "Go",
      mainImage: "https://example.com/a.jpg",
    },
  });
}

describe("image-export", () => {
  it("exports PNG at exact template dimensions with checksum", async () => {
    const rendered = renderPoster();
    const exported = await imageExportService.exportSvg({
      svg: rendered.svg,
      config,
    });

    expect(exported.width).toBe(1080);
    expect(exported.height).toBe(1350);
    expect(exported.format).toBe("png");
    expect(exported.mimeType).toBe("image/png");
    expect(exported.quality).toBe(100);
    expect(exported.size).toBe(exported.buffer.length);
    expect(exported.size).toBeGreaterThan(0);
    expect(exported.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(exported.buffer[0]).toBe(0x89);
    expect(exported.buffer[1]).toBe(0x50);
  });

  it("exports JPG when format is jpg", async () => {
    const rendered = renderPoster();
    const exported = await imageExportService.exportSvg({
      svg: rendered.svg,
      config: {
        ...config,
        export: { ...config.export, format: "jpg", quality: 85 },
      },
    });

    expect(exported.format).toBe("jpeg");
    expect(exported.mimeType).toBe("image/jpeg");
    expect(exported.width).toBe(1080);
    expect(exported.height).toBe(1350);
    expect(exported.quality).toBe(85);
    expect(exported.buffer[0]).toBe(0xff);
    expect(exported.buffer[1]).toBe(0xd8);
  });

  it("respects JPEG quality in output size", async () => {
    const rendered = renderPoster();
    const low = await imageExportService.exportSvg({
      svg: rendered.svg,
      config: {
        ...config,
        export: { ...config.export, format: "jpeg", quality: 40 },
      },
    });
    const high = await imageExportService.exportSvg({
      svg: rendered.svg,
      config: {
        ...config,
        export: { ...config.export, format: "jpeg", quality: 90 },
      },
    });

    expect(low.quality).toBe(40);
    expect(high.quality).toBe(90);
    expect(low.size).toBeLessThan(high.size);
  });

  it("rejects invalid SVG", async () => {
    await expect(
      imageExportService.exportSvg({
        svg: "<div>not svg</div>",
        config,
      }),
    ).rejects.toMatchObject({ code: "EXPORT_INVALID_SVG" });
  });

  it("rejects unresolved placeholders", async () => {
    await expect(
      imageExportService.exportSvg({
        svg: sourceSvg,
        config,
      }),
    ).rejects.toMatchObject({ code: "EXPORT_UNRESOLVED_PLACEHOLDERS" });
  });

  it("rejects SVG dimension mismatch vs export config", async () => {
    const rendered = renderPoster();
    await expect(
      imageExportService.exportSvg({
        svg: rendered.svg,
        config: {
          ...config,
          export: {
            ...config.export,
            width: 1080,
            height: 1080,
          },
        },
      }),
    ).rejects.toBeInstanceOf(ImageExportError);

    try {
      await imageExportService.exportSvg({
        svg: rendered.svg,
        config: {
          ...config,
          export: {
            ...config.export,
            width: 1080,
            height: 1080,
          },
        },
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ImageExportError);
      if (error instanceof ImageExportError) {
        expect(error.code).toBe("EXPORT_DIMENSION_MISMATCH");
      }
    }
  });
});
