import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/core/cn";

// Variantes do Design System ARCOM. Hover escurece (brightness), sem opacity;
// pressionado encolhe levemente.
const botao = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-verde-arcom focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.97] [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variante: {
        primary: "bg-verde-arcom text-white hover:brightness-[0.85]",
        secondary: "border border-verde-arcom bg-white text-verde-arcom hover:bg-surface",
        ghost: "text-arcom-gray hover:bg-surface hover:text-verde-arcom",
        danger: "bg-danger text-white hover:brightness-[0.85]",
        dark: "bg-verde-escuro text-white hover:brightness-[0.85]",
        accent: "bg-verde-lima text-verde-escuro hover:brightness-[0.85]",
      },
      tamanho: {
        sm: "h-8 px-3 text-xs",
        md: "h-10 px-4",
        icone: "size-8",
      },
    },
    defaultVariants: { variante: "primary", tamanho: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof botao> & { asChild?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variante, tamanho, asChild, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? "button")}
        className={cn(botao({ variante, tamanho }), className)}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
