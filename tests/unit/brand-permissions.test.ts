import { describe, expect, it } from "vitest";
import { InMemoryBrandRepository } from "@/server/repositories/brand-repository";
import { BrandService } from "@/server/services/brand-service";

const sample = {
  name: "BotoSchool",
  slug: "botoschool",
  description: "École pratique",
  defaultLanguage: "fr",
  availableLanguages: ["fr", "ar"],
  primaryColor: "#111111",
  secondaryColor: "#666666",
  accentColor: "#D7FF00",
  logoUrl: "https://storage.local/logo.png",
  toneOfVoice: "clair",
  targetAudience: "adultes",
  preferredCTAs: ["Commencer"],
  forbiddenWords: ["garanti"],
  requiredTerms: [],
  defaultHashtags: ["#botoschool"],
  visualGuidelines: "Canevas verrouillés",
  isActive: true,
};

describe("brand-permissions", () => {
  it("forbids VIEWER from write operations", async () => {
    const service = new BrandService(new InMemoryBrandRepository());
    await expect(service.create(sample, "VIEWER")).rejects.toThrow("FORBIDDEN");
  });

  it("allows EDITOR to create/update/deactivate but not delete", async () => {
    const service = new BrandService(new InMemoryBrandRepository());
    const created = await service.create(sample, "EDITOR");
    const updated = await service.update(
      created.id,
      { name: "BotoSchool Edit" },
      "EDITOR",
    );
    expect(updated.name).toBe("BotoSchool Edit");
    await service.deactivate(created.id, "EDITOR");
    await expect(service.delete(created.id, "EDITOR")).rejects.toThrow(
      "FORBIDDEN",
    );
  });

  it("allows ADMIN to delete", async () => {
    const service = new BrandService(new InMemoryBrandRepository());
    const created = await service.create(
      { ...sample, slug: "admin-brand" },
      "ADMIN",
    );
    await service.delete(created.id, "ADMIN");
    await expect(service.getById(created.id)).rejects.toThrow("BRAND_NOT_FOUND");
  });
});
