// Estado do formulário de cotação (cabeçalho + documento) e conversões de/para
// o formato da API. Compartilhado por Cotação de carnes e Compras de consumo.
import { conteudoVazio, limparConteudo, normalizarConteudo } from "@/core/cotacao";
import { hojeISO } from "@/core/formato";
import type { ConteudoCotacao, Cotacao, EntradaCotacao, Formato, Modulo, PedidoFornecedor, Provisionado } from "@/tipos/api";

export type FormCotacao = {
  /** id da cotação salva (vazio = nova). */
  id: string;
  versao: number;
  modulo: Modulo;
  categoria: string;
  formato: Formato;
  titulo: string;
  ocs: string;
  data: string;
  periodo: string;
  solicitante: string;
  centroCusto: string;
  situacao: string;
  provisionado: Provisionado;
  descricao: string;
  pedidoId: string;
  conteudo: ConteudoCotacao;
};

export function formVazio(modulo: Modulo): FormCotacao {
  return {
    id: "",
    versao: 0,
    modulo,
    categoria: modulo === "hortifruti" ? "Carnes" : "Marketing",
    formato: "lista",
    titulo: "",
    ocs: "",
    data: hojeISO(),
    periodo: "",
    solicitante: "",
    centroCusto: "",
    situacao: "EM COTAÇÃO",
    provisionado: "PENDENTE",
    descricao: "",
    pedidoId: "",
    conteudo: conteudoVazio(),
  };
}

export function formDeCotacao(c: Cotacao): FormCotacao {
  return {
    id: c.id,
    versao: c.versao,
    modulo: c.modulo,
    categoria: c.categoria,
    formato: c.formato,
    titulo: c.titulo,
    ocs: c.ocs,
    data: c.data,
    periodo: c.periodo,
    solicitante: c.solicitante,
    centroCusto: c.centroCusto,
    situacao: c.situacao,
    provisionado: c.provisionado === "SIM" ? "SIM" : "PENDENTE",
    descricao: c.descricao,
    pedidoId: c.pedidoId ?? "",
    conteudo: normalizarConteudo(c.conteudo),
  };
}

/** Cópia independente para "Duplicar": novos ids, sem pedidos/NF. */
export function duplicarForm(f: FormCotacao): FormCotacao {
  const mapa = new Map<string, string>();
  const fornecedores = f.conteudo.fornecedores.map((x) => {
    const novo = crypto.randomUUID();
    mapa.set(x.id, novo);
    return { ...x, id: novo };
  });
  const itens = f.conteudo.itens.map((it) => {
    const precos: Record<string, number | null> = {};
    for (const [k, v] of Object.entries(it.precos)) {
      const nk = mapa.get(k);
      if (nk) precos[nk] = v;
    }
    return { ...it, id: crypto.randomUUID(), precos, selecionado: mapa.get(it.selecionado) ?? "" };
  });
  return {
    ...f,
    id: "",
    versao: 0,
    pedidoId: "",
    situacao: "EM COTAÇÃO",
    provisionado: "PENDENTE",
    data: hojeISO(),
    conteudo: { fornecedores, itens, pedidos: {} },
  };
}

function limparPedido(p: Partial<PedidoFornecedor>): PedidoFornecedor {
  return {
    os: p.os ?? "",
    enviadoEm: p.enviadoEm ?? "",
    nfNumero: p.nfNumero ?? "",
    nfData: p.nfData ?? "",
    nfLancada: !!p.nfLancada,
    observacao: p.observacao ?? "",
  };
}

/** Monta o corpo exato que o backend aceita (sem campo a mais). */
export function entradaDoForm(f: FormCotacao): EntradaCotacao {
  const c = limparConteudo(f.conteudo);
  const pedidos: Record<string, PedidoFornecedor> = {};
  for (const [k, v] of Object.entries(c.pedidos)) pedidos[k] = limparPedido(v);
  return {
    modulo: f.modulo,
    categoria: f.categoria,
    formato: f.formato,
    titulo: f.titulo,
    ocs: f.ocs,
    data: f.data,
    periodo: f.periodo,
    solicitante: f.solicitante,
    centroCusto: f.centroCusto,
    situacao: f.situacao,
    provisionado: f.provisionado,
    descricao: f.descricao,
    pedidoId: f.pedidoId,
    versao: f.versao,
    conteudo: {
      fornecedores: c.fornecedores.map((x) => ({
        id: x.id,
        nome: x.nome,
        fornecedorId: x.fornecedorId,
        codigo: x.codigo,
        cnpj: x.cnpj,
        contato: x.contato,
        telefone: x.telefone,
        email: x.email,
        endereco: x.endereco,
        pagamento: x.pagamento,
        entrega: x.entrega,
        frete: x.frete,
        observacoes: x.observacoes,
      })),
      itens: c.itens.map((it) => ({
        id: it.id,
        nome: it.nome,
        codigoArcom: it.codigoArcom,
        qtd: it.qtd,
        unidade: it.unidade,
        entrega: it.entrega,
        consumoMensal: it.consumoMensal,
        estoqueAtual: it.estoqueAtual,
        precos: Object.fromEntries(Object.entries(it.precos).filter(([, v]) => v !== null && v !== undefined)),
        selecionado: it.selecionado,
        observacao: it.observacao,
      })),
      pedidos,
    },
  };
}

/** O formulário tem algo preenchido (vale guardar rascunho)? */
export function formTemConteudo(f: FormCotacao): boolean {
  return (
    f.conteudo.fornecedores.length > 0 ||
    f.conteudo.itens.some((it) => it.nome.trim() || it.qtd) ||
    !!f.titulo.trim() ||
    !!f.descricao.trim()
  );
}

export const EFETIVADAS_CONSUMO = ["APROVADO", "PEDIDO EMITIDO", "CONCLUÍDO"];

export function efetivada(f: { modulo: Modulo; situacao: string; conteudo?: ConteudoCotacao }): boolean {
  if (f.modulo === "consumo") return EFETIVADAS_CONSUMO.includes(f.situacao);
  if (f.situacao !== "EM COTAÇÃO") return true;
  return Object.values(f.conteudo?.pedidos ?? {}).some((p) => p.os?.trim());
}

export function nomeModulo(f: Pick<FormCotacao, "modulo" | "categoria">): string {
  if (f.modulo === "consumo") return `Compras de consumo · ${f.categoria}`;
  if (f.categoria === "Mista") return "Cotação mista de carnes, frutas e verduras";
  return `Cotação de ${f.categoria.toLowerCase()}`;
}
