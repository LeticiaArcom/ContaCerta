// Formatação brasileira: R$ 1.250,00 e DD/MM/AAAA na tela. Internamente as
// datas continuam AAAA-MM-DD (calendário, filtros, API).
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

export const FUSO = "America/Sao_Paulo";

const moedaFmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** R$ 1.250,00 (vazio se não houver valor). */
export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  // Intl usa espaço não separável depois do "R$"; troca por espaço comum
  // pra copiar/colar e CSV ficarem previsíveis.
  return moedaFmt.format(v).replace(/\u00a0/g, " ");
}

/** 1.234,5 — número com separador brasileiro. */
export function numero(v: number | null | undefined, casas = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return v.toLocaleString("pt-BR", { maximumFractionDigits: casas });
}

/** Lê "1.234,56", "1234.56", "R$ 10,00" -> número. Vazio/ inválido -> null. */
export function lerNumero(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === "number") return Number.isFinite(texto) ? texto : null;
  let s = texto.replace(/R\$/gi, "").replace(/\s/g, "").trim();
  if (!s) return null;
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");
  if (temVirgula && temPonto) {
    // o último separador é o decimal
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (temVirgula) {
    s = s.replace(",", ".");
  } else if (temPonto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, ""); // 1.000 = mil
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** AAAA-MM-DD -> DD/MM/AAAA. */
export function dataBR(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

/** Instante ISO (UTC) -> "DD/MM/AAAA HH:mm" no fuso de Brasília. */
export function dataHoraBR(iso: string | null | undefined): string {
  if (!iso) return "";
  return dayjs(iso).tz(FUSO).format("DD/MM/YYYY HH:mm");
}

/** Hoje em AAAA-MM-DD (fuso de Brasília). */
export function hojeISO(): string {
  return dayjs().tz(FUSO).format("YYYY-MM-DD");
}

export function horaAgora(): string {
  return dayjs().tz(FUSO).format("HH:mm:ss");
}

/** "DD/MM" ou "DD/MM/AAAA" -> AAAA-MM-DD (ano atual se faltar). */
export function lerDataBR(texto: string, anoPadrao = dayjs().tz(FUSO).year()): string | null {
  const m = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(texto);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  let ano = m[3] ? Number(m[3]) : anoPadrao;
  if (ano < 100) ano += 2000;
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Diferença percentual: (preço ÷ menor - 1) × 100. */
export function diferencaPercentual(preco: number, menor: number): number {
  if (!menor) return 0;
  return (preco / menor - 1) * 100;
}

export function percentual(v: number, casas = 1): string {
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`;
}

/** Quantidade com unidade junto ao número: 24un, 12cx, 5kg. */
export function quantidade(qtd: number | null | undefined, unidade: string): string {
  if (qtd === null || qtd === undefined) return "";
  return `${numero(qtd, 3)}${unidade}`;
}

export function novoId(): string {
  return crypto.randomUUID();
}
