import { test, expect, type APIRequestContext, type Page } from "@playwright/test";

const password = "password123";
const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";

const accounts = [
  "Botoschool@gmail.com",
  "Botoologia@gmail.com",
] as const;

test.describe.configure({ mode: "serial" });

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

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Mot de passe").fill(password);
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Dashboard",
  );
}

async function ensureBrand(request: APIRequestContext) {
  const existing = await request.get("/api/brands?search=botoschool");
  expect(existing.ok()).toBeTruthy();
  const list = await existing.json();
  const items: unknown[] = list.data?.items ?? [];
  if (items.length === 0) {
    const created = await request.post("/api/brands", { data: brandPayload });
    expect([201, 409]).toContain(created.status());
  }
}

async function generateDraft(page: Page, topic: string) {
  await page.goto("/content/new");
  const brandField = page.getByLabel("Marque (id ou slug)");
  await brandField.clear();
  await brandField.fill("botoschool");
  const templateField = page.getByLabel("Template id");
  await templateField.clear();
  await templateField.fill("poster-service-v1");
  await page.getByLabel("Sujet").fill(topic);
  await page.getByLabel("Objectif").fill("Inscription session");
  await page.getByLabel("Public cible").fill("adultes motivés");
  await page.getByRole("button", { name: "Générer le contenu" }).click();
  const draftIdEl = page.getByTestId("draft-id");
  await expect(draftIdEl).toBeVisible({ timeout: 30_000 });
  const draftId = (await draftIdEl.textContent())?.trim();
  expect(draftId).toBeTruthy();
  const metaText = await page.getByTestId("draft-meta").textContent();
  const version = Number(metaText?.match(/v(\d+)/)?.[1] ?? "1");
  return { draftId: draftId!, version };
}

for (const email of accounts) {
  test(`full product flow as ${email}`, async ({ page, request }) => {
    test.setTimeout(90_000);
    const tag = email.split("@")[0]!.toLowerCase();

    await login(page, email);
    await ensureBrand(request);

    const health = await request.get("/api/health");
    expect(health.ok()).toBeTruthy();
    const healthBody = await health.json();
    expect(healthBody.ok).toBe(true);
    expect(healthBody.dryRun).toBe(true);

    const csrf = await request.get("/api/csrf");
    expect(csrf.ok()).toBeTruthy();
    expect((await csrf.json()).csrfToken).toBeTruthy();

    await page.goto("/brands");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Marques",
    );
    await expect(page.getByText("BotoSchool").first()).toBeVisible();
    await expect(page.getByText("botoschool").first()).toBeVisible();

    await page.goto("/templates");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Templates",
    );
    await page.getByLabel("Marque").selectOption("botoschool");
    await expect(page.getByText("poster-service-v1")).toBeVisible();
    await expect(page.getByText("carousel-educational-v1")).toBeVisible();
    await page
      .getByRole("link", { name: "Détail" })
      .first()
      .click();
    await expect(page).toHaveURL(/\/templates\/botoschool\//);

    const rejected = await generateDraft(
      page,
      `Brief rejet ${tag} ${Date.now()}`,
    );
    const rejectRes = await request.post(
      `/api/content/${rejected.draftId}/reject`,
      { data: { expectedVersion: rejected.version } },
    );
    expect(rejectRes.ok()).toBeTruthy();
    expect((await rejectRes.json()).status).toBe("REJECTED");

    const approvedDraft = await generateDraft(
      page,
      `Brief publish ${tag} ${Date.now()}`,
    );
    const approveRes = await request.post(
      `/api/content/${approvedDraft.draftId}/approve`,
      { data: { expectedVersion: approvedDraft.version } },
    );
    expect(approveRes.ok()).toBeTruthy();
    expect((await approveRes.json()).status).toBe("APPROVED");

    await page.goto("/integrations/meta");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Connexion Meta",
    );
    const displayName = `Page ${tag} ${Date.now()}`;
    await page
      .getByLabel("External ID (Page / IG user)")
      .fill(`page_${tag}_${Date.now()}`);
    await page.getByLabel("Nom affiché").fill(displayName);
    await page.getByLabel("Access token").fill("manual-token-e2e-ui-xx");
    await page.getByRole("button", { name: "Enregistrer le compte" }).click();
    await expect(page.getByText(displayName)).toBeVisible();
    await expect(page.getByText("Compte enregistré.")).toBeVisible();

    const accountsList = await request.get("/api/social-accounts");
    expect(accountsList.ok()).toBeTruthy();
    const rows: { id: string; displayName: string }[] =
      (await accountsList.json()).data ?? [];
    const account = rows.find((row) => row.displayName === displayName);
    expect(account?.id).toBeTruthy();

    const schedule = await request.post("/api/publications/schedule", {
      data: {
        contentDraftId: approvedDraft.draftId,
        platforms: ["FACEBOOK"],
        scheduledAt: new Date(Date.now() - 60_000).toISOString(),
        timezone: "UTC",
        socialAccountId: account!.id,
      },
    });
    expect(schedule.ok()).toBeTruthy();
    expect((await schedule.json()).publicationIds?.length).toBe(1);

    const cron = await request.post("/api/cron/publish", {
      headers: { Authorization: `Bearer ${cronSecret}` },
    });
    expect(cron.ok()).toBeTruthy();
    const cronBody = await cron.json();
    expect(cronBody.ok).toBe(true);
    if (cronBody.processed < 1) {
      const retry = await request.post("/api/cron/publish", {
        headers: { Authorization: `Bearer ${cronSecret}` },
      });
      expect(retry.ok()).toBeTruthy();
    }

    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Calendrier",
    );
    await expect(page.getByText("PUBLISHED").first()).toBeVisible();
    await expect(
      page.getByText(new RegExp(`dryrun_${approvedDraft.draftId}`, "i")),
    ).toBeVisible();

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Déconnexion" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
}
