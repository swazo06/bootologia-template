"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import { loginSchema, type LoginInput } from "@/lib/validation/auth";
import { signInAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={form.handleSubmit(async (values) => {
        setFormError(null);
        const result = await signInAction(values);
        if (!result.ok) {
          setFormError(result.error);
          return;
        }
        const next = searchParams.get("next") || "/dashboard";
        router.push(next.startsWith("/") ? next : "/dashboard");
        router.refresh();
      })}
    >
      <label className="block text-sm">
        Email
        <input
          type="email"
          autoComplete="email"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("email")}
        />
      </label>
      {form.formState.errors.email ? (
        <p className="text-sm text-red-600">Email invalide</p>
      ) : null}
      <label className="block text-sm">
        Mot de passe
        <input
          type="password"
          autoComplete="current-password"
          className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-3 py-2"
          {...form.register("password")}
        />
      </label>
      {form.formState.errors.password ? (
        <p className="text-sm text-red-600">
          Mot de passe : 8 caractères minimum
        </p>
      ) : null}
      {formError ? (
        <p className="text-sm text-red-600" role="alert">
          {formError}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
        {form.formState.isSubmitting ? "Connexion…" : "Continuer"}
      </Button>
    </form>
  );
}
