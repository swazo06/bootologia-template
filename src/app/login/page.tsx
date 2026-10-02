import { Suspense } from "react";
import { LoginForm } from "@/features/integrations/login-form";
import { isAuthBypassEnabled } from "@/lib/auth/config";

export default function LoginPage() {
  const bypass = isAuthBypassEnabled();

  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">Connexion</h1>
      {bypass ? (
        <p className="mt-3 text-zinc-600">
          Mode local <code className="text-sm">AUTH_BYPASS</code> — saisissez
          n&apos;importe quel email / mot de passe (8+ caractères) pour
          continuer en ADMIN.
        </p>
      ) : (
        <p className="mt-3 text-zinc-600">
          Authentification Supabase (email / mot de passe). Les rôles sont
          appliqués côté serveur via{" "}
          <code className="text-sm">app_metadata.role</code>.
        </p>
      )}
      <Suspense fallback={<p className="mt-8 text-sm text-zinc-500">Chargement…</p>}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
