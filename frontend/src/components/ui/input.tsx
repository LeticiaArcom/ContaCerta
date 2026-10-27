import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/core/cn";

const baseCampo =
  "w-full rounded-md border border-surface-border bg-white px-3 text-sm text-verde-escuro placeholder:text-arcom-gray/60 transition duration-fast focus:border-verde-arcom focus:outline-none focus:ring-2 focus:ring-verde-arcom/20 disabled:bg-surface disabled:text-arcom-gray aria-[invalid=true]:border-danger";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(baseCampo, "h-10", className)} {...props} />,
);
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => <textarea ref={ref} className={cn(baseCampo, "min-h-20 py-2", className)} {...props} />,
);
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(baseCampo, "h-10 pr-8", className)} {...props}>
      {children}
    </select>
  ),
);
Select.displayName = "Select";

/** Rótulo + campo + dica/erro. */
export function Campo({
  rotulo,
  htmlFor,
  erro,
  dica,
  className,
  children,
}: {
  rotulo: string;
  htmlFor?: string;
  erro?: string;
  dica?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-bold uppercase tracking-wider text-arcom-gray">
        {rotulo}
      </label>
      {children}
      {erro ? <p className="text-xs font-medium text-danger">{erro}</p> : dica ? <p className="text-xs text-arcom-gray">{dica}</p> : null}
    </div>
  );
}

/** Campo compacto para grade de cotação (sem rótulo visível). */
export const CampoGrade = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm text-verde-escuro transition duration-fast hover:border-surface-border focus:border-verde-arcom focus:bg-white focus:outline-none",
        className,
      )}
      {...props}
    />
  ),
);
CampoGrade.displayName = "CampoGrade";
