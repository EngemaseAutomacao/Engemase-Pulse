import { describe, expect, it } from "vitest";
import { meterLabel, plantTag } from "./meter-label";

describe("nome do medidor", () => {
  it("esconde o id interno do configurador e mantém a TAG da planta", () => {
    expect(plantTag("refrigerados")).toBeNull();
    expect(plantTag("ilhas_de_frios")).toBeNull();
    expect(plantTag("7kt_entrada")).toBeNull();
    expect(plantTag("QD-01")).toBe("QD-01");
    expect(plantTag(null)).toBeNull();
    expect(meterLabel({ tag: "refrigerados", name: "Refrigerados" })).toBe("Refrigerados");
    expect(meterLabel({ tag: "QD-01", name: "Câmaras frias" })).toBe("QD-01 Câmaras frias");
  });
});
