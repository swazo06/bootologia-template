"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export type TemplateListItem = {
  id: string;
  name: string;
  type: string;
  format: string;
  status: string;
  version: number;
};

export type BrandOption = {
  id: string;
  name: string;
  slug: string;
};

export function TemplatesBrowser({
  brands,
  templatesBySlug,
}: {
  brands: BrandOption[];
  templatesBySlug: Record<string, TemplateListItem[]>;
}) {
  const [brandSlug, setBrandSlug] = useState(brands[0]?.slug ?? "");
  const templates = useMemo(
    () => templatesBySlug[brandSlug] ?? [],
    [templatesBySlug, brandSlug],
  );

  return (
    <div className="space-y-6">
      <label className="block max-w-sm text-sm">
        Marque
        <select
          value={brandSlug}
          onChange={(e) => setBrandSlug(e.target.value)}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
        >
          {brands.map((brand) => (
            <option key={brand.id} value={brand.slug}>
              {brand.name} ({brand.slug})
            </option>
          ))}
        </select>
      </label>

      {brands.length === 0 ? (
        <p className="text-zinc-600">
          Aucune marque active. Créez une marque dont le slug correspond à un
          dossier sous <code>templates/brands</code>.
        </p>
      ) : (
        <ul className="space-y-3">
          {templates.map((template) => (
            <li
              key={template.id}
              className="rounded-md border border-zinc-300 bg-white/70 px-5 py-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-medium">{template.name}</p>
                  <p className="text-sm text-zinc-600">
                    {template.id} · {template.type} · {template.format} · v
                    {template.version}
                  </p>
                </div>
                <Link
                  href={`/templates/${brandSlug}/${template.id}`}
                  className="text-sm underline-offset-2 hover:underline"
                >
                  Détail
                </Link>
              </div>
            </li>
          ))}
          {templates.length === 0 ? (
            <li className="text-zinc-600">
              Aucun template ACTIVE pour cette marque.
            </li>
          ) : null}
        </ul>
      )}
    </div>
  );
}
