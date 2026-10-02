import { notFound } from "next/navigation";
import { requirePageRole } from "@/lib/auth/guards";
import { createBrandService } from "@/server/services/brand-service";
import { BrandForm } from "@/features/brands/brand-form";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditBrandPage({ params }: PageProps) {
  await requirePageRole(["EDITOR", "ADMIN"]);
  const { id } = await params;

  let brand;
  try {
    brand = await createBrandService().getById(id);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">
        Éditer {brand.name}
      </h1>
      <div className="mt-8">
        <BrandForm
          mode="edit"
          brandId={brand.id}
          initial={{
            name: brand.name,
            slug: brand.slug,
            description: brand.description,
            defaultLanguage: brand.defaultLanguage,
            availableLanguages: brand.availableLanguages,
            primaryColor: brand.primaryColor,
            secondaryColor: brand.secondaryColor,
            accentColor: brand.accentColor,
            logoUrl: brand.logoUrl,
            toneOfVoice: brand.toneOfVoice,
            targetAudience: brand.targetAudience,
            preferredCTAs: brand.preferredCTAs,
            forbiddenWords: brand.forbiddenWords,
            requiredTerms: brand.requiredTerms,
            defaultHashtags: brand.defaultHashtags,
            visualGuidelines: brand.visualGuidelines,
            isActive: brand.isActive,
          }}
        />
      </div>
    </main>
  );
}
