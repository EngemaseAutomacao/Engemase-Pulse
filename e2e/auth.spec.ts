import { expect, test } from "@playwright/test";
import { ADMIN, E2E, login } from "./fixtures";

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

test("escuro é preto, e o automático segue o aparelho", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/login");
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("no automático, o menu diz em que modo o navegador está", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await login(page);
  await page.goto(`/app/${E2E.slug}`);
  await page.getByRole("button", { name: /Equipe da plataforma|Administrador/ }).last().click();
  await expect(page.getByText(/Seguindo o navegador, que está em modo/)).toContainText("escuro");
});
