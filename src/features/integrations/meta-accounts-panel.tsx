"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export type SocialAccountView = {
  id: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  externalId: string;
  displayName: string;
  status: string;
  tokenExpiresAt: string | null;
};

type Props = {
  initialAccounts: SocialAccountView[];
  initialMessage?: string | null;
  initialError?: string | null;
};

export function MetaAccountsPanel({
  initialAccounts,
  initialMessage = null,
  initialError = null,
}: Props) {
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [error, setError] = useState<string | null>(initialError);
  const [message, setMessage] = useState<string | null>(initialMessage);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    platform: "FACEBOOK" as "FACEBOOK" | "INSTAGRAM",
    externalId: "",
    displayName: "",
    accessToken: "",
  });

  async function reload() {
    const res = await fetch("/api/social-accounts");
    if (!res.ok) {
      setError((await res.json()).error ?? "LOAD_FAILED");
      return;
    }
    const body = await res.json();
    setAccounts(body.data ?? []);
    router.refresh();
  }

  async function connectManual(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/social-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        setError((await res.json()).error ?? "CREATE_FAILED");
        return;
      }
      setForm({
        platform: "FACEBOOK",
        externalId: "",
        displayName: "",
        accessToken: "",
      });
      setMessage("Compte enregistré.");
      await reload();
    } finally {
      setLoading(false);
    }
  }

  async function startOAuth(platform: "FACEBOOK" | "INSTAGRAM") {
    setError(null);
    setMessage(null);
    const res = await fetch("/api/meta/oauth/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, redirectTo: "/integrations/meta" }),
    });
    const body = await res.json();
    if (!res.ok) {
      setError(body.error ?? "OAUTH_START_FAILED");
      return;
    }
    if (body.data?.authorizeUrl) {
      window.location.assign(body.data.authorizeUrl);
      return;
    }
    // Demo without META_APP_ID: simulate callback with signed state
    router.push(
      `/api/meta/oauth/callback?state=${encodeURIComponent(body.data.state)}`,
    );
  }

  async function refreshAccount(id: string) {
    const token = window.prompt("Nouveau access token Meta");
    if (!token) return;
    const res = await fetch(`/api/social-accounts/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: token }),
    });
    if (!res.ok) {
      setError((await res.json()).error ?? "REFRESH_FAILED");
      return;
    }
    setMessage("Token rafraîchi.");
    await reload();
  }

  async function deleteAccount(id: string) {
    if (!window.confirm("Supprimer ce compte Meta ?")) return;
    const res = await fetch(`/api/social-accounts/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setError((await res.json()).error ?? "DELETE_FAILED");
      return;
    }
    setMessage("Compte supprimé.");
    await reload();
  }

  return (
    <div className="space-y-10">
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <section>
        <h2 className="text-xl font-semibold">Comptes connectés</h2>
        {accounts.length === 0 ? (
          <p className="mt-2 text-zinc-600">Aucun compte Meta.</p>
        ) : (
          <ul className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium">{account.displayName}</p>
                  <p className="text-sm text-zinc-600">
                    {account.platform} · {account.externalId} · {account.status}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void refreshAccount(account.id)}
                  >
                    Rafraîchir token
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void deleteAccount(account.id)}
                  >
                    Supprimer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Connexion OAuth</h2>
        <p className="text-sm text-zinc-600">
          Démarre le flux OAuth Meta (ou mode démo si META_APP_ID est absent).
        </p>
        <div className="flex gap-2">
          <Button type="button" onClick={() => void startOAuth("FACEBOOK")}>
            Connecter Facebook
          </Button>
          <Button type="button" onClick={() => void startOAuth("INSTAGRAM")}>
            Connecter Instagram
          </Button>
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Connexion manuelle (token)</h2>
        <form className="mt-4 space-y-3" onSubmit={(e) => void connectManual(e)}>
          <label className="block text-sm">
            Plateforme
            <select
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={form.platform}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  platform: e.target.value as "FACEBOOK" | "INSTAGRAM",
                }))
              }
            >
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
            </select>
          </label>
          <label className="block text-sm">
            External ID (Page / IG user)
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={form.externalId}
              onChange={(e) =>
                setForm((f) => ({ ...f, externalId: e.target.value }))
              }
              required
            />
          </label>
          <label className="block text-sm">
            Nom affiché
            <input
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              required
            />
          </label>
          <label className="block text-sm">
            Access token
            <input
              type="password"
              className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2"
              value={form.accessToken}
              onChange={(e) =>
                setForm((f) => ({ ...f, accessToken: e.target.value }))
              }
              required
              minLength={10}
            />
          </label>
          <Button type="submit" disabled={loading}>
            {loading ? "Enregistrement…" : "Enregistrer le compte"}
          </Button>
        </form>
      </section>
    </div>
  );
}
