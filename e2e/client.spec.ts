import { expect, test } from "@playwright/test";
import { E2E, login } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("painel mostra a loja com os medidores do Painel e a carga do disjuntor", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}`);
  await expect(page.getByRole("heading", { name: "Visão geral" })).toBeVisible();
  await expect(page.getByText("Entrada geral").first()).toBeVisible();
  await expect(page.getByText("Câmaras frias").first()).toBeVisible();
  await expect(page.getByText(/Disjuntor 400 A/)).toBeVisible();
});

test("consumo do mês tem setores, custo e planilha", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/consumo`);
  await page.getByRole("radio", { name: "Mês" }).click();
  await expect(page.getByRole("heading", { name: "Por setor" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Câmaras frias/ })).toBeVisible();
  await expect(page.getByText("Custo da energia", { exact: true })).toBeVisible();
  const csv = await page.evaluate(async () => {
    const link = document.querySelector<HTMLAnchorElement>('a[download][href*="consumption/export"]')!;
    const response = await fetch(link.href);
    return { ok: response.ok, text: await response.text() };
  });
  expect(csv.ok).toBe(true);
  expect(csv.text).toContain("QD-01 Câmaras frias (kWh)");
});

test("fatura estimada mostra demanda contra a contratada", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/fatura`);
  await expect(page.getByText(/Projeção do mês|Fatura estimada/).first()).toBeVisible();
  await expect(page.getByText("Demanda máxima").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: /Energia — ponta/ })).toBeVisible();
});

test("unifilar desenha entrada, setores e não medido", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/unifilar`);
  await expect(page.getByText("Rede da concessionária")).toBeVisible();
  await expect(page.getByText("Padaria").first()).toBeVisible();
  await expect(page.getByText("Não medido").first()).toBeVisible();
});

test("comparar dois medidores", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/comparar`);
  for (const name of [/QD-01 Câmaras frias/, /QD-02 Iluminação/]) {
    await page.getByRole("combobox", { name: "Adicionar medidor" }).click();
    await page.getByRole("option", { name }).click();
  }
  await expect(page.getByRole("heading", { name: "Resumo do período" })).toBeVisible();
  await expect(page).toHaveURL(/m=/);
});

test("alarme do Painel aparece marcado e o relatório abre", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/alarmes`);
  await expect(page.getByText("QGBT-01 — Fator de potência abaixo do mínimo")).toBeVisible();
  await expect(page.getByText("Painel da loja").first()).toBeVisible();

  await page.goto(`/relatorio/${E2E.slug}`);
  await expect(page.getByRole("heading", { name: /Relatório de energia/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Consumo por setor" })).toBeVisible();
});
