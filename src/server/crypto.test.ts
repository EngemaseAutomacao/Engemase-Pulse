import { describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret, hashPassword, hashSessionToken, verifyPassword } from "./crypto";

describe("senhas", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const hash = await hashPassword("senha-forte-123");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("senha-forte-123", hash)).toBe(true);
    expect(await verifyPassword("senha-errada", hash)).toBe(false);
    expect(await verifyPassword("qualquer", "formato-invalido")).toBe(false);
  });
});

describe("segredos (token do InfluxDB)", () => {
  it("cifra com IV aleatório e decifra de volta", () => {
    const a = encryptSecret("meu-token");
    const b = encryptSecret("meu-token");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("meu-token");
  });

  it("detecta adulteração", () => {
    const [iv, tag, data] = encryptSecret("meu-token").split(".");
    const tampered = [iv, tag, Buffer.from("outro").toString("base64")].join(".");
    expect(() => decryptSecret(tampered)).toThrow();
    expect(data).toBeTruthy();
  });
});

describe("tokens de sessão", () => {
  it("guarda só o hash (determinístico)", () => {
    expect(hashSessionToken("abc")).toBe(hashSessionToken("abc"));
    expect(hashSessionToken("abc")).toHaveLength(64);
  });
});
