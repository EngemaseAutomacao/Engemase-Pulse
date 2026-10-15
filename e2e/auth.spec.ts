import { expect, test } from "@playwright/test";
import { ADMIN, login } from "./fixtures";

test("senha errada mostra o erro e a certa entra na administração", async ({ page }) => {
  await page.goto("/login");
  await page.fill("#email", ADMIN.email);
  await page.fill("#password", "senha-errada-123");
  await page.click("button[type=submit]");
  await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();

  await login(page);
  await expect(page).toHaveURL(/\/admin/);
});

test("esqueci minha senha abre a partir do login", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Esqueci minha senha" }).click();
  await expect(page.getByRole("heading", { name: "Esqueci minha senha" })).toBeVisible();
  await page.fill("#email", "ninguem@exemplo.com");
  await page.getByRole("button", { name: "Enviar link" }).click();
  // Sem e-mail configurado avisa; com e-mail, a mesma resposta para qualquer endereço.
  await expect(page.getByText(/Se o e-mail estiver cadastrado|ainda não está ativo/)).toBeVisible();
});

test("link de senha inválido não abre o formulário", async ({ page }) => {
  await page.goto("/login/redefinir?token=nao-existe-1234567890");
  await expect(page.getByRole("heading", { name: "Link inválido" })).toBeVisible();
});

test("tema escolhido fica salvo", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/login");
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Escuro" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Automático" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("tema pelo horário segue o relógio, não o aparelho", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.clock.setFixedTime(new Date("2026-10-15T22:30:00-03:00"));
  await page.goto("/login");
  await page.getByRole("radio", { name: "Pelo horário" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.clock.setFixedTime(new Date("2026-10-16T10:00:00-03:00"));
  await page.reload();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("radio", { name: "Automático" }).click();
});
