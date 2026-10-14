import { expect, type Page } from "@playwright/test";

export const ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? process.env.SEED_ADMIN_EMAIL ?? "admin@engemase.com.br",
  password: process.env.E2E_ADMIN_PASSWORD ?? process.env.SEED_ADMIN_PASSWORD ?? "",
};

/** Cliente e loja criados pela preparação (global-setup). */
export const E2E = { slug: "e2e", tenantName: "Cliente E2E", siteName: "Loja E2E" };

export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await expect(page).not.toHaveURL(/\/login(\?|$)/);
}
