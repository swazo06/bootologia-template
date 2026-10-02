export const dynamic = "force-dynamic";

import { requirePageUser } from "@/lib/auth/guards";

export default async function ContentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePageUser();
  return children;
}
