import { redirect } from "next/navigation";
import { requireUser, requireRole } from "@/lib/auth/supabase";
import type { AppRole } from "@/lib/auth/roles";

export async function requirePageUser(): Promise<void> {
  try {
    await requireUser();
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }
    throw error;
  }
}

export async function requirePageRole(allowed: readonly AppRole[]): Promise<void> {
  try {
    await requireRole(allowed);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      redirect("/login");
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      redirect("/dashboard?error=forbidden");
    }
    throw error;
  }
}

export async function requireApiUser() {
  return requireUser();
}

export async function requireApiEditor() {
  return requireRole(["EDITOR", "ADMIN"]);
}

export async function requireApiAdmin() {
  return requireRole(["ADMIN"]);
}
