import { describe, expect, it } from "vitest";
import { brandInputSchema, brandListQuerySchema } from "@/lib/validation/brand";

const validBrand = {
  name: "BotoSchool",
  slug: "botoschool",
  description: "École pratique",
  defaultLanguage: "fr",
  availableLanguages: ["fr", "ar"],
  primaryColor: "#111111",
  secondaryColor: "#666666",
  accentColor: "#D7FF00",
  logoUrl: "https://storage.local/logo.png",
  toneOfVoice: "clair et direct",
  targetAudience: "adultes motivés",
  preferredCTAs: ["Commencer"],
  forbiddenWords: ["garanti"],
  requiredTerms: ["formation"],
  defaultHashtags: ["#botoschool"],
  visualGuidelines: "Canevas SVG verrouillés uniquement",
  isActive: true,
};

describe("brand-schemas", () => {
  it("accepts a complete brand payload", () => {
    expect(brandInputSchema.parse(validBrand).slug).toBe("botoschool");
  });

  it("rejects invalid slug and colors", () => {
    expect(
      brandInputSchema.safeParse({ ...validBrand, slug: "BAD Slug" }).success,
    ).toBe(false);
    expect(
      brandInputSchema.safeParse({ ...validBrand, primaryColor: "red" }).success,
    ).toBe(false);
  });

  it("parses list query defaults", () => {
    expect(brandListQuerySchema.parse({})).toEqual({
      search: "",
      status: "all",
      language: "",
      page: 1,
      pageSize: 20,
    });
  });
});
