import * as RDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/core/cn";

export function Dialog({
  aberto,
  aoMudar,
  titulo,
  descricao,
  children,
  rodape,
  largura = "max-w-lg",
}: {
  aberto: boolean;
  aoMudar: (aberto: boolean) => void;
  titulo: ReactNode;
  descricao?: ReactNode;
  children?: ReactNode;
  rodape?: ReactNode;
  largura?: string;
}) {
  return (
    <RDialog.Root open={aberto} onOpenChange={aoMudar}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-40 bg-verde-escuro/40 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <RDialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg border border-surface-border bg-white shadow-lg duration-slow data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
            largura,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-surface-border px-5 py-4">
            <div>
              <RDialog.Title className="text-lg font-semibold text-verde-escuro">{titulo}</RDialog.Title>
              {descricao ? (
                <RDialog.Description className="mt-1 text-sm text-arcom-gray">{descricao}</RDialog.Description>
              ) : (
                <RDialog.Description className="sr-only">{typeof titulo === "string" ? titulo : "Janela"}</RDialog.Description>
              )}
            </div>
            <RDialog.Close className="rounded-md p-1 text-arcom-gray transition duration-fast hover:bg-surface hover:text-verde-escuro" aria-label="Fechar">
              <X className="size-5" />
            </RDialog.Close>
          </div>
          {children ? <div className="overflow-y-auto px-5 py-4">{children}</div> : null}
          {rodape ? <div className="flex flex-wrap justify-end gap-2 border-t border-surface-border px-5 py-3">{rodape}</div> : null}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}
