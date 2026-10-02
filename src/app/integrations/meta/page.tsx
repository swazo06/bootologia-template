import { requirePageRole } from "@/lib/auth/guards";
import { MetaAccountsPanel } from "@/features/integrations/meta-accounts-panel";
import {
  getSocialAccountRepository,
  socialAccountToPublic,
} from "@/server/repositories/social-account-repository";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ oauth?: string; reason?: string }>;

export default async function MetaIntegrationsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requirePageRole(["ADMIN"]);
  const params = await searchParams;
  const rows = await getSocialAccountRepository().list();
  const initialAccounts = rows.map((row) => {
    const pub = socialAccountToPublic(row);
    return {
      id: pub.id,
      platform: pub.platform,
      externalId: pub.externalId,
      displayName: pub.displayName,
      status: pub.status,
      tokenExpiresAt: pub.tokenExpiresAt
        ? pub.tokenExpiresAt.toISOString()
        : null,
    };
  });
  const initialMessage =
    params.oauth === "connected" ? "Compte Meta connecté." : null;
  const initialError =
    params.oauth === "error"
      ? (params.reason ?? "OAUTH_ERROR")
      : null;

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-12">
      <p className="text-sm text-zinc-500">
        <Link href="/dashboard" className="underline">
          ← Dashboard
        </Link>
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight">
        Connexion Meta
      </h1>
      <p className="mt-3 text-zinc-600">
        Connectez une Page Facebook ou un compte Instagram Business. Les tokens
        sont chiffrés au repos (AES-GCM) et jamais renvoyés à l&apos;UI.
      </p>
      <div className="mt-10">
        <MetaAccountsPanel
          initialAccounts={initialAccounts}
          initialMessage={initialMessage}
          initialError={initialError}
        />
      </div>
    </main>
  );
}
