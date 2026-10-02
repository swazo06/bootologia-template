"use server";

import { revalidatePath } from "next/cache";
import { requireRole, getUserRole } from "@/lib/auth/supabase";
import { brandListQuerySchema } from "@/lib/validation/brand";
import { createBrandService } from "@/server/services/brand-service";
import { brandLogoService } from "@/features/brands/brand-logo-service";

export type BrandActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function mapError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "UNKNOWN";
}

export async function listBrandsAction(
  rawQuery?: unknown,
): Promise<BrandActionResult> {
  try {
    await requireRole(["VIEWER", "EDITOR", "ADMIN"]);
    const query = brandListQuerySchema.parse(rawQuery ?? {});
    const data = await createBrandService().list(query);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function getBrandAction(
  id: string,
): Promise<BrandActionResult> {
  try {
    await requireRole(["VIEWER", "EDITOR", "ADMIN"]);
    const data = await createBrandService().getById(id);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function createBrandAction(
  raw: unknown,
): Promise<BrandActionResult> {
  try {
    const user = await requireRole(["EDITOR", "ADMIN"]);
    const data = await createBrandService().create(raw, getUserRole(user));
    revalidatePath("/brands");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function updateBrandAction(
  id: string,
  raw: unknown,
): Promise<BrandActionResult> {
  try {
    const user = await requireRole(["EDITOR", "ADMIN"]);
    const data = await createBrandService().update(
      id,
      raw,
      getUserRole(user),
    );
    revalidatePath("/brands");
    revalidatePath(`/brands/${id}`);
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function deactivateBrandAction(
  id: string,
): Promise<BrandActionResult> {
  try {
    const user = await requireRole(["EDITOR", "ADMIN"]);
    const data = await createBrandService().deactivate(
      id,
      getUserRole(user),
    );
    revalidatePath("/brands");
    return { ok: true, data };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function deleteBrandAction(
  id: string,
): Promise<BrandActionResult> {
  try {
    const user = await requireRole(["ADMIN"]);
    await createBrandService().delete(id, getUserRole(user));
    revalidatePath("/brands");
    return { ok: true, data: { id } };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}

export async function uploadBrandLogoAction(
  formData: FormData,
): Promise<BrandActionResult<{ url: string }>> {
  try {
    await requireRole(["EDITOR", "ADMIN"]);
    const slug = String(formData.get("slug") ?? "");
    const file = formData.get("file");
    if (!slug || !(file instanceof File)) {
      return { ok: false, error: "VALIDATION_REJECTED" };
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const uploaded = await brandLogoService.uploadLogo({
      brandSlug: slug,
      fileName: file.name,
      contentType: file.type || "application/octet-stream",
      buffer,
    });
    return { ok: true, data: { url: uploaded.url } };
  } catch (error) {
    return { ok: false, error: mapError(error) };
  }
}
