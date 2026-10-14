import { describe, expect, it } from "vitest";
import { normalizeErrorMessage, normalizeErrorPath } from "./error-report";

describe("agrupamento de erros", () => {
  it("troca ids da rota e tira a query string", () => {
    expect(normalizeErrorPath("/app/superviza/medidores/f1e5959e-ce70-4bef-a5e3-3edc8cf1c537?x=1")).toBe(
      "/app/superviza/medidores/:id",
    );
    expect(normalizeErrorPath("/api/alarmes/123/ack")).toBe("/api/alarmes/:n/ack");
    expect(normalizeErrorPath(null)).toBeNull();
  });

  it("mensagens que só mudam em id, data ou número grande caem no mesmo grupo", () => {
    const a = normalizeErrorMessage(
      "Medidor 11111111-1111-4111-8111-111111111111 falhou em 2026-10-14T19:51:22.394Z (1792007841696)",
    );
    const b = normalizeErrorMessage(
      "Medidor 22222222-2222-4222-8222-222222222222 falhou em 2026-10-15T08:00:00.000Z (1792999999999)",
    );
    expect(a).toBe(b);
  });
});
