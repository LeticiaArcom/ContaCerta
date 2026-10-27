import * as RTabs from "@radix-ui/react-tabs";
import type { ComponentProps } from "react";
import { cn } from "@/core/cn";

export const Tabs = RTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RTabs.List>) {
  return (
    <RTabs.List
      className={cn("inline-flex flex-wrap gap-1 rounded-md border border-surface-border bg-white p-1 shadow-sm print:hidden", className)}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "rounded-md px-4 py-2 text-sm font-semibold text-arcom-gray transition duration-fast hover:text-verde-arcom data-[state=active]:bg-verde-escuro data-[state=active]:text-white",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RTabs.Content>) {
  return <RTabs.Content className={cn("mt-4 focus-visible:outline-none", className)} {...props} />;
}
