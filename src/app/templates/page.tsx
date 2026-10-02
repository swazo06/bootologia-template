import { requirePageUser } from "@/lib/auth/guards";
import { createBrandService } from "@/server/services/brand-service";
import { createTemplateService } from "@/server/services/template-service";
import { TemplatesBrowser } from "@/features/templates/templates-browser";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  await requirePageUser();

  const brandsResult = await createBrandService().list({
    search: "",
    status: "active",
    language: "",
    page: 1,
    pageSize: 100,
  });
  const templateService = createTemplateService();
  const templatesBySlug: Record<
    string,
    Array<{
      id: string;
      name: string;
      type: string;
      format: string;
      status: string;
      version: number;
    }>
  > = {};

  for (const brand of brandsResult.items) {
    try {
      await templateService.syncBrandTemplates(brand.slug);
      const configs = await templateService.listByBrandSlug(brand.slug);
      templatesBySlug[brand.slug] = configs.map((config) => ({
        id: config.id,
        name: config.name,
        type: config.type,
        format: config.format,
        status: config.status,
        version: config.version,
      }));
    } catch {
      templatesBySlug[brand.slug] = [];
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Templates</h1>
      <p className="mt-3 text-zinc-600">
        Canevas verrouillés uniquement. Aucune édition libre de mise en page.
        Seuls les templates <strong>ACTIVE</strong> sont listés.
      </p>
      <div className="mt-8">
        <TemplatesBrowser
          brands={brandsResult.items.map((b) => ({
            id: b.id,
            name: b.name,
            slug: b.slug,
          }))}
          templatesBySlug={templatesBySlug}
        />
      </div>
    </main>
  );
}
