import { beforeEach, describe, expect, it } from "vitest";
import {
  getInMemorySocialAccountRepository,
  socialAccountToPublic,
} from "@/server/repositories/social-account-repository";
import { SocialAccountCredentialsProvider } from "@/providers/meta/credentials";

describe("SocialAccount repository + credentials", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";
    getInMemorySocialAccountRepository().reset();
  });

  it("stores encrypted tokens and never exposes them publicly", async () => {
    const repo = getInMemorySocialAccountRepository();
    const created = await repo.create({
      platform: "FACEBOOK",
      externalId: "page_99",
      displayName: "Page",
      accessToken: "super-secret-page-token",
    });
    expect(created.accessTokenEnc).not.toContain("super-secret-page-token");
    const pub = socialAccountToPublic(created);
    expect(pub).not.toHaveProperty("accessTokenEnc");
    expect(pub).not.toHaveProperty("accessToken");
  });

  it("credentials provider decrypts connected accounts", async () => {
    const repo = getInMemorySocialAccountRepository();
    const created = await repo.create({
      platform: "INSTAGRAM",
      externalId: "ig_99",
      displayName: "IG",
      accessToken: "ig-secret-token-value",
    });
    const provider = new SocialAccountCredentialsProvider(repo);
    const creds = await provider.getCredentials(created.id);
    expect(creds.accessToken).toBe("ig-secret-token-value");
    expect(creds.externalId).toBe("ig_99");
  });

  it("rejects expired and disconnected accounts", async () => {
    const repo = getInMemorySocialAccountRepository();
    const expired = await repo.create({
      platform: "FACEBOOK",
      externalId: "p1",
      displayName: "P1",
      accessToken: "token-expired-account",
      status: "EXPIRED",
    });
    const disconnected = await repo.create({
      platform: "FACEBOOK",
      externalId: "p2",
      displayName: "P2",
      accessToken: "token-disconnected-account",
      status: "DISCONNECTED",
    });
    const provider = new SocialAccountCredentialsProvider(repo);
    await expect(provider.getCredentials(expired.id)).rejects.toMatchObject({
      code: "TOKEN_PERMANENTLY_INVALID",
    });
    await expect(
      provider.getCredentials(disconnected.id),
    ).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });
  });
});
