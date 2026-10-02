import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/guards";
import { createBrandService } from "@/server/services/brand-service";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };

export default async function BrandDetailPage({ params }: PageProps) {
  await requirePageUser();
  const { id } = await params;

  let brand;
  try {
    brand = await createBrandService().getById(id);
  } catch {
    notFound();
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">{brand.name}</h1>
          <p className="mt-2 font-mono text-sm text-zinc-500">{brand.slug}</p>
        </div>
        <Link
          href={`/brands/${brand.id}/edit`}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm"
        >
          Éditer
        </Link>
      </div>
      <dl className="mt-8 space-y-4 text-sm">
        <div>
          <dt className="font-medium text-zinc-500">Description</dt>
          <dd className="mt-1">{brand.description}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Statut</dt>
          <dd className="mt-1">{brand.isActive ? "Active" : "Inactive"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Ton</dt>
          <dd className="mt-1">{brand.toneOfVoice}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Public cible</dt>
          <dd className="mt-1">{brand.targetAudience}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Couleurs</dt>
          <dd className="mt-1 font-mono">
            {brand.primaryColor} / {brand.secondaryColor} / {brand.accentColor}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Mots interdits</dt>
          <dd className="mt-1">{brand.forbiddenWords.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Termes obligatoires</dt>
          <dd className="mt-1">{brand.requiredTerms.join(", ") || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Hashtags</dt>
          <dd className="mt-1">{brand.defaultHashtags.join(" ") || "—"}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Guidelines</dt>
          <dd className="mt-1 whitespace-pre-wrap">{brand.visualGuidelines}</dd>
        </div>
      </dl>
    </main>
  );
}
