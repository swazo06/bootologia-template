"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import {
  brandInputSchema,
  type BrandInput,
} from "@/lib/validation/brand";
import {
  createBrandAction,
  updateBrandAction,
  uploadBrandLogoAction,
} from "@/server/actions/brands";
import { Button } from "@/components/ui/button";

function splitList(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

type BrandFormValues = Omit<
  BrandInput,
  "preferredCTAs" | "forbiddenWords" | "requiredTerms" | "defaultHashtags" | "availableLanguages"
> & {
  availableLanguagesText: string;
  preferredCTAsText: string;
  forbiddenWordsText: string;
  requiredTermsText: string;
  defaultHashtagsText: string;
};

function toFormValues(initial?: Partial<BrandInput>): BrandFormValues {
  return {
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    defaultLanguage: initial?.defaultLanguage ?? "fr",
    availableLanguagesText: (initial?.availableLanguages ?? ["fr"]).join(", "),
    primaryColor: initial?.primaryColor ?? "#111111",
    secondaryColor: initial?.secondaryColor ?? "#666666",
    accentColor: initial?.accentColor ?? "#D7FF00",
    logoUrl: initial?.logoUrl ?? "https://storage.local/brands/placeholder.png",
    toneOfVoice: initial?.toneOfVoice ?? "",
    targetAudience: initial?.targetAudience ?? "",
    preferredCTAsText: (initial?.preferredCTAs ?? []).join(", "),
    forbiddenWordsText: (initial?.forbiddenWords ?? []).join(", "),
    requiredTermsText: (initial?.requiredTerms ?? []).join(", "),
    defaultHashtagsText: (initial?.defaultHashtags ?? []).join(", "),
    visualGuidelines: initial?.visualGuidelines ?? "",
    isActive: initial?.isActive ?? true,
  };
}

function toPayload(values: BrandFormValues): BrandInput {
  return brandInputSchema.parse({
    name: values.name,
    slug: values.slug,
    description: values.description,
    defaultLanguage: values.defaultLanguage,
    availableLanguages: splitList(values.availableLanguagesText),
    primaryColor: values.primaryColor,
    secondaryColor: values.secondaryColor,
    accentColor: values.accentColor,
    logoUrl: values.logoUrl,
    toneOfVoice: values.toneOfVoice,
    targetAudience: values.targetAudience,
    preferredCTAs: splitList(values.preferredCTAsText),
    forbiddenWords: splitList(values.forbiddenWordsText),
    requiredTerms: splitList(values.requiredTermsText),
    defaultHashtags: splitList(values.defaultHashtagsText),
    visualGuidelines: values.visualGuidelines,
    isActive: Boolean(values.isActive),
  });
}

export function BrandForm({
  mode,
  brandId,
  initial,
}: {
  mode: "create" | "edit";
  brandId?: string;
  initial?: Partial<BrandInput>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const form = useForm<BrandFormValues>({
    defaultValues: toFormValues(initial),
  });

  return (
    <form
      className="space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        setError(null);
        try {
          const payload = toPayload(values);
          const result =
            mode === "create"
              ? await createBrandAction(payload)
              : await updateBrandAction(brandId!, payload);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          router.push("/brands");
          router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "VALIDATION_REJECTED");
        }
      })}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Nom
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("name", { required: true })}
          />
        </label>
        <label className="block text-sm">
          Slug
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm"
            {...form.register("slug", { required: true })}
          />
        </label>
      </div>

      <label className="block text-sm">
        Description
        <textarea
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("description", { required: true })}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          Langue par défaut
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("defaultLanguage", { required: true })}
          />
        </label>
        <label className="block text-sm">
          Langues disponibles (virgules)
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("availableLanguagesText", { required: true })}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {(
          [
            ["primaryColor", "Couleur primaire"],
            ["secondaryColor", "Couleur secondaire"],
            ["accentColor", "Couleur accent"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block text-sm">
            {label}
            <input
              type="text"
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2 font-mono text-sm"
              {...form.register(name, { required: true })}
            />
          </label>
        ))}
      </div>

      <label className="block text-sm">
        Logo URL
        <input
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("logoUrl", { required: true })}
        />
      </label>

      <label className="block text-sm">
        Upload logo (PNG/JPEG/WebP)
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="mt-1 block w-full text-sm"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            setUploading(true);
            setError(null);
            const body = new FormData();
            body.set("slug", form.getValues("slug") || "draft");
            body.set("file", file);
            const result = await uploadBrandLogoAction(body);
            setUploading(false);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            form.setValue("logoUrl", result.data.url);
          }}
        />
        {uploading ? (
          <span className="mt-1 block text-xs text-zinc-500">Upload…</span>
        ) : null}
      </label>

      <label className="block text-sm">
        Ton de voix
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("toneOfVoice", { required: true })}
        />
      </label>

      <label className="block text-sm">
        Public cible
        <textarea
          rows={2}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("targetAudience", { required: true })}
        />
      </label>

      {(
        [
          ["preferredCTAsText", "CTAs préférés"],
          ["forbiddenWordsText", "Mots interdits"],
          ["requiredTermsText", "Termes obligatoires"],
          ["defaultHashtagsText", "Hashtags par défaut"],
        ] as const
      ).map(([name, label]) => (
        <label key={name} className="block text-sm">
          {label} (virgules)
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register(name)}
          />
        </label>
      ))}

      <label className="block text-sm">
        Guidelines visuelles
        <textarea
          rows={3}
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("visualGuidelines", { required: true })}
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          {...form.register("isActive")}
        />
        Marque active
      </label>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" disabled={form.formState.isSubmitting || uploading}>
          {mode === "create" ? "Créer" : "Enregistrer"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/brands")}
        >
          Annuler
        </Button>
      </div>
    </form>
  );
}
