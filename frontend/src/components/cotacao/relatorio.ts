// Saídas da cotação: imagem executiva, CSV e texto do pedido por fornecedor.
import { escolher, idsAlternativos, menorPrecoItem, porFornecedor, preco, totalEscolhido } from "@/core/cotacao";
import { baixarCSV, nomeArquivo, numeroCSV } from "@/core/exportar";
import { dataBR, moeda, numero, quantidade } from "@/core/formato";
import type { Celula, Coluna, Relatorio } from "@/core/imagem";
import type { ItemCotacao } from "@/tipos/api";
import { type FormCotacao, nomeModulo } from "./estado";

export function comEstoque(f: Pick<FormCotacao, "modulo" | "categoria">): boolean {
  return f.modulo === "consumo" && (f.categoria === "Estoque" || f.categoria === "Almoxarifado");
}

function subtitulo(f: FormCotacao): string {
  const partes = [f.titulo, f.periodo && `Período ${f.periodo}`, f.ocs && `OCS ${f.ocs}`, dataBR(f.data)].filter(Boolean);
  return partes.join(" · ");
}

/** Imagem com a grade completa (ou só um fornecedor, se `fornecedorId`). */
export function relatorioCotacao(f: FormCotacao, fornecedorId?: string): Relatorio {
  const c = f.conteudo;
  const escolhas = escolher(f.modulo, c);
  const porItem = new Map(escolhas.map((e) => [e.itemId, e]));
  const alternativos = idsAlternativos(f.modulo, c.itens);
  const estoque = comEstoque(f);
  const fornecedores = fornecedorId ? c.fornecedores.filter((x) => x.id === fornecedorId) : c.fornecedores;
  const itens = c.itens.filter((it) => (fornecedorId ? porItem.get(it.id)?.fornecedorId === fornecedorId : it.nome.trim() || it.qtd));

  const colunas: Coluna[] = [{ titulo: "Nº", largura: 0.5, alinhar: "centro" }];
  if (estoque) colunas.push({ titulo: "Código ARCOM", largura: 1 });
  colunas.push({ titulo: "Item", largura: 3 }, { titulo: "Qtd", largura: 1, alinhar: "dir" }, { titulo: "Entrega", largura: 1.1 });
  if (estoque) colunas.push({ titulo: "Consumo mensal", largura: 1, alinhar: "dir" }, { titulo: "Estoque atual", largura: 1, alinhar: "dir" });
  for (const fo of fornecedores) colunas.push({ titulo: fo.nome || "Fornecedor", largura: 1.5, alinhar: "dir" });
  colunas.push({ titulo: "Escolhido", largura: 1.4, alinhar: "dir" });

  const linhas: Celula[][] = itens.map((it, i) => {
    const e = porItem.get(it.id);
    const menor = menorPrecoItem(it, c.fornecedores);
    const l: Celula[] = [String(c.itens.indexOf(it) + 1 || i + 1)];
    if (estoque) l.push(it.codigoArcom);
    l.push(alternativos.has(it.id) ? `${it.nome} (opção)` : it.nome, quantidade(it.qtd, it.unidade), dataBR(it.entrega));
    if (estoque) l.push(numero(it.consumoMensal), numero(it.estoqueAtual));
    for (const fo of fornecedores) {
      const p = preco(it.precos[fo.id]);
      if (!p) {
        l.push("-");
        continue;
      }
      const escolhido = e?.fornecedorId === fo.id && e.itemId === it.id;
      const texto = alternativos.has(it.id) ? `${moeda(p)}\n${moeda(p * preco(it.qtd))}` : moeda(p);
      l.push({ texto, destaque: escolhido || (!e && p === menor) });
    }
    l.push(e && e.itemId === it.id ? { texto: moeda(e.total), negrito: true } : "");
    return l;
  });

  const total = fornecedorId
    ? escolhas.filter((e) => e.fornecedorId === fornecedorId).reduce((s, e) => s + e.total, 0)
    : totalEscolhido(escolhas);
  const rodape: Celula[] = colunas.map((_, i) => (i === 1 ? "Total escolhido" : i === colunas.length - 1 ? moeda(total) : ""));

  const resumo = porFornecedor(c, escolhas).filter((r) => !fornecedorId || r.fornecedor.id === fornecedorId);
  return {
    titulo: fornecedorId ? `Pedido · ${fornecedores[0]?.nome ?? ""}` : nomeModulo(f),
    subtitulo: subtitulo(f),
    indicadores: [
      { rotulo: "Total escolhido", valor: moeda(total) },
      { rotulo: "Itens", valor: String(itens.length) },
      { rotulo: "Situação", valor: f.situacao },
    ],
    secoes: [
      { colunas, linhas, rodape },
      ...(fornecedorId
        ? []
        : [
            {
              titulo: "Distribuição por fornecedor",
              colunas: [
                { titulo: "Fornecedor", largura: 3 },
                { titulo: "Itens", largura: 1, alinhar: "dir" as const },
                { titulo: "Pagamento", largura: 2 },
                { titulo: "Entrega", largura: 2 },
                { titulo: "Total", largura: 1.5, alinhar: "dir" as const },
              ],
              linhas: resumo.map((r) => [r.fornecedor.nome, String(r.itens), r.fornecedor.pagamento, r.fornecedor.entrega, moeda(r.total)]),
              vazio: "Nenhum preço informado.",
            },
          ]),
    ],
    observacao: f.descricao || undefined,
    largura: Math.max(1200, 900 + fornecedores.length * 170),
  };
}

export function exportarCSV(f: FormCotacao) {
  const c = f.conteudo;
  const escolhas = escolher(f.modulo, c);
  const porItem = new Map(escolhas.map((e) => [e.itemId, e]));
  const estoque = comEstoque(f);
  const nomes = new Map(c.fornecedores.map((x) => [x.id, x.nome]));
  const meta: unknown[][] = [
    ["Tipo", nomeModulo(f)],
    ["Nome", f.titulo],
    ["Data", dataBR(f.data)],
    ["Período", f.periodo],
    ["OCS", f.ocs],
    ["Solicitante", f.solicitante],
    ["Centro de custo", f.centroCusto],
    ["Situação", f.situacao],
    ["Provisionado", f.provisionado],
    ["Descrição", f.descricao],
    [],
  ];
  const cab = ["Nº", ...(estoque ? ["Código ARCOM"] : []), "Item", "Quantidade", "Unidade", "Entrega", ...(estoque ? ["Consumo mensal", "Estoque atual"] : []),
    ...c.fornecedores.map((x) => `${x.nome} (unitário)`), "Fornecedor escolhido", "Unitário escolhido", "Total escolhido"];
  const linhas = c.itens
    .filter((it) => it.nome.trim() || it.qtd)
    .map((it, i) => {
      const e = porItem.get(it.id);
      return [
        i + 1,
        ...(estoque ? [it.codigoArcom] : []),
        it.nome,
        numeroCSV(it.qtd),
        it.unidade,
        dataBR(it.entrega),
        ...(estoque ? [numeroCSV(it.consumoMensal), numeroCSV(it.estoqueAtual)] : []),
        ...c.fornecedores.map((x) => numeroCSV(it.precos[x.id] ?? null)),
        e ? nomes.get(e.fornecedorId) : "",
        e ? numeroCSV(e.precoUnitario) : "",
        e ? numeroCSV(e.total) : "",
      ];
    });
  const termos = c.fornecedores.map((x) => [x.nome, x.pagamento, x.entrega, x.frete, x.observacoes]);
  baixarCSV(
    nomeArquivo(`${nomeModulo(f)} ${f.titulo || f.periodo} ${f.data}`, "csv"),
    ["Campo", "Valor"],
    [
      ...meta,
      cab,
      ...linhas,
      [],
      ["Total escolhido", numeroCSV(totalEscolhido(escolhas))],
      [],
      ["Fornecedor", "Pagamento", "Entrega", "Frete", "Observações"],
      ...termos,
    ].map((l) => l),
  );
}

/** Texto do pedido de um fornecedor (WhatsApp / e-mail). */
export function textoPedido(f: FormCotacao, fornecedorId: string): string {
  const c = f.conteudo;
  const fo = c.fornecedores.find((x) => x.id === fornecedorId);
  const escolhas = escolher(f.modulo, c).filter((e) => e.fornecedorId === fornecedorId);
  const itens = new Map(c.itens.map((it) => [it.id, it] as [string, ItemCotacao]));
  const pedido = c.pedidos[fornecedorId];
  const linhas = [
    `*Pedido ARCOM${pedido?.os ? ` - OS ${pedido.os}` : ""}*`,
    `Fornecedor: ${fo?.nome ?? ""}`,
    f.periodo ? `Período: ${f.periodo}` : "",
    "",
    ...escolhas.map((e) => {
      const it = itens.get(e.itemId);
      const entrega = it?.entrega ? ` - entregar até ${dataBR(it.entrega)}` : "";
      return `- ${it?.nome ?? ""}: ${quantidade(e.quantidade, it?.unidade ?? "")} x ${moeda(e.precoUnitario)} = ${moeda(e.total)}${entrega}`;
    }),
    "",
    `Total: ${moeda(escolhas.reduce((s, e) => s + e.total, 0))}`,
    fo?.pagamento ? `Pagamento: ${fo.pagamento}` : "",
  ];
  return linhas.filter((l, i, a) => l !== "" || (a[i - 1] ?? "") !== "").join("\n").trim();
}
