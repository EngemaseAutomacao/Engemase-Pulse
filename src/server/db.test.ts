import { describe, expect, it } from "vitest";
import { withExplicitSslMode } from "./db";

describe("withExplicitSslMode", () => {
  it("troca require/prefer/verify-ca por verify-full e mantém o resto", () => {
    expect(withExplicitSslMode("postgresql://u:p@host/db?sslmode=require&channel_binding=require")).toBe(
      "postgresql://u:p@host/db?sslmode=verify-full&channel_binding=require",
    );
    expect(withExplicitSslMode("postgresql://u:p@host/db?connect_timeout=5&sslmode=prefer")).toBe(
      "postgresql://u:p@host/db?connect_timeout=5&sslmode=verify-full",
    );
    expect(withExplicitSslMode("postgresql://u:p@host/db?sslmode=verify-ca")).toBe("postgresql://u:p@host/db?sslmode=verify-full");
  });

  it("não mexe em quem não usa SSL ou já é explícito", () => {
    expect(withExplicitSslMode("postgres://test@localhost:5432/test")).toBe("postgres://test@localhost:5432/test");
    expect(withExplicitSslMode("postgres://h/db?sslmode=disable")).toBe("postgres://h/db?sslmode=disable");
    expect(withExplicitSslMode("postgres://h/db?sslmode=verify-full")).toBe("postgres://h/db?sslmode=verify-full");
  });
});
