import type { Brand } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import {
  brandInputSchema,
  brandUpdateSchema,
  type BrandInput,
  type BrandListQuery,
  type BrandListResult,
  type BrandUpdateInput,
} from "@/lib/validation/brand";

export type BrandRecord = Brand;

export interface BrandRepository {
  create(input: BrandInput): Promise<BrandRecord>;
  update(id: string, input: BrandUpdateInput): Promise<BrandRecord>;
  findById(id: string): Promise<BrandRecord | null>;
  findBySlug(slug: string): Promise<BrandRecord | null>;
  list(query?: BrandListQuery): Promise<BrandListResult>;
  listActive(): Promise<BrandRecord[]>;
  deactivate(id: string): Promise<BrandRecord>;
  delete(id: string): Promise<void>;
}

function matchesQuery(brand: BrandRecord, query?: BrandListQuery): boolean {
  const search = (query?.search ?? "").trim().toLowerCase();
  const status = query?.status ?? "all";
  const language = (query?.language ?? "").trim().toLowerCase();

  if (status === "active" && !brand.isActive) return false;
  if (status === "inactive" && brand.isActive) return false;

  if (language) {
    const langs = [
      brand.defaultLanguage,
      ...brand.availableLanguages,
    ].map((l) => l.toLowerCase());
    if (!langs.includes(language)) return false;
  }

  if (!search) return true;
  return (
    brand.name.toLowerCase().includes(search) ||
    brand.slug.toLowerCase().includes(search) ||
    brand.description.toLowerCase().includes(search)
  );
}

function paginate(
  rows: BrandRecord[],
  query?: BrandListQuery,
): BrandListResult {
  const page = query?.page ?? 1;
  const pageSize = query?.pageSize ?? 20;
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    total,
    page,
    pageSize,
  };
}

export class PrismaBrandRepository implements BrandRepository {
  async create(input: BrandInput): Promise<BrandRecord> {
    const data = brandInputSchema.parse(input);
    return prisma.brand.create({ data });
  }

  async update(id: string, input: BrandUpdateInput): Promise<BrandRecord> {
    const partial = brandUpdateSchema.parse(input);
    return prisma.brand.update({ where: { id }, data: partial });
  }

  async findById(id: string): Promise<BrandRecord | null> {
    return prisma.brand.findUnique({ where: { id } });
  }

  async findBySlug(slug: string): Promise<BrandRecord | null> {
    return prisma.brand.findUnique({ where: { slug } });
  }

  async list(query?: BrandListQuery): Promise<BrandListResult> {
    const where =
      query?.status === "active"
        ? { isActive: true }
        : query?.status === "inactive"
          ? { isActive: false }
          : {};
    const rows = await prisma.brand.findMany({
      where,
      orderBy: { name: "asc" },
    });
    return paginate(
      rows.filter((brand) => matchesQuery(brand, query)),
      query,
    );
  }

  async listActive(): Promise<BrandRecord[]> {
    const result = await this.list({
      search: "",
      status: "active",
      language: "",
      page: 1,
      pageSize: 100,
    });
    return result.items;
  }

  async deactivate(id: string): Promise<BrandRecord> {
    return prisma.brand.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async delete(id: string): Promise<void> {
    await prisma.brand.delete({ where: { id } });
  }
}

export class InMemoryBrandRepository implements BrandRepository {
  private store = new Map<string, BrandRecord>();

  seed(records: BrandRecord[]) {
    this.store.clear();
    for (const record of records) {
      this.store.set(record.id, record);
    }
  }

  async create(input: BrandInput): Promise<BrandRecord> {
    const data = brandInputSchema.parse(input);
    if ([...this.store.values()].some((b) => b.slug === data.slug)) {
      throw new Error("BRAND_SLUG_TAKEN");
    }
    const now = new Date();
    const record: BrandRecord = {
      id: `brand_${crypto.randomUUID()}`,
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(record.id, record);
    return record;
  }

  async update(id: string, input: BrandUpdateInput): Promise<BrandRecord> {
    const existing = this.store.get(id);
    if (!existing) throw new Error("BRAND_NOT_FOUND");
    const partial = brandUpdateSchema.parse(input);
    if (
      partial.slug &&
      [...this.store.values()].some(
        (b) => b.slug === partial.slug && b.id !== id,
      )
    ) {
      throw new Error("BRAND_SLUG_TAKEN");
    }
    const updated = { ...existing, ...partial, updatedAt: new Date() };
    this.store.set(id, updated);
    return updated;
  }

  async findById(id: string): Promise<BrandRecord | null> {
    return this.store.get(id) ?? null;
  }

  async findBySlug(slug: string): Promise<BrandRecord | null> {
    return [...this.store.values()].find((b) => b.slug === slug) ?? null;
  }

  async list(query?: BrandListQuery): Promise<BrandListResult> {
    const rows = [...this.store.values()]
      .filter((brand) => matchesQuery(brand, query))
      .sort((a, b) => a.name.localeCompare(b.name));
    return paginate(rows, query);
  }

  async listActive(): Promise<BrandRecord[]> {
    const result = await this.list({
      search: "",
      status: "active",
      language: "",
      page: 1,
      pageSize: 100,
    });
    return result.items;
  }

  async deactivate(id: string): Promise<BrandRecord> {
    return this.update(id, { isActive: false });
  }

  async delete(id: string): Promise<void> {
    if (!this.store.has(id)) throw new Error("BRAND_NOT_FOUND");
    this.store.delete(id);
  }
}

const globalBrands = globalThis as unknown as {
  brandMemoryRepo?: InMemoryBrandRepository;
};

export function getInMemoryBrandRepository(): InMemoryBrandRepository {
  if (!globalBrands.brandMemoryRepo) {
    globalBrands.brandMemoryRepo = new InMemoryBrandRepository();
  }
  return globalBrands.brandMemoryRepo;
}

export function getBrandRepository(): BrandRepository {
  if (process.env.BRANDS_IN_MEMORY !== "false") {
    return getInMemoryBrandRepository();
  }
  return new PrismaBrandRepository();
}

/** @deprecated Prefer getBrandRepository() */
export const brandRepository = {
  create: (input: BrandInput) => getBrandRepository().create(input),
  update: (id: string, input: BrandUpdateInput) =>
    getBrandRepository().update(id, input),
  findById: (id: string) => getBrandRepository().findById(id),
  findBySlug: (slug: string) => getBrandRepository().findBySlug(slug),
  listActive: () => getBrandRepository().listActive(),
};
