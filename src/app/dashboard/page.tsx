import { requirePageUser } from "@/lib/auth/guards";
import { signOutAction } from "@/server/actions/auth";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export const dynamic = "force-dynamic";

const links = [
  { href: "/brands", label: "Marques" },
  { href: "/templates", label: "Templates" },
  { href: "/content/new", label: "Nouveau contenu" },
  { href: "/calendar", label: "Calendrier" },
  { href: "/integrations/meta", label: "Connexion Meta" },
];

export default async function DashboardPage() {
  await requirePageUser();

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-12">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Dashboard</h1>
          <p className="mt-3 max-w-2xl text-zinc-600">
            Workflow : marque → template → brief → génération → validation →
            rendu → review → programmation → publication (DRY_RUN par défaut).
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Déconnexion
          </Button>
        </form>
      </div>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="block rounded-md border border-zinc-300 bg-white/70 px-5 py-4 hover:border-zinc-500"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
