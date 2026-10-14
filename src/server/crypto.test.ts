import { describe, expect, it } from "vitest";
import { hashPassword, hashSessionToken, verifyPassword } from "./crypto";

describe("senhas", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const hash = await hashPassword("senha-forte-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("senha-forte-123", hash)).toBe(true);
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
    expect(await verifyPassword("qualquer", "formato-invalido")).toBe(false);
  });
});

describe("tokens de sessão", () => {
  it("guarda só o hash (determinístico)", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
    expect(hashSessionToken("abc")).toHaveLength(64);
  });
});
