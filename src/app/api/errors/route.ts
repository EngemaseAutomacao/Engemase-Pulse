import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCache } from "@/server/cache";
import { recordError } from "@/server/errors";

const reportSchema = z.object({
  message: z.string().max(2000),
  digest: z.string().max(200).nullish(),
  path: z.string().max(500).nullish(),
  stack: z.string().max(4000).nullish(),
});

/**
 * Erros das telas (capturados pelas páginas de erro). Público, porque a tela
 * de login também pode falhar; limitado por endereço para não virar spam.
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "sem-ip";
  if (!(await getCache().acquire(`error-report:${ip}`, 5_000))) return new NextResponse(null, { status: 204 });

  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new NextResponse(null, { status: 204 });
  const { message, digest, path, stack } = parsed.data;
  await recordError({ source: "navegador", message, digest, path, detail: stack });
  return new NextResponse(null, { status: 204 });
}
