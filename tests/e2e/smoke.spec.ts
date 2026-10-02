import { test, expect } from "@playwright/test";

const cronSecret = process.env.CRON_SECRET ?? "e2e-cron-secret";

test("home page shows locked-template principle", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Social Template Automation",
  );
  await expect(page.getByText(/ne crée jamais la mise en page/i)).toBeVisible();
});

test("content brief form is reachable with auth bypass", async ({ page }) => {
  await page.goto("/content/new");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Nouveau contenu",
  );
  await expect(page.getByText(/placeholders/i)).toBeVisible();
});

test("login page renders auth form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Connexion",
  );
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();
});

test("health reports dry-run publishing mode", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.dryRun).toBe(true);
  expect(body.metaPublishingEnabled).toBe(false);
});

test("calendar page is reachable with auth bypass", async ({ page }) => {
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("cron publish DRY_RUN requires secret and returns ok", async ({
  request,
}) => {
  const unauthorized = await request.post("/api/cron/publish");
  expect(unauthorized.status()).toBeGreaterThanOrEqual(401);

  const authorized = await request.post("/api/cron/publish", {
    headers: { Authorization: `Bearer ${cronSecret}` },
  });
  expect(authorized.ok()).toBeTruthy();
  const body = await authorized.json();
  expect(body.ok).toBe(true);
  expect(typeof body.processed).toBe("number");
  expect(typeof body.failed).toBe("number");
});

test("csrf endpoint issues token", async ({ request }) => {
  const res = await request.get("/api/csrf");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.csrfToken).toBeTruthy();
});

test("brands and templates pages reachable with auth bypass", async ({
  page,
}) => {
  await page.goto("/brands");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/templates");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
