import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col">
      <header className="flex items-center justify-between px-8 py-6">
        <p className="text-sm font-medium tracking-[0.2em] uppercase text-zinc-600">
          Bootologia
        </p>
        <nav className="flex gap-4 text-sm">
          <Link href="/login" className="underline-offset-4 hover:underline">
            Connexion
          </Link>
          <Link href="/dashboard" className="underline-offset-4 hover:underline">
            Dashboard
          </Link>
        </nav>
      </header>
      <section className="relative flex flex-1 flex-col justify-end px-8 pb-16 pt-24">
        <div
          className="pointer-events-none absolute inset-0 bg-[url('/window.svg')] bg-cover bg-center opacity-20"
          aria-hidden
        />
        <h1 className="relative max-w-4xl font-[family-name:var(--font-geist-sans)] text-5xl font-semibold tracking-tight md:text-7xl">
          Social Template Automation
        </h1>
        <p className="relative mt-6 max-w-xl text-lg text-zinc-700">
          L&apos;IA remplit vos canevas SVG verrouillés. Elle ne crée jamais la
          mise en page.
        </p>
        <div className="relative mt-10 flex gap-4">
          <Link
            href="/content/new"
            className="rounded-md bg-zinc-900 px-5 py-3 text-sm font-medium text-white"
          >
            Créer un contenu
          </Link>
          <Link
            href="/templates"
            className="rounded-md border border-zinc-400 px-5 py-3 text-sm font-medium"
          >
            Voir les templates
          </Link>
        </div>
      </section>
    </main>
  );
}
