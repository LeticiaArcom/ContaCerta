// Liga um schema zod ao react-hook-form. Faz o mesmo que o zodResolver do
// @hookform/resolvers, mas tipado: as versões fixadas no template
// (@hookform/resolvers 5.5 com react-hook-form 7.53) não batem nos tipos
// (Resolver com 3 parâmetros), o que deixa o resolver oficial como `any`.
import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";
import type { z } from "zod";

export function resolverZod<S extends z.ZodType<FieldValues, FieldValues>>(schema: S): Resolver<z.infer<S>> {
  return (valores) => {
    const resultado = schema.safeParse(valores);
    if (resultado.success) return { values: resultado.data as z.infer<S>, errors: {} };
    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of resultado.error.issues) {
      const caminho = issue.path.join(".");
      if (!errors[caminho]) errors[caminho] = { type: issue.code, message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<z.infer<S>> };
  };
}
