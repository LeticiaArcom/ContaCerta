import { useState, type InputHTMLAttributes } from "react";
import { CampoGrade } from "@/components/ui/input";
import { lerNumero, numero } from "@/core/formato";

/** Campo numérico em formato brasileiro (aceita "1.234,56"). Mantém o texto
 * digitado enquanto o foco está nele e mostra o número formatado fora dele. */
export function CampoNumero({
  valor,
  aoMudar,
  casas = 2,
  ...props
}: {
  valor: number | null;
  aoMudar: (v: number | null) => void;
  casas?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const [texto, setTexto] = useState<string | null>(null);
  return (
    <CampoGrade
      inputMode="decimal"
      {...props}
      value={texto ?? (valor === null ? "" : numero(valor, casas))}
      onFocus={(e) => {
        setTexto(valor === null ? "" : numero(valor, casas).replace(/\./g, ""));
        props.onFocus?.(e);
      }}
      onChange={(e) => {
        setTexto(e.target.value);
        aoMudar(lerNumero(e.target.value));
      }}
      onBlur={(e) => {
        setTexto(null);
        props.onBlur?.(e);
      }}
    />
  );
}
