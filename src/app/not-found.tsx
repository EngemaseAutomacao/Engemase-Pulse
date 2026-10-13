import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/app";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- imagem estática da marca */}
        <img src={BRAND.logo} alt="" className="mx-auto size-16 rounded-full" />
        <h1 className="text-2xl font-semibold">Página não encontrada</h1>
        <p className="text-sm text-muted-foreground">
          O endereço não existe ou você não tem acesso a ele. Confira o link ou volte ao início.
        </p>
        <Button asChild>
          <Link href="/">Ir para o início</Link>
        </Button>
      </div>
    </main>
  );
}
