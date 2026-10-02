import Link from "next/link";
import { requirePageUser } from "@/lib/auth/guards";
import { requireUser, getUserRole } from "@/lib/auth/supabase";
import { createBrandService } from "@/server/services/brand-service";
import { BrandsTable } from "@/features/brands/brands-table";

export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  await requirePageUser();
  const user = await requireUser();
  const role = getUserRole(user);
  const result = await createBrandService().list({
    search: "",
    status: "all",
    language: "",
    page: 1,
    pageSize: 100,
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Marques</h1>
          <p className="mt-3 text-zinc-600">
            Gestion des marques (ton, hashtags, termes interdits/obligatoires).
          </p>
        </div>
        <Link
          href="/brands/new"
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
        >
          Nouvelle marque
        </Link>
      </div>
      <BrandsTable
        canDelete={role === "ADMIN"}
        brands={result.items.map((brand) => ({
          id: brand.id,
          name: brand.name,
          slug: brand.slug,
          description: brand.description,
          isActive: brand.isActive,
          primaryColor: brand.primaryColor,
          accentColor: brand.accentColor,
          logoUrl: brand.logoUrl,
          defaultLanguage: brand.defaultLanguage,
          availableLanguages: brand.availableLanguages,
        }))}
      />
    </main>
  );
}
