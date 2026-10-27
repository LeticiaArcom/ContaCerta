import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/core/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-md border border-surface-border bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({
  titulo,
  descricao,
  acoes,
  className,
}: {
  titulo: ReactNode;
  descricao?: ReactNode;
  acoes?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-surface-border px-5 py-4", className)}>
      <div>
        <h2 className="text-lg font-semibold text-verde-escuro">{titulo}</h2>
        {descricao ? <p className="mt-0.5 text-sm text-arcom-gray">{descricao}</p> : null}
      </div>
      {acoes ? <div className="flex flex-wrap items-center gap-2 print:hidden">{acoes}</div> : null}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

/** Indicador (KPI) com friso verde-lima. */
export function Indicador({
  rotulo,
  valor,
  detalhe,
  perigo,
}: {
  rotulo: string;
  valor: ReactNode;
  detalhe?: ReactNode;
  perigo?: boolean;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border border-surface-border bg-white px-4 py-3 shadow-sm">
      <span className="absolute inset-y-0 left-0 w-1 bg-verde-lima" />
      <p className="text-xs font-bold uppercase tracking-wider text-arcom-gray">{rotulo}</p>
      <p className={cn("mt-1 text-2xl font-extrabold", perigo ? "text-danger" : "text-verde-escuro")}>{valor}</p>
      {detalhe ? <p className="text-xs text-arcom-gray">{detalhe}</p> : null}
    </div>
  );
}
