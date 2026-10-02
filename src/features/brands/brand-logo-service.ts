import { storageProvider, type StorageProvider } from "@/providers/storage/storage-provider";

const ALLOWED_LOGO_MIME = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

export class BrandLogoService {
  constructor(private readonly storage: StorageProvider = storageProvider) {}

  async uploadLogo(input: {
    brandSlug: string;
    fileName: string;
    contentType: string;
    buffer: Buffer;
  }): Promise<{ url: string; key: string }> {
    if (
      !(ALLOWED_LOGO_MIME as readonly string[]).includes(input.contentType)
    ) {
      throw new Error("INVALID_LOGO_TYPE");
    }
    if (input.buffer.byteLength === 0 || input.buffer.byteLength > MAX_LOGO_BYTES) {
      throw new Error("INVALID_LOGO_SIZE");
    }

    const ext =
      input.contentType === "image/png"
        ? "png"
        : input.contentType === "image/webp"
          ? "webp"
          : "jpg";
    const key = `brands/${input.brandSlug}/logo-${Date.now()}.${ext}`;
    const stored = await this.storage.upload({
      key,
      buffer: input.buffer,
      contentType: input.contentType,
    });
    return { url: stored.url, key: stored.key };
  }
}

export const brandLogoService = new BrandLogoService();
