"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormMessage, SubmitButton } from "@/components/forms/field";
import { useActionToast } from "@/components/forms/use-action-toast";
import { IDLE, errorState, type ActionState } from "@/lib/action-state";

/** Maior lado depois da redução: cobre a metade da tela em monitores de alta densidade. */
const MAX_SIDE = 2400;
/** Mesmo teto do servidor (LOGIN_BACKGROUND_MAX_BYTES). */
const MAX_BYTES = 1536 * 1024;

/**
 * Reduz a foto no navegador antes de enviar: foto de celular costuma ter
 * 4–8 MB e não precisa de tudo isso atrás da tela de login. Se o navegador
 * não conseguir abrir o arquivo, envia o original e o servidor decide.
 */
async function shrink(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const encode = (type: string, quality: number) =>
      new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
    let blob = await encode("image/webp", 0.82);
    // Navegador sem WEBP devolve PNG, que fica enorme para foto.
    if (blob?.type !== "image/webp") blob = await encode("image/jpeg", 0.85);
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], blob.type === "image/webp" ? "fundo.webp" : "fundo.jpg", { type: blob.type });
  } catch {
    return file;
  }
}

/** Envio da imagem de fundo do lado esquerdo da tela de login. */
export function LoginBackgroundForm({
  action,
  imageUrl,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  imageUrl: string | null;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const [state, formAction] = useActionState(async (previous: ActionState, formData: FormData) => {
    const file = formData.get("background");
    if (formData.get("remove") !== "1" && file instanceof File && file.size > 0) {
      const small = await shrink(file);
      if (small.size > MAX_BYTES) return errorState("A imagem deve ter no máximo 1,5 MB.");
      formData.set("background", small);
    }
    const result = await action(previous, formData);
    // O formulário é limpo após o envio; a prévia passa a ser a imagem salva.
    if (result.status === "success") setPreview(null);
    return result;
  }, IDLE);
  useActionToast(state);

  const shown = preview ?? imageUrl;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="relative aspect-[4/3] w-40 overflow-hidden rounded-xl border bg-sidebar">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element -- imagem vem do banco ou do arquivo escolhido
          <img src={shown} alt="Imagem de fundo atual" className="size-full object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center p-2 text-center text-xs text-muted-foreground">
            Fundo padrão
          </span>
        )}
      </div>
      <form action={formAction} className="grid min-w-64 flex-1 gap-3">
        <Input
          name="background"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Arquivo da imagem de fundo"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0];
            setPreview(file ? URL.createObjectURL(file) : null);
          }}
        />
        <p className="text-xs text-muted-foreground">
          PNG, JPG ou WEBP. Prefira foto na horizontal (a loja, a fachada, o quadro elétrico). A imagem é reduzida antes
          do envio e aparece escurecida atrás do texto, para ele continuar legível.
        </p>
        <FormMessage state={state} />
        <div className="flex gap-2">
          <SubmitButton size="sm" pendingText="Enviando…">
            Enviar imagem
          </SubmitButton>
          {imageUrl && (
            <Button type="submit" name="remove" value="1" variant="ghost" size="sm" formNoValidate>
              Remover
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
