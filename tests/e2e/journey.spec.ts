import { test, expect } from "@playwright/test";

const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";

const brandPayload = {
  name: "BotoSchool",
  slug: "botoschool",
  description: "École pratique de formation",
  defaultLanguage: "fr",
  availableLanguages: ["fr"],
  primaryColor: "#111111",
  secondaryColor: "#666666",
  accentColor: "#D7FF00",
  logoUrl: "https://cdn.example.com/brands/botoschool.png",
  toneOfVoice: "clair et professionnel",
  targetAudience: "adultes en reconversion",
  preferredCTAs: ["S'inscrire"],
  forbiddenWords: [],
  requiredTerms: [],
  defaultHashtags: ["#botoschool"],
  visualGuidelines: "Templates SVG verrouillés uniquement",
  isActive: true,
};

test("full journey: brand → generate → approve → schedule → DRY_RUN publish", async ({
  page,
  request,
}) => {
  // 1) Login surface
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Connexion",
  );

  // 2) Ensure brand exists (API under AUTH_BYPASS)
  const existing = await request.get("/api/brands?search=botoschool");
  expect(existing.ok()).toBeTruthy();
  const list = await existing.json();
  const items: unknown[] = list.data?.items ?? [];
  if (items.length === 0) {
    const created = await request.post("/api/brands", { data: brandPayload });
    expect([201, 409]).toContain(created.status());
  }

  // 3) Brands + templates UI
  await page.goto("/brands");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Marques");
  await page.goto("/templates");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Templates",
  );

  // 4-7) Brief + generate (AI mock) + validation embedded in action
  await page.goto("/content/new");
  const brandField = page.getByLabel("Marque (id ou slug)");
  await brandField.clear();
  await brandField.fill("botoschool");
  const templateField = page.getByLabel("Template id");
  await templateField.clear();
  await templateField.fill("poster-service-v1");
  await page.getByLabel("Sujet").fill("Formation web intensive");
  await page.getByLabel("Objectif").fill("Inscription session");
  await page.getByLabel("Public cible").fill("adultes motivés");
  await page.getByRole("button", { name: "Générer le contenu" }).click();

  const draftIdEl = page.getByTestId("draft-id");
  await expect(draftIdEl).toBeVisible({ timeout: 30_000 });
  const draftId = (await draftIdEl.textContent())?.trim();
  expect(draftId).toBeTruthy();

  const metaText = await page.getByTestId("draft-meta").textContent();
  const versionMatch = metaText?.match(/v(\d+)/);
  const version = Number(versionMatch?.[1] ?? "1");

  // 8-10) Approve (ADMIN via bypass)
  const approve = await request.post(`/api/content/${draftId}/approve`, {
    data: { expectedVersion: version },
  });
  expect(approve.ok()).toBeTruthy();
  const approved = await approve.json();
  const approvedVersion = approved.version ?? version + 1;

  // Meta account for schedule
  const accountRes = await request.post("/api/social-accounts", {
    data: {
      platform: "FACEBOOK",
      externalId: `e2e_page_${Date.now()}`,
      displayName: "E2E Page",
      accessToken: "e2e-access-token-value",
    },
  });
  expect(accountRes.status()).toBe(201);
  const account = (await accountRes.json()).data;

  // 11) Schedule
  const scheduledAt = new Date(Date.now() - 60_000).toISOString();
  const schedule = await request.post("/api/publications/schedule", {
    data: {
      contentDraftId: draftId,
      platforms: ["FACEBOOK"],
      scheduledAt,
      timezone: "UTC",
      socialAccountId: account.id,
    },
  });
  expect(schedule.ok()).toBeTruthy();
  const scheduled = await schedule.json();
  expect(scheduled.publicationIds?.length).toBe(1);

  // 12-13) Publish DRY_RUN via cron
  const cron = await request.post("/api/cron/publish", {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  expect(cron.ok()).toBeTruthy();
  const cronBody = await cron.json();
  expect(cronBody.ok).toBe(true);
  expect(cronBody.processed).toBeGreaterThanOrEqual(1);

  // Calendar shows publication
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Calendrier",
  );
  await expect(page.getByText("PUBLISHED").first()).toBeVisible();
  await expect(page.getByText(/dryrun_/i).first()).toBeVisible();

  void approvedVersion;
});

test("meta integrations UI lists and connects account", async ({ page }) => {
  await page.goto("/integrations/meta");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Connexion Meta",
  );
  const displayName = `Page E2E UI ${Date.now()}`;
  await page.getByLabel("External ID (Page / IG user)").fill(
    `page_e2e_ui_${Date.now()}`,
  );
  await page.getByLabel("Nom affiché").fill(displayName);
  await page.getByLabel("Access token").fill("manual-token-e2e-ui-xx");
  await page.getByRole("button", { name: "Enregistrer le compte" }).click();
  await expect(page.getByText(displayName)).toBeVisible();
  await expect(page.getByText("Compte enregistré.")).toBeVisible();
});
