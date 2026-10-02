import type { AppRole } from "@/lib/auth/roles";
import { hasRole } from "@/lib/auth/roles";
import {
  brandInputSchema,
  brandListQuerySchema,
  brandUpdateSchema,
  type BrandInput,
  type BrandListQuery,
  type BrandListResult,
  type BrandUpdateInput,
} from "@/lib/validation/brand";
import type {
  BrandRecord,
  BrandRepository,
} from "@/server/repositories/brand-repository";
import { getBrandRepository } from "@/server/repositories/brand-repository";

export class BrandService {
  constructor(private readonly repo: BrandRepository = getBrandRepository()) {}

  assertCanWrite(role: AppRole): void {
    if (!hasRole(role, ["EDITOR", "ADMIN"])) {
      throw new Error("FORBIDDEN");
    }
  }

  async create(raw: unknown, role: AppRole = "EDITOR"): Promise<BrandRecord> {
    this.assertCanWrite(role);
    const input = brandInputSchema.parse(raw);
    const existing = await this.repo.findBySlug(input.slug);
    if (existing) {
      throw new Error("BRAND_SLUG_TAKEN");
    }
    return this.repo.create(input);
  }

  async update(
    id: string,
    raw: unknown,
    role: AppRole = "EDITOR",
  ): Promise<BrandRecord> {
    this.assertCanWrite(role);
    const input = brandUpdateSchema.parse(raw);
    const current = await this.repo.findById(id);
    if (!current) throw new Error("BRAND_NOT_FOUND");
    if (input.slug && input.slug !== current.slug) {
      const taken = await this.repo.findBySlug(input.slug);
      if (taken) throw new Error("BRAND_SLUG_TAKEN");
    }
    return this.repo.update(id, input);
  }

  async getById(id: string): Promise<BrandRecord> {
    const brand = await this.repo.findById(id);
    if (!brand) throw new Error("BRAND_NOT_FOUND");
    return brand;
  }

  async list(rawQuery?: unknown): Promise<BrandListResult> {
    const query = brandListQuerySchema.parse(rawQuery ?? {});
    return this.repo.list(query);
  }

  async deactivate(id: string, role: AppRole = "EDITOR"): Promise<BrandRecord> {
    this.assertCanWrite(role);
    await this.getById(id);
    return this.repo.deactivate(id);
  }

  async delete(id: string, role: AppRole): Promise<void> {
    if (role !== "ADMIN") {
      throw new Error("FORBIDDEN");
    }
    await this.getById(id);
    await this.repo.delete(id);
  }
}

export function createBrandService(repo?: BrandRepository): BrandService {
  return new BrandService(repo ?? getBrandRepository());
}

export type { BrandInput, BrandUpdateInput, BrandListQuery, BrandListResult };
