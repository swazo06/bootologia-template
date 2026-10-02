import { requirePageUser } from "@/lib/auth/guards";
import { listCalendarPublications } from "@/features/calendar";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  await requirePageUser();
  const publications = listCalendarPublications();

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">Calendrier</h1>
      <p className="mt-3 text-zinc-600">
        Les dates sont stockées en UTC et affichées dans le fuseau utilisateur.
      </p>
      {publications.length === 0 ? (
        <p className="mt-8 text-zinc-600">Aucune publication planifiée.</p>
      ) : (
        <ul className="mt-8 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
          {publications.map((pub) => (
            <li key={pub.id} className="px-4 py-3 text-sm">
              <span className="font-medium">{pub.platform}</span>
              {" · "}
              <span>{pub.status}</span>
              {" · "}
              <time dateTime={pub.scheduledAt.toISOString()}>
                {pub.scheduledAt.toISOString()}
              </time>
              {pub.externalPostId ? (
                <>
                  {" · "}
                  <span>{pub.externalPostId}</span>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
