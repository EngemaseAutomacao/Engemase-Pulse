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

test("histórico: ocultar pena, trocar a cor e comparar com o período anterior", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/medidores`);
  await page.getByRole("link", { name: /Câmaras frias/ }).first().click();
  const history = page.locator("section[aria-labelledby=history-title]");
  await expect(history.locator(".recharts-line-curve")).toHaveCount(4);

  await history.getByRole("button", { name: "L2", exact: true }).click();
  await expect(history.getByRole("button", { name: "L2", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(history.locator(".recharts-line-curve")).toHaveCount(3);

  await history.getByRole("button", { name: "Cor de L1" }).click();
  await page.getByRole("radio", { name: "Rosa" }).click();
  await page.keyboard.press("Escape");
  await expect(history.locator(".recharts-line-curve").first()).toHaveAttribute("stroke", "#d6457f");

  // Fica salvo neste navegador.
  await page.reload();
  await expect(history.locator(".recharts-line-curve")).toHaveCount(3);
  await history.getByRole("button", { name: "Mostrar todas" }).click();
  await history.getByRole("button", { name: "Cores padrão" }).click();

  await expect(history.getByRole("columnheader", { name: "Máximo" })).toBeVisible();
  await history.getByRole("button", { name: "Comparar com anterior" }).click();
  await expect(history.getByRole("columnheader", { name: "Média anterior" })).toBeVisible();
});

test("metas: o administrador define a meta e vê a projeção", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/metas`);
  const row = page.locator("li", { hasText: "Unidade inteira" }).first();
  await expect(row).toBeVisible();
  await row.getByLabel("Meta kWh/mês").fill("1.000");
  await row.getByRole("button", { name: "Salvar" }).click();
  await expect(page.getByText(/Meta de Unidade inteira salva/)).toBeVisible();
  await page.reload();
  await expect(page.locator("li", { hasText: "Unidade inteira" }).first().getByText("Meta 1.000 kWh")).toBeVisible();
});

test("fatura: simulador de tarifa e recomendação de capacitores", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/fatura`);
  await expect(page.getByRole("heading", { name: "Fator de potência e capacitores" })).toBeVisible();
  await page.getByRole("link", { name: "Simular tarifa e demanda" }).click();
  await expect(page.getByRole("heading", { name: "Quanto custaria" })).toBeVisible();
  await expect(page.getByLabel("Contratada hoje (kW)")).toHaveValue("120");
});

test("tela de TV alterna entre agora, alarmes e consumo", async ({ page }) => {
  await page.goto(`/tv/${E2E.slug}`);
  await expect(page.getByText("Potência total")).toBeVisible();
  await page.getByRole("button", { name: "Alarmes", exact: true }).click();
  await expect(page.getByText("Fator de potência abaixo do mínimo").first()).toBeVisible();
  await page.getByRole("button", { name: "Consumo de hoje", exact: true }).click();
  await expect(page.getByText("kWh hoje").first()).toBeVisible();
});

test("usuários: escalonamento e avisos por pessoa", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}/usuarios`);
  await page.getByLabel("Prazo do escalonamento").selectOption("15");
  await expect(page.getByText("Escalonamento após 15 min sem reconhecimento.")).toBeVisible();
  await page.getByLabel("Prazo do escalonamento").selectOption("0");
});

test("ajuda: manual e perguntas frequentes com busca", async ({ page }) => {
  await page.goto(`/app/${E2E.slug}`);
  await page.getByRole("link", { name: "Ajuda" }).click();
  await expect(page.getByRole("heading", { name: "Perguntas frequentes" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Manual do usuário" })).toBeVisible();
  await page.getByLabel("Buscar na ajuda").fill("telegram");
  await expect(page.getByText("Como recebo os alarmes pelo Telegram?")).toBeVisible();
  await expect(page.getByText("Esqueci a senha.")).toHaveCount(0);
});
