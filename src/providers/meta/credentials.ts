import {
  decryptAccountToken,
  getSocialAccountRepository,
  SocialAccountError,
  type SocialAccountRecord,
  type SocialAccountRepository,
} from "@/server/repositories/social-account-repository";
import { MetaPublishError } from "@/providers/meta/types";

export type MetaCredentials = {
  accountId: string;
  platform: "FACEBOOK" | "INSTAGRAM";
  externalId: string;
  accessToken: string;
  displayName: string;
};

export interface MetaCredentialsProvider {
  getCredentials(accountId: string): Promise<MetaCredentials>;
}

function assertUsable(account: SocialAccountRecord): void {
  if (account.status === "DISCONNECTED") {
    throw new MetaPublishError(
      "ACCOUNT_DISCONNECTED",
      "Social account is disconnected",
    );
  }
  if (account.status === "EXPIRED") {
    throw new MetaPublishError(
      "TOKEN_PERMANENTLY_INVALID",
      "Access token is permanently invalid",
    );
  }
  if (account.tokenExpiresAt && account.tokenExpiresAt.getTime() < Date.now()) {
    throw new MetaPublishError(
      "TOKEN_PERMANENTLY_INVALID",
      "Access token has expired",
    );
  }
}

export class SocialAccountCredentialsProvider implements MetaCredentialsProvider {
  constructor(
    private readonly repo: SocialAccountRepository = getSocialAccountRepository(),
  ) {}

  async getCredentials(accountId: string): Promise<MetaCredentials> {
    if (!accountId?.trim() || accountId === "disconnected") {
      throw new MetaPublishError(
        "ACCOUNT_DISCONNECTED",
        "Social account is disconnected",
      );
    }
    if (accountId === "expired") {
      throw new MetaPublishError(
        "TOKEN_PERMANENTLY_INVALID",
        "Access token is permanently invalid",
      );
    }

    const account = await this.repo.findById(accountId);
    if (!account) {
      throw new MetaPublishError(
        "ACCOUNT_DISCONNECTED",
        `Social account not found: ${accountId}`,
      );
    }

    assertUsable(account);

    try {
      return {
        accountId: account.id,
        platform: account.platform,
        externalId: account.externalId,
        accessToken: decryptAccountToken(account),
        displayName: account.displayName,
      };
    } catch (error) {
      if (error instanceof SocialAccountError || error instanceof MetaPublishError) {
        throw error;
      }
      throw new MetaPublishError(
        "TOKEN_PERMANENTLY_INVALID",
        "Unable to decrypt access token",
      );
    }
  }
}

/** Test double — never hits DB or encryption. */
export class InMemoryMetaCredentialsProvider implements MetaCredentialsProvider {
  private readonly accounts = new Map<string, MetaCredentials>();

  seed(account: MetaCredentials): void {
    this.accounts.set(account.accountId, account);
  }

  clear(): void {
    this.accounts.clear();
  }

  async getCredentials(accountId: string): Promise<MetaCredentials> {
    if (!accountId?.trim() || accountId === "disconnected") {
      throw new MetaPublishError("ACCOUNT_DISCONNECTED");
    }
    if (accountId === "expired") {
      throw new MetaPublishError("TOKEN_PERMANENTLY_INVALID");
    }
    const found = this.accounts.get(accountId);
    if (!found) {
      throw new MetaPublishError(
        "ACCOUNT_DISCONNECTED",
        `Social account not found: ${accountId}`,
      );
    }
    return found;
  }
}
