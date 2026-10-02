import path from "node:path";
import type { BrandRecord } from "@/server/repositories/brand-repository";
import { getBrandRepository } from "@/server/repositories/brand-repository";
import {
  TemplateRegistry,
  templateRegistry,
  type LoadedTemplate,
} from "@/features/templates/template-registry";
import {
  getTemplateRepository,
  type TemplateRecord,
  type TemplateRepository,
} from "@/server/repositories/template-repository";
import type { TemplateConfig } from "@/lib/validation/schemas";

export type UsableTemplate = {
  record: TemplateRecord;
  loaded: LoadedTemplate;
};

export class TemplateService {
  constructor(
    private readonly registry: TemplateRegistry = templateRegistry,
    private readonly templateRepo: TemplateRepository = getTemplateRepository(),
    private readonly brandRepo = getBrandRepository(),
  ) {}

  private async resolveBrandBySlug(brandSlug: string): Promise<BrandRecord> {
    const brand = await this.brandRepo.findBySlug(brandSlug);
    if (!brand) {
      throw new Error("BRAND_NOT_FOUND");
    }
    if (!brand.isActive) {
      throw new Error("BRAND_INACTIVE");
    }
    return brand;
  }

  async syncBrandTemplates(brandSlug: string): Promise<TemplateRecord[]> {
    const brand = await this.resolveBrandBySlug(brandSlug);
    const ids = await this.registry.listTemplateIds(brandSlug);
    const synced: TemplateRecord[] = [];

    for (const templateId of ids) {
      const config = await this.registry.readConfig(brandSlug, templateId);
      if (config.brand !== brandSlug) {
        throw new Error("TEMPLATE_BRAND_MISMATCH");
      }
      const record = await this.templateRepo.upsertForBrand({
        brandId: brand.id,
        name: config.name,
        type: config.type,
        format: config.format,
        version: config.version,
        status: config.status,
        sourcePath: `${brandSlug}/${templateId}`,
        configPath: `${brandSlug}/${templateId}/config.json`,
        previewPath: `${brandSlug}/${templateId}/${config.source.preview}`,
      });
      synced.push(record);
    }
    return synced;
  }

  async listByBrandSlug(brandSlug: string): Promise<TemplateConfig[]> {
    await this.resolveBrandBySlug(brandSlug);
    return this.registry.listTemplates(brandSlug);
  }

  async listByBrandId(brandId: string): Promise<TemplateConfig[]> {
    const brand = await this.brandRepo.findById(brandId);
    if (!brand) throw new Error("BRAND_NOT_FOUND");
    if (!brand.isActive) throw new Error("BRAND_INACTIVE");
    return this.listByBrandSlug(brand.slug);
  }

  async getUsable(
    brandSlug: string,
    templateId: string,
  ): Promise<UsableTemplate> {
    const brand = await this.resolveBrandBySlug(brandSlug);
    const loaded = await this.registry.loadTemplate(brandSlug, templateId);

    if (loaded.config.brand !== brand.slug) {
      throw new Error("TEMPLATE_BRAND_MISMATCH");
    }
    if (loaded.config.status !== "ACTIVE") {
      throw new Error("TEMPLATE_NOT_USABLE");
    }

    const record = await this.templateRepo.upsertForBrand({
      brandId: brand.id,
      name: loaded.config.name,
      type: loaded.config.type,
      format: loaded.config.format,
      version: loaded.config.version,
      status: loaded.config.status,
      sourcePath: `${brandSlug}/${templateId}`,
      configPath: `${brandSlug}/${templateId}/config.json`,
      previewPath: path.posix.join(
        brandSlug,
        templateId,
        loaded.config.source.preview,
      ),
    });

    if (record.status !== "ACTIVE") {
      throw new Error("TEMPLATE_NOT_USABLE");
    }

    return { record, loaded };
  }
}

export function createTemplateService(
  registry?: TemplateRegistry,
  repo?: TemplateRepository,
): TemplateService {
  return new TemplateService(
    registry,
    repo,
    getBrandRepository(),
  );
}
