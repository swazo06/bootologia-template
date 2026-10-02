"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { generateContentAction } from "@/server/actions/content";
import { Button } from "@/components/ui/button";

const briefFormSchema = z.object({
  brandId: z.string().min(1),
  templateId: z.string().min(1),
  topic: z.string().min(1),
  objective: z.string().min(1),
  targetAudience: z.string().min(1),
  language: z.enum(["fr", "ar", "darija"]),
  postType: z.enum(["POSTER", "CAROUSEL"]),
  requiredInformation: z.string().optional(),
  forbiddenInformation: z.string().optional(),
});

type BriefForm = z.infer<typeof briefFormSchema>;

export default function NewContentPage() {
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<unknown>(null);
  const [draftMeta, setDraftMeta] = useState<{
    draftId: string;
    version: number;
    status: string;
  } | null>(null);
  const form = useForm<BriefForm>({
    resolver: zodResolver(briefFormSchema),
    defaultValues: {
      brandId: "botoschool",
      templateId: "poster-service-v1",
      language: "fr",
      postType: "POSTER",
      topic: "",
      objective: "",
      targetAudience: "",
      requiredInformation: "",
      forbiddenInformation: "",
    },
  });

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Nouveau contenu</h1>
      <p className="mt-3 text-zinc-600">
        Saisissez le brief. L&apos;IA génère uniquement le JSON des placeholders.
        Aucune mise en page n&apos;est demandée ni modifiée.
      </p>
      <form
        className="mt-8 space-y-4"
        onSubmit={form.handleSubmit(async (values) => {
          setError(null);
          setResult(null);
          setDraftMeta(null);
          const response = await generateContentAction({
            brandId: values.brandId,
            templateId: values.templateId,
            topic: values.topic,
            objective: values.objective,
            targetAudience: values.targetAudience,
            language: values.language,
            requiredInformation: values.requiredInformation || undefined,
            forbiddenInformation: values.forbiddenInformation || undefined,
          });
          if (!response.ok) {
            setError(response.error);
            return;
          }
          setResult(response.data);
          setDraftMeta({
            draftId: response.draftId,
            version: response.version,
            status: response.status,
          });
        })}
      >
        <label className="block text-sm">
          Marque (id ou slug)
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("brandId")}
          />
        </label>
        <label className="block text-sm">
          Template id
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("templateId")}
          />
        </label>
        {(
          [
            ["topic", "Sujet"],
            ["objective", "Objectif"],
            ["targetAudience", "Public cible"],
          ] as const
        ).map(([name, label]) => (
          <label key={name} className="block text-sm">
            {label}
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
              {...form.register(name)}
            />
          </label>
        ))}
        <label className="block text-sm">
          Langue
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("language")}
          >
            <option value="fr">fr</option>
            <option value="ar">ar</option>
            <option value="darija">darija</option>
          </select>
        </label>
        <label className="block text-sm">
          Type
          <select
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("postType")}
          >
            <option value="POSTER">Affiche</option>
            <option value="CAROUSEL">Carrousel</option>
          </select>
        </label>
        <label className="block text-sm">
          Informations obligatoires
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("requiredInformation")}
          />
        </label>
        <label className="block text-sm">
          Informations interdites
          <input
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
            {...form.register("forbiddenInformation")}
          />
        </label>
        {error ? (
          <p className="text-sm text-red-600" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Génération…" : "Générer le contenu"}
        </Button>
      </form>
      {draftMeta ? (
        <p className="mt-6 text-sm text-zinc-700" data-testid="draft-meta">
          Draft <span data-testid="draft-id">{draftMeta.draftId}</span>
          {` · v${draftMeta.version} · ${draftMeta.status}`}
        </p>
      ) : null}
      {result ? (
        <pre className="mt-4 overflow-x-auto rounded-md border border-zinc-300 bg-white/80 p-4 text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      ) : null}
    </main>
  );
}
