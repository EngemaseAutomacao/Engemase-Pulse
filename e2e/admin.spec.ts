import { expect, test } from "@playwright/test";
import { E2E, login } from "./fixtures";

test("saúde do sistema lista a unidade enviando", async ({ page }) => {
  await login(page);
  await page.goto("/admin/saude");
  const row = page.getByRole("row", { name: new RegExp(E2E.siteName) });
  await expect(row).toBeVisible();
  await expect(row.getByText("Enviando")).toBeVisible();
});

test("convite: o administrador do cliente cria o acesso e a pessoa define a senha", async ({ page, browser }) => {
  const email = `convidado-${Date.now()}@e2e.test`;
  await login(page);
  await page.goto(`/app/${E2E.slug}/usuarios`);
  await page.fill("#name", "Pessoa Convidada");
  await page.fill("#email", email);
  await page.getByRole("button", { name: "Convidar" }).click();
  const link = await page.getByRole("textbox", { name: "Link para definir a senha" }).inputValue();
  expect(link).toContain("/login/redefinir?token=");

  const guest = await (await browser.newContext()).newPage();
  await guest.goto(link);
  await guest.fill("#newPassword", "SenhaDoConvidado123");
  await guest.fill("#confirmPassword", "SenhaDoConvidado123");
  await guest.getByRole("button", { name: /Salvar senha/ }).click();
  await expect(guest).toHaveURL(/senha=definida/);
  await guest.fill("#email", email);
  await guest.fill("#password", "SenhaDoConvidado123");
  await guest.click("button[type=submit]");
  await expect(guest).toHaveURL(new RegExp(`/app/${E2E.slug}`));
  // Visualizador não vê a gestão de usuários.
  await expect(guest.getByRole("link", { name: "Usuários" })).toHaveCount(0);

  await page.reload();
  const member = page.locator("li", { hasText: email });
  await member.getByRole("button", { name: "Remover" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Remover|Excluir/ })
    .click();
  await expect(page.locator("li", { hasText: email })).toHaveCount(0);
});
