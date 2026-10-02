import type { ContentFormat, PostType, Template, TemplateStatus } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";

export type TemplateRecord = Template;

export type TemplateUpsertInput = {
  brandId: string;
  name: string;
  type: PostType;
  format: ContentFormat;
  version: number;
  status: TemplateStatus;
  sourcePath: string;
  configPath: string;
  previewPath: string;
};

export interface TemplateRepository {
  upsertForBrand(input: TemplateUpsertInput): Promise<TemplateRecord>;
  listByBrandId(brandId: string): Promise<TemplateRecord[]>;
  findByBrandAndSource(
    brandId: string,
    sourcePath: string,
    version: number,
  ): Promise<TemplateRecord | null>;
  findById(id: string): Promise<TemplateRecord | null>;
}

export class PrismaTemplateRepository implements TemplateRepository {
  async upsertForBrand(input: TemplateUpsertInput): Promise<TemplateRecord> {
    const existing = await this.findByBrandAndSource(
      input.brandId,
      input.sourcePath,
      input.version,
    );
    if (existing) {
      return prisma.template.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          type: input.type,
          format: input.format,
          status: input.status,
          configPath: input.configPath,
          previewPath: input.previewPath,
        },
      });
    }
    return prisma.template.create({ data: input });
  }

  async listByBrandId(brandId: string): Promise<TemplateRecord[]> {
    return prisma.template.findMany({
      where: { brandId },
      orderBy: { name: "asc" },
    });
  }

  async findByBrandAndSource(
    brandId: string,
    sourcePath: string,
    version: number,
  ): Promise<TemplateRecord | null> {
    return prisma.template.findFirst({
      where: { brandId, sourcePath, version },
    });
  }

  async findById(id: string): Promise<TemplateRecord | null> {
    return prisma.template.findUnique({ where: { id } });
  }
}

export class InMemoryTemplateRepository implements TemplateRepository {
  private store = new Map<string, TemplateRecord>();

  async upsertForBrand(input: TemplateUpsertInput): Promise<TemplateRecord> {
    const existing = await this.findByBrandAndSource(
      input.brandId,
      input.sourcePath,
      input.version,
    );
    const now = new Date();
    if (existing) {
      const updated: TemplateRecord = {
        ...existing,
        ...input,
        updatedAt: now,
      };
      this.store.set(existing.id, updated);
      return updated;
    }
    const record: TemplateRecord = {
      id: `tpl_${crypto.randomUUID()}`,
      ...input,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(record.id, record);
    return record;
  }

  async listByBrandId(brandId: string): Promise<TemplateRecord[]> {
    return [...this.store.values()]
      .filter((t) => t.brandId === brandId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async findByBrandAndSource(
    brandId: string,
    sourcePath: string,
    version: number,
  ): Promise<TemplateRecord | null> {
    return (
      [...this.store.values()].find(
        (t) =>
          t.brandId === brandId &&
          t.sourcePath === sourcePath &&
          t.version === version,
      ) ?? null
    );
  }

  async findById(id: string): Promise<TemplateRecord | null> {
    return this.store.get(id) ?? null;
  }
}

const globalTemplates = globalThis as unknown as {
  templateMemoryRepo?: InMemoryTemplateRepository;
};

export function getInMemoryTemplateRepository(): InMemoryTemplateRepository {
  if (!globalTemplates.templateMemoryRepo) {
    globalTemplates.templateMemoryRepo = new InMemoryTemplateRepository();
  }
  return globalTemplates.templateMemoryRepo;
}

export function getTemplateRepository(): TemplateRepository {
  if (process.env.TEMPLATES_IN_MEMORY !== "false") {
    return getInMemoryTemplateRepository();
  }
  return new PrismaTemplateRepository();
}
