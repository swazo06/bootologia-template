import { requirePageRole } from "@/lib/auth/guards";
import { BrandForm } from "@/features/brands/brand-form";

export const dynamic = "force-dynamic";

export default async function NewBrandPage() {
  await requirePageRole(["EDITOR", "ADMIN"]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Nouvelle marque</h1>
      <p className="mt-3 text-zinc-600">
        Tous les champs requis de la spécification doivent être renseignés.
      </p>
      <div className="mt-8">
        <BrandForm mode="create" />
      </div>
    </main>
  );
}
