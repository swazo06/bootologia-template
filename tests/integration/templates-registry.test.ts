import { describe, expect, it, beforeEach } from "vitest";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { TemplateRegistry } from "@/features/templates/template-registry";
import { InMemoryBrandRepository } from "@/server/repositories/brand-repository";
import { InMemoryTemplateRepository } from "@/server/repositories/template-repository";
import { TemplateService } from "@/server/services/template-service";

const brandPayload = {
  name: "BotoSchool",
  slug: "botoschool",
  description: "École",
  defaultLanguage: "fr",
  availableLanguages: ["fr"],
  primaryColor: "#111111",
  secondaryColor: "#666666",
  accentColor: "#D7FF00",
  logoUrl: "https://storage.local/logo.png",
  toneOfVoice: "clair",
  targetAudience: "adultes",
  preferredCTAs: [],
  forbiddenWords: [],
  requiredTerms: [],
  defaultHashtags: [],
  visualGuidelines: "Canevas verrouillés",
  isActive: true,
};

describe("template-service", () => {
  let brandRepo: InMemoryBrandRepository;
  let templateRepo: InMemoryTemplateRepository;
  let service: TemplateService;

  beforeEach(async () => {
    brandRepo = new InMemoryBrandRepository();
    templateRepo = new InMemoryTemplateRepository();
    await brandRepo.create(brandPayload);
    service = new TemplateService(
      new TemplateRegistry(),
      templateRepo,
      brandRepo,
    );
  });

  it("loads poster and carousel ACTIVE templates for a brand", async () => {
    const list = await service.listByBrandSlug("botoschool");
    const ids = list.map((t) => t.id).sort();
    expect(ids).toContain("poster-service-v1");
    expect(ids).toContain("carousel-educational-v1");
  });

  it("syncs FS templates into repository", async () => {
    const synced = await service.syncBrandTemplates("botoschool");
    expect(synced.length).toBeGreaterThanOrEqual(2);
    const byBrand = await templateRepo.listByBrandId(
      (await brandRepo.findBySlug("botoschool"))!.id,
    );
    expect(byBrand.length).toBe(synced.length);
  });

  it("returns usable template for ACTIVE config", async () => {
    const usable = await service.getUsable("botoschool", "poster-service-v1");
    expect(usable.loaded.config.status).toBe("ACTIVE");
    expect(usable.record.status).toBe("ACTIVE");
  });

  it("rejects when brand is missing or inactive", async () => {
    await expect(service.listByBrandSlug("unknown")).rejects.toThrow(
      "BRAND_NOT_FOUND",
    );
    const brand = await brandRepo.findBySlug("botoschool");
    await brandRepo.update(brand!.id, { isActive: false });
    await expect(service.listByBrandSlug("botoschool")).rejects.toThrow(
      "BRAND_INACTIVE",
    );
  });

  it("rejects ARCHIVED template as not usable", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-reg-"));
    const brandDir = path.join(tmpRoot, "botoschool", "archived-v1");
    await fs.mkdir(brandDir, { recursive: true });
    const config = {
      id: "archived-v1",
      brand: "botoschool",
      name: "Archived",
      type: "POSTER",
      status: "ARCHIVED",
      version: 1,
      format: "PORTRAIT",
      dimensions: { width: 1080, height: 1350 },
      source: { svg: "template.svg", preview: "preview.png" },
      fonts: [{ family: "Inter", required: true, fallback: "Arial" }],
      colors: {
        background: "#FFFFFF",
        primary: "#111111",
        secondary: "#666666",
        accent: "#D7FF00",
      },
      fields: {
        headline: {
          type: "text",
          required: true,
          placeholder: "{{HEADLINE}}",
          maxCharacters: 42,
          maxWords: 7,
          maxLines: 3,
          fontSize: { default: 72, min: 58, max: 72 },
        },
      },
      export: { format: "png", quality: 100, width: 1080, height: 1350 },
    };
    await fs.writeFile(
      path.join(brandDir, "config.json"),
      JSON.stringify(config),
      "utf8",
    );
    await fs.writeFile(
      path.join(brandDir, "template.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><text>{{HEADLINE}}</text></svg>`,
      "utf8",
    );

    const registry = new TemplateRegistry(tmpRoot);
    const localService = new TemplateService(registry, templateRepo, brandRepo);
    await expect(
      localService.getUsable("botoschool", "archived-v1"),
    ).rejects.toThrow("TEMPLATE_NOT_USABLE");
  });

  it("rejects brand mismatch in config", async () => {
    const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), "tpl-mis-"));
    const brandDir = path.join(tmpRoot, "botoschool", "mismatch-v1");
    await fs.mkdir(brandDir, { recursive: true });
    const config = {
      id: "mismatch-v1",
      brand: "other-brand",
      name: "Mismatch",
      type: "POSTER",
      status: "ACTIVE",
      version: 1,
      format: "PORTRAIT",
      dimensions: { width: 1080, height: 1350 },
      source: { svg: "template.svg", preview: "preview.png" },
      fonts: [{ family: "Inter", required: true, fallback: "Arial" }],
      colors: {
        background: "#FFFFFF",
        primary: "#111111",
        secondary: "#666666",
        accent: "#D7FF00",
      },
      fields: {
        headline: {
          type: "text",
          required: true,
          placeholder: "{{HEADLINE}}",
          maxCharacters: 42,
          maxWords: 7,
          maxLines: 3,
          fontSize: { default: 72, min: 58, max: 72 },
        },
      },
      export: { format: "png", quality: 100, width: 1080, height: 1350 },
    };
    await fs.writeFile(
      path.join(brandDir, "config.json"),
      JSON.stringify(config),
      "utf8",
    );
    await fs.writeFile(
      path.join(brandDir, "template.svg"),
      `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350"><text>{{HEADLINE}}</text></svg>`,
      "utf8",
    );

    const registry = new TemplateRegistry(tmpRoot);
    const localService = new TemplateService(registry, templateRepo, brandRepo);
    await expect(
      localService.syncBrandTemplates("botoschool"),
    ).rejects.toThrow("TEMPLATE_BRAND_MISMATCH");
  });
});
