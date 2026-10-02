import { promises as fs } from "node:fs";
import path from "node:path";
import type { TemplateConfig } from "@/lib/validation/schemas";
import {
  assertTemplateValid,
  parseTemplateConfig,
  validateTemplateDirectory,
} from "@/features/templates/template-validator";

export type { TemplateValidationIssue } from "@/features/templates/template-validator";
export {
  extractPlaceholders,
  validateTemplateConsistency,
  validateTemplateDirectory,
  assertTemplateValid,
} from "@/features/templates/template-validator";

export interface LoadedTemplate {
  brandSlug: string;
  dir: string;
  config: TemplateConfig;
  svgFiles: Record<string, string>;
}

export class TemplateRegistry {
  constructor(
    private readonly rootPath = path.join(process.cwd(), "templates", "brands"),
  ) {}

  async listBrandSlugs(): Promise<string[]> {
    const entries = await fs.readdir(this.rootPath, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async listTemplateIds(brandSlug: string): Promise<string[]> {
    const brandDir = path.join(this.rootPath, brandSlug);
    const entries = await fs.readdir(brandDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  async readConfig(
    brandSlug: string,
    templateId: string,
  ): Promise<TemplateConfig> {
    const dir = path.join(this.rootPath, brandSlug, templateId);
    const configRaw = await fs.readFile(path.join(dir, "config.json"), "utf8");
    const parsed = parseTemplateConfig(JSON.parse(configRaw));
    if (!parsed.ok) {
      throw new Error(
        `INVALID_CONFIG: ${parsed.issues.map((i) => i.message).join("; ")}`,
      );
    }
    return parsed.config;
  }

  async loadSvgFiles(
    brandSlug: string,
    templateId: string,
    config: TemplateConfig,
  ): Promise<Record<string, string>> {
    const dir = path.join(this.rootPath, brandSlug, templateId);
    const svgFiles: Record<string, string> = {};
    if (config.type === "POSTER") {
      const svgName = config.source.svg;
      svgFiles[svgName] = await fs.readFile(path.join(dir, svgName), "utf8");
    } else if (config.slides) {
      for (const slide of config.slides) {
        svgFiles[slide.svg] = await fs.readFile(
          path.join(dir, slide.svg),
          "utf8",
        );
      }
    }
    return svgFiles;
  }

  async validateTemplate(
    brandSlug: string,
    templateId: string,
  ): Promise<ReturnType<typeof validateTemplateDirectory>> {
    const dir = path.join(this.rootPath, brandSlug, templateId);
    return validateTemplateDirectory(dir);
  }

  async loadTemplate(
    brandSlug: string,
    templateId: string,
  ): Promise<LoadedTemplate> {
    const dir = path.join(this.rootPath, brandSlug, templateId);
    const result = await validateTemplateDirectory(dir);
    const config = assertTemplateValid(result, templateId);
    const svgFiles = await this.loadSvgFiles(brandSlug, templateId, config);
    return { brandSlug, dir, config, svgFiles };
  }

  async listTemplates(brandSlug: string): Promise<TemplateConfig[]> {
    const ids = await this.listTemplateIds(brandSlug);
    const configs: TemplateConfig[] = [];
    for (const id of ids) {
      try {
        const loaded = await this.loadTemplate(brandSlug, id);
        configs.push(loaded.config);
      } catch {
        // Skip invalid/archived during ACTIVE listing
      }
    }
    return configs;
  }
}

export const templateRegistry = new TemplateRegistry();
