// Gera os ícones do PWA a partir do logo. Rode de novo se o logo mudar:
//   node scripts/generate-icons.mjs
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "public/brand/engemase-icon.png";
const BACKGROUND = "#0c2340";

await mkdir("public/icons", { recursive: true });

// Ícones "any": o próprio logo (redondo, fundo transparente).
for (const size of [192, 512]) {
  await sharp(SOURCE).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}

// Maskable (Android recorta em círculo/squircle): logo em 72% sobre fundo sólido.
async function onBackground(size, scale, file) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SOURCE).resize(inner, inner).png().toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: BACKGROUND } })
    .composite([{ input: logo, gravity: "center" }])
    .png()
    .toFile(file);
}
await onBackground(512, 0.72, "public/icons/maskable-512.png");
// iOS não aceita transparência no ícone da Tela de Início.
await onBackground(180, 0.86, "src/app/apple-icon.png");

// Badge das notificações (Android): silhueta branca em fundo transparente.
const bolt = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="96" height="96">
  <path fill="#fff" d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/></svg>`;
await sharp(Buffer.from(bolt)).png().toFile("public/icons/badge-96.png");

console.log("Ícones gerados em public/icons e src/app/apple-icon.png");
