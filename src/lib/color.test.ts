import { describe, expect, it } from "vitest";
import { primaryForLightTheme, readableTextOn } from "./color";

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("primaryForLightTheme", () => {
  it.each(["#5cbdb9", "#38bdf8", "#fbbf24", "#a3e635", "#ff6b6b", "#ffffff"])(
    "escurece %s até ler bem no branco e no fundo claro",
    (hex) => {
      const out = primaryForLightTheme(hex);
      expect(out).toMatch(/^#[0-9a-f]{6}$/);
      expect(contrast(out, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(out, "#f3f6f9")).toBeGreaterThanOrEqual(4.5);
      expect(readableTextOn(out)).toBe("#ffffff");
    },
  );

  it("mantém o tom da cor (turquesa continua turquesa)", () => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(primaryForLightTheme("#5cbdb9").slice(i, i + 2), 16));
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(r);
  });

  it("não mexe em cor que já é escura", () => {
    expect(primaryForLightTheme("#0C2340")).toBe("#0c2340");
    expect(primaryForLightTheme("#1d4ed8")).toBe("#1d4ed8");
  });
});
