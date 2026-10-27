// Montagem do Resumo Diário: a mesma ordenação e o mesmo conteúdo valem pra
// tela, imagem (PNG/cópia), CSV e impressão.
import { baixarCSV, numeroCSV } from "@/core/exportar";
import { dataBR, moeda } from "@/core/formato";
import type { Relatorio } from "@/core/imagem";
import type { Compra } from "@/tipos/api";

/** Área em ordem alfabética; dentro da área, do maior valor para o menor. */
export function ordenarCompras(cs: Compra[]): Compra[] {
  return [...cs].sort(
    (a, b) => a.area.localeCompare(b.area, "pt-BR", { sensitivity: "base" }) || b.valor - a.valor,
  );
}

export function ordenarOrcamentos(cs: Compra[]): Compra[] {
  return [...cs].sort(
    (a, b) =>
      a.area.localeCompare(b.area, "pt-BR", { sensitivity: "base" }) ||
      a.solicitante.localeCompare(b.solicitante, "pt-BR"),
  );
}

export function separar(todas: Compra[]) {
  const compras = ordenarCompras(todas.filter((c) => c.tipo === "compra"));
  const orcamentos = ordenarOrcamentos(todas.filter((c) => c.tipo === "orcamento"));
  const total = Math.round(compras.reduce((s, c) => s + c.valor, 0) * 100) / 100;
  return { compras, orcamentos, total };
}

export function relatorioDoDia(data: string, todas: Compra[]): Relatorio {
  const { compras, orcamentos, total } = separar(todas);
  return {
    titulo: "Resumo diário de compras",
    subtitulo: dataBR(data),
    indicadores: [
      { rotulo: "Total do dia", valor: moeda(total) },
      { rotulo: "Compras realizadas", valor: String(compras.length) },
      { rotulo: "Orçamentos realizados", valor: String(orcamentos.length) },
    ],
    largura: 1600,
    secoes: [
      {
        titulo: "Compras realizadas",
        colunas: [
          { titulo: "Data", largura: 7 },
          { titulo: "Solicitante", largura: 8 },
          { titulo: "Área", largura: 9 },
          { titulo: "Cód. forn.", largura: 6 },
          { titulo: "Fornecedor", largura: 13 },
          { titulo: "OCS", largura: 6 },
          { titulo: "Descrição", largura: 18 },
          { titulo: "Valor", largura: 9, alinhar: "dir" },
          { titulo: "Prazo", largura: 8 },
          { titulo: "Provisionado", largura: 8, alinhar: "centro" },
          { titulo: "Autorizador", largura: 7 },
          { titulo: "Aprovador", largura: 7 },
        ],
        linhas: compras.map((c) => [
          dataBR(c.data),
          c.solicitante,
          c.area,
          c.codigoFornecedor,
          c.fornecedor,
          c.ocs,
          c.descricao,
          { texto: moeda(c.valor), negrito: true },
          c.prazoPagamento,
          { texto: c.provisionado || "-", perigo: c.provisionado === "PENDENTE" },
          c.autorizador,
          c.aprovador,
        ]),
        rodape: compras.length
          ? ["", "", "", "", "", "", `Total do dia · ${compras.length} lançamento(s)`, moeda(total), "", "", "", ""]
          : undefined,
        vazio: "Nenhuma compra lançada neste dia.",
      },
      ...(orcamentos.length
        ? [
            {
              titulo: "Orçamentos realizados",
              colunas: [
                { titulo: "Solicitante", largura: 12 },
                { titulo: "Área", largura: 12 },
                { titulo: "Descrição", largura: 50 },
                { titulo: "Situação", largura: 12, alinhar: "centro" as const },
              ],
              linhas: orcamentos.map((c) => [c.solicitante, c.area, c.descricao, c.situacao || "EM COTAÇÃO"]),
            },
          ]
        : []),
    ],
  };
}

export function exportarCSVDoDia(data: string, todas: Compra[]) {
  const { compras, orcamentos, total } = separar(todas);
  const linhas: unknown[][] = compras.map((c) => [
    "Compra",
    dataBR(c.data),
    c.solicitante,
    c.area,
    c.cnpj,
    c.codigoFornecedor,
    c.fornecedor,
    c.ocs,
    c.descricao,
    numeroCSV(c.valor),
    c.prazoPagamento,
    c.provisionado,
    c.autorizador,
    c.aprovador,
    c.situacao,
  ]);
  linhas.push(["Total do dia", "", "", "", "", "", "", "", "", numeroCSV(total), "", "", "", "", ""]);
  for (const c of orcamentos) {
    linhas.push(["Orçamento", dataBR(c.data), c.solicitante, c.area, "", "", "", "", c.descricao, "", "", "", "", "", c.situacao]);
  }
  baixarCSV(
    `resumo-diario-${data}.csv`,
    ["Tipo", "Data", "Solicitante", "Área", "CNPJ", "Cód. fornecedor", "Fornecedor", "OCS", "Descrição", "Valor", "Prazo", "Provisionado", "Autorizador", "Aprovador", "Situação"],
    linhas,
  );
}
