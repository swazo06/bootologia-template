import type { Platform, SocialAccountStatus } from "@prisma/client";
import { prisma } from "@/lib/database/prisma";
import { decryptSecret, encryptSecret } from "@/lib/encryption/aes-gcm";

export type SocialAccountRecord = {
  id: string;
  platform: Platform;
  externalId: string;
  displayName: string;
  accessTokenEnc: string;
  tokenExpiresAt: Date | null;
  status: SocialAccountStatus;
  brandId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type SocialAccountPublic = Omit<SocialAccountRecord, "accessTokenEnc">;

export type SocialAccountCreateInput = {
  platform: Platform;
  externalId: string;
  displayName: string;
  accessToken: string;
  tokenExpiresAt?: Date | null;
  status?: SocialAccountStatus;
  brandId?: string | null;
};

export class SocialAccountError extends Error {
  readonly code:
    | "NOT_FOUND"
    | "DUPLICATE"
    | "ACCOUNT_DISCONNECTED"
    | "TOKEN_PERMANENTLY_INVALID";

  constructor(
    code:
      | "NOT_FOUND"
      | "DUPLICATE"
      | "ACCOUNT_DISCONNECTED"
      | "TOKEN_PERMANENTLY_INVALID",
    message?: string,
  ) {
    super(message ?? code);
    this.name = "SocialAccountError";
    this.code = code;
  }
}

export interface SocialAccountRepository {
  create(input: SocialAccountCreateInput): Promise<SocialAccountRecord>;
  findById(id: string): Promise<SocialAccountRecord | null>;
  list(): Promise<SocialAccountRecord[]>;
  updateStatus(
    id: string,
    status: SocialAccountStatus,
  ): Promise<SocialAccountRecord>;
  updateToken(
    id: string,
    accessToken: string,
    tokenExpiresAt?: Date | null,
  ): Promise<SocialAccountRecord>;
  delete(id: string): Promise<void>;
}

function toPublic(row: SocialAccountRecord): SocialAccountPublic {
  const { accessTokenEnc, ...rest } = row;
  void accessTokenEnc;
  return rest;
}

export function socialAccountToPublic(
  row: SocialAccountRecord,
): SocialAccountPublic {
  return toPublic(row);
}

export function decryptAccountToken(row: SocialAccountRecord): string {
  return decryptSecret(row.accessTokenEnc);
}

export class InMemorySocialAccountRepository implements SocialAccountRepository {
  private readonly items = new Map<string, SocialAccountRecord>();
  private seq = 0;

  reset(): void {
    this.items.clear();
    this.seq = 0;
  }

  async create(input: SocialAccountCreateInput): Promise<SocialAccountRecord> {
    const key = `${input.platform}:${input.externalId}`;
    for (const existing of this.items.values()) {
      if (
        existing.platform === input.platform &&
        existing.externalId === input.externalId
      ) {
        throw new SocialAccountError("DUPLICATE");
      }
    }
    this.seq += 1;
    const now = new Date();
    const record: SocialAccountRecord = {
      id: `sa_${this.seq}`,
      platform: input.platform,
      externalId: input.externalId,
      displayName: input.displayName,
      accessTokenEnc: encryptSecret(input.accessToken),
      tokenExpiresAt: input.tokenExpiresAt ?? null,
      status: input.status ?? "CONNECTED",
      brandId: input.brandId ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.items.set(record.id, record);
    void key;
    return { ...record };
  }

  async findById(id: string): Promise<SocialAccountRecord | null> {
    const found = this.items.get(id);
    return found ? { ...found } : null;
  }

  async list(): Promise<SocialAccountRecord[]> {
    return [...this.items.values()].map((r) => ({ ...r }));
  }

  async updateStatus(
    id: string,
    status: SocialAccountStatus,
  ): Promise<SocialAccountRecord> {
    const current = this.items.get(id);
    if (!current) throw new SocialAccountError("NOT_FOUND");
    const next = { ...current, status, updatedAt: new Date() };
    this.items.set(id, next);
    return { ...next };
  }

  async updateToken(
    id: string,
    accessToken: string,
    tokenExpiresAt?: Date | null,
  ): Promise<SocialAccountRecord> {
    const current = this.items.get(id);
    if (!current) throw new SocialAccountError("NOT_FOUND");
    const next: SocialAccountRecord = {
      ...current,
      accessTokenEnc: encryptSecret(accessToken),
      tokenExpiresAt: tokenExpiresAt === undefined ? current.tokenExpiresAt : tokenExpiresAt,
      status: "CONNECTED",
      updatedAt: new Date(),
    };
    this.items.set(id, next);
    return { ...next };
  }

  async delete(id: string): Promise<void> {
    if (!this.items.has(id)) throw new SocialAccountError("NOT_FOUND");
    this.items.delete(id);
  }
}

export class PrismaSocialAccountRepository implements SocialAccountRepository {
  async create(input: SocialAccountCreateInput): Promise<SocialAccountRecord> {
    try {
      return await prisma.socialAccount.create({
        data: {
          platform: input.platform,
          externalId: input.externalId,
          displayName: input.displayName,
          accessTokenEnc: encryptSecret(input.accessToken),
          tokenExpiresAt: input.tokenExpiresAt ?? null,
          status: input.status ?? "CONNECTED",
          brandId: input.brandId ?? null,
        },
      });
    } catch {
      throw new SocialAccountError("DUPLICATE");
    }
  }

  async findById(id: string): Promise<SocialAccountRecord | null> {
    return prisma.socialAccount.findUnique({ where: { id } });
  }

  async list(): Promise<SocialAccountRecord[]> {
    return prisma.socialAccount.findMany({ orderBy: { createdAt: "desc" } });
  }

  async updateStatus(
    id: string,
    status: SocialAccountStatus,
  ): Promise<SocialAccountRecord> {
    try {
      return await prisma.socialAccount.update({
        where: { id },
        data: { status },
      });
    } catch {
      throw new SocialAccountError("NOT_FOUND");
    }
  }

  async updateToken(
    id: string,
    accessToken: string,
    tokenExpiresAt?: Date | null,
  ): Promise<SocialAccountRecord> {
    try {
      return await prisma.socialAccount.update({
        where: { id },
        data: {
          accessTokenEnc: encryptSecret(accessToken),
          tokenExpiresAt:
            tokenExpiresAt === undefined ? undefined : tokenExpiresAt,
          status: "CONNECTED",
        },
      });
    } catch {
      throw new SocialAccountError("NOT_FOUND");
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await prisma.socialAccount.delete({ where: { id } });
    } catch {
      throw new SocialAccountError("NOT_FOUND");
    }
  }
}

const globalAccounts = globalThis as unknown as {
  socialAccountMemoryRepo?: InMemorySocialAccountRepository;
};

export function getInMemorySocialAccountRepository(): InMemorySocialAccountRepository {
  if (!globalAccounts.socialAccountMemoryRepo) {
    globalAccounts.socialAccountMemoryRepo = new InMemorySocialAccountRepository();
  }
  return globalAccounts.socialAccountMemoryRepo;
}

export function getSocialAccountRepository(): SocialAccountRepository {
  if (process.env.SOCIAL_ACCOUNTS_IN_MEMORY !== "false") {
    return getInMemorySocialAccountRepository();
  }
  return new PrismaSocialAccountRepository();
}
