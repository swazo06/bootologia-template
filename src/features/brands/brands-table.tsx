"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  deactivateBrandAction,
  deleteBrandAction,
} from "@/server/actions/brands";

export type BrandListItem = {
  id: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  primaryColor: string;
  accentColor: string;
  logoUrl: string;
  defaultLanguage: string;
  availableLanguages: string[];
};

const PAGE_SIZE = 10;

export function BrandsTable({
  brands,
  canDelete,
}: {
  brands: BrandListItem[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [language, setLanguage] = useState("");
  const [page, setPage] = useState(1);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const languages = useMemo(() => {
    const set = new Set<string>();
    for (const brand of brands) {
      set.add(brand.defaultLanguage);
      for (const lang of brand.availableLanguages) set.add(lang);
    }
    return [...set].sort();
  }, [brands]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands.filter((brand) => {
      if (status === "active" && !brand.isActive) return false;
      if (status === "inactive" && brand.isActive) return false;
      if (language) {
        const langs = [brand.defaultLanguage, ...brand.availableLanguages];
        if (!langs.includes(language)) return false;
      }
      if (!q) return true;
      return (
        brand.name.toLowerCase().includes(q) ||
        brand.slug.toLowerCase().includes(q) ||
        brand.description.toLowerCase().includes(q)
      );
    });
  }, [brands, search, status, language]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <label className="block text-sm lg:max-w-sm lg:flex-1">
          Recherche
          <input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            placeholder="Nom, slug, description…"
          />
        </label>
        <label className="block text-sm">
          Statut
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as "all" | "active" | "inactive");
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          >
            <option value="all">Tous</option>
            <option value="active">Actives</option>
            <option value="inactive">Inactives</option>
          </select>
        </label>
        <label className="block text-sm">
          Langue
          <select
            value={language}
            onChange={(e) => {
              setLanguage(e.target.value);
              setPage(1);
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          >
            <option value="">Toutes</option>
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </label>
        <Link
          href="/brands/new"
          className="inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white"
        >
          Nouvelle marque
        </Link>
      </div>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-md border border-zinc-300 bg-white/80">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-zinc-600">
            <tr>
              <th className="px-4 py-3 font-medium">Marque</th>
              <th className="px-4 py-3 font-medium">Slug</th>
              <th className="px-4 py-3 font-medium">Langue</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.map((brand) => (
              <tr key={brand.id} className="border-b border-zinc-100">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={brand.logoUrl}
                      alt=""
                      className="h-8 w-8 rounded object-cover"
                    />
                    <div>
                      <p className="font-medium">{brand.name}</p>
                      <p className="line-clamp-1 text-xs text-zinc-500">
                        {brand.description}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs">{brand.slug}</td>
                <td className="px-4 py-3">{brand.defaultLanguage}</td>
                <td className="px-4 py-3">
                  <span
                    className={
                      brand.isActive ? "text-emerald-700" : "text-zinc-500"
                    }
                  >
                    {brand.isActive ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={`/brands/${brand.id}`}
                      className="underline-offset-2 hover:underline"
                    >
                      Voir
                    </Link>
                    <Link
                      href={`/brands/${brand.id}/edit`}
                      className="underline-offset-2 hover:underline"
                    >
                      Éditer
                    </Link>
                    {brand.isActive ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-amber-700 underline-offset-2 hover:underline disabled:opacity-50"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const result = await deactivateBrandAction(brand.id);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        Désactiver
                      </button>
                    ) : null}
                    {canDelete ? (
                      <button
                        type="button"
                        disabled={pending}
                        className="text-red-700 underline-offset-2 hover:underline disabled:opacity-50"
                        onClick={() => {
                          setError(null);
                          startTransition(async () => {
                            const result = await deleteBrandAction(brand.id);
                            if (!result.ok) {
                              setError(result.error);
                              return;
                            }
                            router.refresh();
                          });
                        }}
                      >
                        Supprimer
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  Aucune marque trouvée.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-zinc-600">
        <p>
          {filtered.length} résultat(s) — page {currentPage}/{totalPages}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-40"
            disabled={currentPage <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Précédent
          </button>
          <button
            type="button"
            className="rounded-md border border-zinc-300 px-3 py-1 disabled:opacity-40"
            disabled={currentPage >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Suivant
          </button>
        </div>
      </div>
    </div>
  );
}
