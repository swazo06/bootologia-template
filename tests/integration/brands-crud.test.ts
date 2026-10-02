import { describe, expect, it } from "vitest";
import { InMemoryBrandRepository } from "@/server/repositories/brand-repository";
import { BrandService } from "@/server/services/brand-service";
import { BrandLogoService } from "@/features/brands/brand-logo-service";
import { MockStorageProvider } from "@/providers/storage/storage-provider";
import { brandListQuerySchema } from "@/lib/validation/brand";

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

describe("brand-service CRUD", () => {
  it("creates, lists, updates, deactivates and deletes", async () => {
    const repo = new InMemoryBrandRepository();
    const service = new BrandService(repo);

    const created = await service.create(sample, "EDITOR");
    expect(created.id).toBeTruthy();

    const listed = await service.list({
      search: "boto",
      status: "active",
      language: "",
      page: 1,
      pageSize: 20,
    });
    expect(listed.total).toBe(1);
    expect(listed.items).toHaveLength(1);

    const updated = await service.update(
      created.id,
      { name: "BotoSchool Pro" },
      "EDITOR",
    );
    expect(updated.name).toBe("BotoSchool Pro");

    const inactive = await service.deactivate(created.id, "EDITOR");
    expect(inactive.isActive).toBe(false);

    await expect(service.delete(created.id, "EDITOR")).rejects.toThrow(
      "FORBIDDEN",
    );
    await service.delete(created.id, "ADMIN");
    await expect(service.getById(created.id)).rejects.toThrow("BRAND_NOT_FOUND");
  });

  it("rejects duplicate slugs and missing ids", async () => {
    const service = new BrandService(new InMemoryBrandRepository());
    await service.create(sample, "EDITOR");
    await expect(service.create(sample, "EDITOR")).rejects.toThrow(
      "BRAND_SLUG_TAKEN",
    );
    await expect(service.getById("missing")).rejects.toThrow("BRAND_NOT_FOUND");
  });

  it("filters by language and paginates", async () => {
    const service = new BrandService(new InMemoryBrandRepository());
    await service.create(sample, "EDITOR");
    await service.create(
      {
        ...sample,
        name: "Darija Brand",
        slug: "darija-brand",
        defaultLanguage: "darija",
        availableLanguages: ["darija"],
      },
      "EDITOR",
    );

    const frOnly = await service.list({
      search: "",
      status: "all",
      language: "fr",
      page: 1,
      pageSize: 20,
    });
    expect(frOnly.total).toBe(1);
    expect(frOnly.items[0]?.slug).toBe("botoschool");

    const page1 = await service.list({
      search: "",
      status: "all",
      language: "",
      page: 1,
      pageSize: 1,
    });
    expect(page1.items).toHaveLength(1);
    expect(page1.total).toBe(2);
    expect(page1.pageSize).toBe(1);

    const parsed = brandListQuerySchema.parse({ page: "2", pageSize: "1" });
    expect(parsed.page).toBe(2);
  });

  it("uploads logo via storage provider", async () => {
    const logos = new BrandLogoService(new MockStorageProvider());
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const uploaded = await logos.uploadLogo({
      brandSlug: "botoschool",
      fileName: "logo.png",
      contentType: "image/png",
      buffer: png,
    });
    expect(uploaded.url).toContain("brands/botoschool/");
  });

  it("rejects invalid logo mime", async () => {
    const logos = new BrandLogoService(new MockStorageProvider());
    await expect(
      logos.uploadLogo({
        brandSlug: "botoschool",
        fileName: "logo.svg",
        contentType: "image/svg+xml",
        buffer: Buffer.from("<svg></svg>"),
      }),
    ).rejects.toThrow("INVALID_LOGO_TYPE");
  });
});
