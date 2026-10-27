// Regras de cálculo da cotação — espelho do backend
// (backend/internal/cotacao/calculo.go). O backend é quem vale pro Resumo;
// isto aqui é pra tela mostrar o mesmo resultado enquanto se digita.
//
// - Total do item = quantidade × valor unitário.
// - O menor preço é escolhido sozinho; a escolha manual sempre prevalece.
// - Em Compras de Consumo, linhas do mesmo produto são quantidades
//   alternativas: uma única opção por grupo, a de menor valor unitário, e as
//   faixas nunca são somadas entre si.
// - Frete não entra no cálculo.
import type { ConteudoCotacao, FornecedorCotacao, ItemCotacao, Modulo } from "@/tipos/api";
import { novoId } from "./formato";

export type Escolha = {
  itemId: string;
  fornecedorId: string;
  precoUnitario: number;
  quantidade: number;
  total: number;
  manual: boolean;
};

const centavos = (v: number) => Math.round(v * 100) / 100;

export function preco(p: number | null | undefined): number {
  return p && p > 0 && Number.isFinite(p) ? p : 0;
}

export function chaveProduto(nome: string): string {
  return nome
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

/** Grupos de decisão (ver comentário do topo). */
export function grupos(modulo: Modulo, itens: ItemCotacao[]): ItemCotacao[][] {
  if (modulo !== "consumo") return itens.map((it) => [it]);
  const ordem: string[] = [];
  const porChave = new Map<string, ItemCotacao[]>();
  itens.forEach((it, i) => {
    const k = chaveProduto(it.nome) || `\u0000${it.id}${i}`;
    if (!porChave.has(k)) ordem.push(k);
    porChave.set(k, [...(porChave.get(k) ?? []), it]);
  });
  return ordem.map((k) => porChave.get(k) ?? []);
}

/** O item pertence a um grupo de quantidades alternativas? */
export function idsAlternativos(modulo: Modulo, itens: ItemCotacao[]): Set<string> {
  const ids = new Set<string>();
  for (const g of grupos(modulo, itens)) {
    if (g.length > 1) g.forEach((it) => ids.add(it.id));
  }
  return ids;
}

export function escolher(modulo: Modulo, c: ConteudoCotacao): Escolha[] {
  const existentes = new Set(c.fornecedores.map((f) => f.id));
  const escolhas: Escolha[] = [];
  for (const g of grupos(modulo, c.itens)) {
    let melhor: Escolha | null = null;
    let manual: Escolha | null = null;
    for (const it of g) {
      const qtd = preco(it.qtd);
      if (!qtd) continue;
      for (const f of c.fornecedores) {
        const p = preco(it.precos[f.id]);
        if (!p) continue;
        const e: Escolha = { itemId: it.id, fornecedorId: f.id, precoUnitario: p, quantidade: qtd, total: centavos(qtd * p), manual: false };
        if (!melhor || p < melhor.precoUnitario) melhor = e;
        if (!manual && it.selecionado === f.id && existentes.has(f.id)) manual = { ...e, manual: true };
      }
    }
    if (manual) escolhas.push(manual);
    else if (melhor) escolhas.push(melhor);
  }
  return escolhas;
}

export function totalEscolhido(es: Escolha[]): number {
  return centavos(es.reduce((s, e) => s + e.total, 0));
}

export type ResumoFornecedor = {
  fornecedor: FornecedorCotacao;
  total: number;
  itens: number;
  escolhas: Escolha[];
};

export function porFornecedor(c: ConteudoCotacao, es: Escolha[]): ResumoFornecedor[] {
  return c.fornecedores
    .map((f) => {
      const dele = es.filter((e) => e.fornecedorId === f.id);
      return { fornecedor: f, total: centavos(dele.reduce((s, e) => s + e.total, 0)), itens: dele.length, escolhas: dele };
    })
    .filter((r) => r.itens > 0);
}

/** Menor preço de um item (entre os fornecedores que cotaram). */
export function menorPrecoItem(it: ItemCotacao, fornecedores: FornecedorCotacao[]): number {
  let menor = 0;
  for (const f of fornecedores) {
    const p = preco(it.precos[f.id]);
    if (p && (!menor || p < menor)) menor = p;
  }
  return menor;
}

/** Fornecedores que cotaram todos os itens com quantidade (lista de itens). */
export function totaisCompletos(modulo: Modulo, c: ConteudoCotacao) {
  const itens = c.itens.filter((it) => preco(it.qtd));
  if (modulo === "consumo" && idsAlternativos(modulo, c.itens).size > 0) return [];
  return c.fornecedores
    .map((f) => {
      const completos = itens.every((it) => preco(it.precos[f.id]));
      const total = itens.reduce((s, it) => s + preco(it.qtd) * preco(it.precos[f.id]), 0);
      return { fornecedor: f, completo: completos && itens.length > 0, total: centavos(total) };
    })
    .filter((x) => x.completo)
    .sort((a, b) => a.total - b.total);
}

/** Economia potencial: soma, por item, de (maior preço - menor preço) × qtd. */
export function economiaPotencial(modulo: Modulo, c: ConteudoCotacao): number {
  let soma = 0;
  for (const g of grupos(modulo, c.itens)) {
    if (g.length !== 1) continue;
    const it = g[0];
    if (!it) continue;
    const precos = c.fornecedores.map((f) => preco(it.precos[f.id])).filter(Boolean);
    if (precos.length < 2) continue;
    soma += (Math.max(...precos) - Math.min(...precos)) * preco(it.qtd);
  }
  return centavos(soma);
}

export function itensComPreco(c: ConteudoCotacao): number {
  return c.itens.filter((it) => c.fornecedores.some((f) => preco(it.precos[f.id]))).length;
}

export function novoItem(parcial: Partial<ItemCotacao> = {}): ItemCotacao {
  return {
    id: novoId(),
    nome: "",
    codigoArcom: "",
    qtd: null,
    unidade: "un",
    entrega: "",
    consumoMensal: null,
    estoqueAtual: null,
    precos: {},
    selecionado: "",
    observacao: "",
    ...parcial,
  };
}

export function novoFornecedor(nome: string, parcial: Partial<FornecedorCotacao> = {}): FornecedorCotacao {
  return {
    id: novoId(),
    nome,
    fornecedorId: "",
    codigo: "",
    cnpj: "",
    contato: "",
    telefone: "",
    email: "",
    endereco: "",
    pagamento: "",
    entrega: "",
    frete: "",
    observacoes: "",
    ...parcial,
  };
}

export function conteudoVazio(): ConteudoCotacao {
  return { fornecedores: [], itens: [novoItem()], pedidos: {} };
}

/** Normaliza um documento vindo do backend (campos ausentes viram padrão). */
export function normalizarConteudo(c: Partial<ConteudoCotacao> | undefined): ConteudoCotacao {
  return {
    fornecedores: (c?.fornecedores ?? []).map((f) => novoFornecedor(f.nome ?? "", f)),
    itens: (c?.itens ?? []).map((it) => novoItem({ ...it, precos: it.precos ?? {} })),
    pedidos: c?.pedidos ?? {},
  };
}

/** Prepara o documento pra salvar: tira linhas totalmente vazias. */
export function limparConteudo(c: ConteudoCotacao): ConteudoCotacao {
  return {
    ...c,
    itens: c.itens.filter(
      (it) => it.nome.trim() || it.qtd || it.codigoArcom.trim() || Object.values(it.precos).some((p) => preco(p)),
    ),
  };
}
