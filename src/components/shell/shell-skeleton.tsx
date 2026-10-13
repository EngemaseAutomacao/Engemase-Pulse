import { Skeleton } from "@/components/ui/skeleton";
import { PageSkeleton } from "./page";

/** Esqueleto da área logada (barra lateral + conteúdo) enquanto a sessão é verificada. */
export function ShellSkeleton() {
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-64 shrink-0 flex-col gap-6 border-r bg-sidebar p-4 md:flex">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-5 w-32" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <PageSkeleton />
      </div>
    </div>
  );
}
