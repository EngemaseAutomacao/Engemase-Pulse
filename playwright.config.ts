import { defineConfig, devices } from "@playwright/test";

/**
 * Testes de tela (ponta a ponta). Precisam de um Postgres migrado e com o
 * administrador criado (npm run db:seed). A preparação (e2e/global-setup.ts)
 * cria o cliente "e2e" e manda leituras sintéticas como o gateway da unidade.
 *
 *   npm run build && npm run test:e2e
 *
 * Contra um servidor já no ar: E2E_BASE_URL=http://localhost:3200 npm run test:e2e
 */
const port = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `npx next start -p ${port}`,
        url: `${baseURL}/login`,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
        env: { APP_URL: baseURL, CRON_SECRET: process.env.CRON_SECRET ?? "segredo-dos-testes-e2e" },
      },
});
