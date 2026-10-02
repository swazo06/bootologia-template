import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/auth/guards";
import { createTemplateService } from "@/server/services/template-service";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ brandSlug: string; templateId: string }>;
};

export default async function TemplateDetailPage({ params }: PageProps) {
  await requirePageUser();
  const { brandSlug, templateId } = await params;

  let usable;
  try {
    usable = await createTemplateService().getUsable(brandSlug, templateId);
  } catch {
    notFound();
  }

  const { config } = usable.loaded;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <Link
        href="/templates"
        className="text-sm text-zinc-600 underline-offset-2 hover:underline"
      >
        ← Templates
      </Link>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        {config.name}
      </h1>
      <p className="mt-2 font-mono text-sm text-zinc-500">
        {brandSlug}/{config.id}
      </p>
      <dl className="mt-8 space-y-3 text-sm">
        <div>
          <dt className="font-medium text-zinc-500">Type</dt>
          <dd>{config.type}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Format</dt>
          <dd>
            {config.format} ({config.dimensions.width}×{config.dimensions.height}
            )
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Statut</dt>
          <dd>{config.status}</dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Champs dynamiques</dt>
          <dd className="mt-1 font-mono text-xs">
            {Object.keys(config.fields).join(", ")}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-zinc-500">Lecture seule</dt>
          <dd className="mt-1 text-zinc-600">
            Les positions, couleurs et polices sont verrouillées dans le SVG.
            L&apos;IA remplit uniquement les placeholders.
          </dd>
        </div>
      </dl>
    </main>
  );
}
