import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/core/cn";

const badge = cva("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider", {
  variants: {
    variante: {
      neutro: "bg-surface text-arcom-gray border border-surface-border",
      sucesso: "bg-verde-arcom/10 text-verde-arcom",
      alerta: "bg-verde-lima/40 text-verde-escuro",
      perigo: "bg-danger/10 text-danger",
      escuro: "bg-verde-escuro text-white",
    },
  },
  defaultVariants: { variante: "neutro" },
});

export function Badge({ className, variante, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ variante }), className)} {...props} />;
}

/** Badge de situação com a cor certa para cada estado do fluxo. */
export function BadgeSituacao({ situacao }: { situacao: string }) {
  const s = situacao.toUpperCase();
  const variante =
    s === "CONCLUÍDO" || s === "PAGO" || s === "SIM"
      ? "sucesso"
      : s === "APROVADO" || s === "PEDIDO EMITIDO" || s === "PEDIDOS ENVIADOS" || s === "FECHADO" || s === "ENVIADO"
        ? "escuro"
        : s === "PENDENTE" || s === "EM NEGOCIAÇÃO"
          ? "alerta"
          : "neutro";
  return <Badge variante={variante}>{situacao || "-"}</Badge>;
}
