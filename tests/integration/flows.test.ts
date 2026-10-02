import { describe, expect, it } from "vitest";
import { DryRunMetaPublisher } from "@/providers/meta";
import {
  InMemoryPublicationStore,
  SocialPostScheduler,
} from "@/providers/scheduler/social-post-scheduler";
import { ContentGenerator, MockAiProvider } from "@/features/content-generation/content-generator";
import { templateRegistry } from "@/features/templates/template-registry";
import { contentValidator } from "@/features/content-generation/content-validator";
import { encryptSecret, decryptSecret } from "@/lib/encryption/aes-gcm";
import { sanitizeForLogs } from "@/lib/logging/logger";
import { InMemoryBrandRepository } from "@/server/repositories/brand-repository";
import { InMemoryJobLogStore } from "@/server/services/job-log-service";

describe("integration flows", () => {
  it("creates poster content with mocked AI", async () => {
    const loaded = await templateRegistry.loadTemplate(
      "botoschool",
      "poster-service-v1",
    );
    const generator = new ContentGenerator(new MockAiProvider());
    const content = await generator.generate({
      brand: {
        name: "BotoSchool",
        description: "École pratique",
        toneOfVoice: "clair",
        targetAudience: "adultes",
        forbiddenWords: [],
        requiredTerms: [],
      },
      brief: {
        brandId: "botoschool",
        templateId: "poster-service-v1",
        topic: "Formation web",
        objective: "Inscription",
        targetAudience: "adultes",
        language: "fr",
      },
      template: loaded.config,
    });
    const report = contentValidator.validate({
      content,
      template: loaded.config,
      brand: { forbiddenWords: [], requiredTerms: [] },
    });
    expect(report.passed).toBe(true);
  });

  it("loads educational carousel with six slides", async () => {
    const loaded = await templateRegistry.loadTemplate(
      "botoschool",
      "carousel-educational-v1",
    );
    expect(loaded.config.slides).toHaveLength(6);
    expect(Object.keys(loaded.svgFiles)).toHaveLength(6);
  });

  it("publishes Facebook and Instagram in DRY_RUN without duplicates", async () => {
    process.env.DRY_RUN = "true";
    const publisher = new DryRunMetaPublisher();
    const a = await publisher.publish({
      platform: "FACEBOOK",
      postType: "POSTER",
      caption: "Hello",
      mediaUrls: ["https://example.com/a.png"],
      mimeTypes: ["image/png"],
      contentDraftId: "draft_1",
      publicationId: "pub_a",
      idempotencyKey: "pub-1",
      accountId: "acc-1",
    });
    const b = await publisher.publish({
      platform: "INSTAGRAM",
      postType: "POSTER",
      caption: "Hello",
      mediaUrls: ["https://example.com/a.png"],
      mimeTypes: ["image/png"],
      contentDraftId: "draft_1",
      publicationId: "pub_b",
      idempotencyKey: "pub-1",
      accountId: "acc-1",
    });
    expect(a.dryRun).toBe(true);
    expect(b.externalPostId).toBe(a.externalPostId);
  });

  it("handles inaccessible file and disconnected account", async () => {
    const publisher = new DryRunMetaPublisher();
    await expect(
      publisher.publish({
        platform: "FACEBOOK",
        postType: "POSTER",
        caption: "x",
        mediaUrls: ["https://example.com/inaccessible.png"],
        mimeTypes: ["image/png"],
        contentDraftId: "draft_1",
        publicationId: "pub_err_file",
        idempotencyKey: "pub-err-file",
        accountId: "acc-1",
      }),
    ).rejects.toMatchObject({ code: "FILE_NOT_ACCESSIBLE" });

    await expect(
      publisher.publish({
        platform: "FACEBOOK",
        postType: "POSTER",
        caption: "x",
        mediaUrls: ["https://example.com/ok.png"],
        mimeTypes: ["image/png"],
        contentDraftId: "draft_1",
        publicationId: "pub_err_acc",
        idempotencyKey: "pub-err-acc",
        accountId: "disconnected",
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_DISCONNECTED" });
  });

  it("scheduler claims due publications once", async () => {
    const store = new InMemoryPublicationStore([
      {
        id: "p1",
        contentDraftId: "draft_1",
        platform: "FACEBOOK",
        socialAccountId: "acc",
        status: "SCHEDULED",
        scheduledAt: new Date(Date.now() - 1000),
        timezone: "UTC",
        retryCount: 0,
        idempotencyKey: "sched-1",
      },
    ]);
    const publisher = new DryRunMetaPublisher();
    const scheduler = new SocialPostScheduler(store, "worker-a", async (pub) => {
      return publisher.publish({
        platform: "FACEBOOK",
        postType: "POSTER",
        caption: "ok",
        mediaUrls: ["https://example.com/x.png"],
        mimeTypes: ["image/png"],
        contentDraftId: pub.contentDraftId,
        publicationId: pub.id,
        idempotencyKey: pub.idempotencyKey,
        accountId: "acc",
      });
    });
    const first = await scheduler.tick();
    const second = await scheduler.tick();
    expect(first.processed).toBe(1);
    expect(second.processed).toBe(0);
  });

  it("encrypts secrets and sanitizes logs", () => {
    process.env.ENCRYPTION_KEY = "12345678901234567890123456789012";
    const encrypted = encryptSecret("super-secret-token");
    expect(encrypted).not.toContain("super-secret-token");
    expect(decryptSecret(encrypted)).toBe("super-secret-token");

    const sanitized = sanitizeForLogs({
      authorization: "Bearer abc.def",
      nested: { apiKey: "sk-test" },
    }) as Record<string, unknown>;
    expect(sanitized.authorization).toBe("[REDACTED]");
  });

  it("creates brands in memory repository", async () => {
    const repo = new InMemoryBrandRepository();
    const brand = await repo.create({
      name: "BotoSchool",
      slug: "botoschool",
      description: "École",
      defaultLanguage: "fr",
      availableLanguages: ["fr"],
      primaryColor: "#111111",
      secondaryColor: "#666666",
      accentColor: "#D7FF00",
      logoUrl: "https://example.com/logo.png",
      toneOfVoice: "clair",
      targetAudience: "adultes",
      preferredCTAs: ["Commencer"],
      forbiddenWords: ["garanti"],
      requiredTerms: [],
      defaultHashtags: ["#botoschool"],
      visualGuidelines: "Canevas verrouillés uniquement",
      isActive: true,
    });
    expect(brand.slug).toBe("botoschool");
    expect(await repo.findBySlug("botoschool")).not.toBeNull();
  });

  it("records sanitized job logs in memory", () => {
    const logs = new InMemoryJobLogStore();
    logs.write({
      provider: "meta",
      action: "publish",
      status: "SUCCESS",
      requestSummary: { token: "secret-value", caption: "ok" },
    });
    expect(logs.entries[0]?.requestSummary).toMatchObject({
      token: "[REDACTED]",
      caption: "ok",
    });
  });
});
