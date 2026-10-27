// Modelo do formulário de compra (Lançar compra e edição pelo histórico):
// schema zod, valores vazios e conversão de/para o formato da API.
import { z } from "zod";
import { hojeISO, lerNumero, numero } from "@/core/formato";
import type { Compra, EntradaCompra, Provisionado, TipoLancamento } from "@/tipos/api";

export function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Máscara progressiva 00.000.000/0000-00. */
export function mascararCNPJ(s: string): string {
  const d = soDigitos(s).slice(0, 14);
  let out = d.slice(0, 2);
  if (d.length > 2) out += `.${d.slice(2, 5)}`;
  if (d.length > 5) out += `.${d.slice(5, 8)}`;
  if (d.length > 8) out += `/${d.slice(8, 12)}`;
  if (d.length > 12) out += `-${d.slice(12, 14)}`;
  return out;
}

/** Confere os dois dígitos verificadores (mesma regra do backend). */
export function cnpjValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - n);
    const soma = pesos.reduce((s2, p, i) => s2 + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

export const esquemaCompra = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data"),
  tipo: z.enum(["compra", "orcamento"]),
  solicitante: z.string().max(120, "Máximo de 120 caracteres"),
  area: z.string().min(1, "Escolha a área"),
  cnpj: z
    .string()
    .refine((v) => !v.trim() || cnpjValido(v), "CNPJ inválido"),
  codigoFornecedor: z.string().max(40, "Máximo de 40 caracteres"),
  fornecedor: z.string().max(200, "Máximo de 200 caracteres"),
  ocs: z.string().max(40, "Máximo de 40 caracteres"),
  valor: z.string().refine((v) => {
    if (!v.trim()) return true;
    const n = lerNumero(v);
    return n !== null && n >= 0;
  }, "Valor inválido"),
  prazoPagamento: z.string().max(120, "Máximo de 120 caracteres"),
  provisionado: z.enum(["PENDENTE", "SIM"]),
  autorizador: z.string().max(120, "Máximo de 120 caracteres"),
  aprovador: z.string().max(120, "Máximo de 120 caracteres"),
  situacao: z.string().max(40, "Máximo de 40 caracteres"),
  descricao: z.string().max(2000, "Máximo de 2000 caracteres"),
});

export type ValoresCompra = z.infer<typeof esquemaCompra>;

export function valoresVazios(data = hojeISO()): ValoresCompra {
  return {
    data,
    tipo: "compra",
    solicitante: "",
    area: "",
    cnpj: "",
    codigoFornecedor: "",
    fornecedor: "",
    ocs: "",
    valor: "",
    prazoPagamento: "",
    provisionado: "PENDENTE",
    autorizador: "",
    aprovador: "",
    situacao: "",
    descricao: "",
  };
}

/** Algo além da data/padrões foi preenchido? */
export function temConteudo(v: ValoresCompra): boolean {
  return [
    v.solicitante,
    v.area,
    v.cnpj,
    v.codigoFornecedor,
    v.fornecedor,
    v.ocs,
    v.valor,
    v.prazoPagamento,
    v.autorizador,
    v.aprovador,
    v.situacao,
    v.descricao,
  ].some((s) => s.trim() !== "");
}

export function deCompra(c: Compra): ValoresCompra {
  const prov: Provisionado = c.provisionado === "SIM" ? "SIM" : "PENDENTE";
  return {
    data: c.data,
    tipo: c.tipo,
    solicitante: c.solicitante,
    area: c.area,
    cnpj: c.cnpj,
    codigoFornecedor: c.codigoFornecedor,
    fornecedor: c.fornecedor,
    ocs: c.ocs,
    valor: c.valor ? numero(c.valor, 2) : "",
    prazoPagamento: c.prazoPagamento,
    provisionado: prov,
    autorizador: c.autorizador,
    aprovador: c.aprovador,
    situacao: c.situacao,
    descricao: c.descricao,
  };
}

export function paraEntrada(v: ValoresCompra, versao: number): EntradaCompra {
  const up = (s: string) => s.trim().toUpperCase();
  return {
    tipo: v.tipo as TipoLancamento,
    data: v.data,
    solicitante: up(v.solicitante),
    area: v.area,
    cnpj: v.cnpj.trim(),
    codigoFornecedor: v.codigoFornecedor.trim(),
    fornecedor: up(v.fornecedor),
    ocs: v.ocs.trim(),
    descricao: v.descricao.trim(),
    valor: lerNumero(v.valor) ?? 0,
    prazoPagamento: up(v.prazoPagamento),
    provisionado: v.provisionado,
    autorizador: up(v.autorizador),
    aprovador: up(v.aprovador),
    situacao: v.situacao.trim(),
    versao,
  };
}

export const SUGESTOES_INICIAIS = {
  solicitantes: ["ROSSI", "WESLEY", "LEANDRO", "POLLYANA"],
  fornecedores: ["BAROLO", "QUERO PASSAGEM", "MERCURE", "GALLATA"],
  aprovadores: ["FLAVIO", "ROSSI", "WESLEY", "EUSTAQUIO"],
};
