// Lê o arquivo de backup e devolve os lotes no formato das rotas de
// importação do backend (/importacao/fornecedores, /cotacoes, /compras,
// /eventos). Aceita dois formatos:
//
// - Backup Geral do sistema anterior ("conta-certa-backup-geral", versão 1):
//   um retrato do armazenamento do navegador antigo (chaves conta-certa-* / contacerta_*),
//   com valores que podem vir como texto JSON ou já como objeto. A leitura é
//   tolerante: o formato exato de cada chave não era garantido.
// - Backup deste sistema ("conta-certa-backup", versão 2), gerado em
//   GET /backup — mapeamento 1:1.
//
// Tudo é upsert pelo id no backend: importar o mesmo arquivo de novo não
// duplica nada. Funções puras (sem chamada de rede) — testáveis isoladas.
import {
  CATEGORIAS_HORTIFRUTI,
  DEPARTAMENTOS_CONSUMO,
  MODELO_TREINAMENTO,
  SITUACOES_CONSUMO,
  SITUACOES_DESPESA,
  SITUACOES_EVENTO,
  SITUACOES_HORTIFRUTI,
} from "./constantes";
import { hojeISO, lerDataBR, lerNumero } from "./formato";
import type { Despesa, EntradaCotacao, EntradaEvento, FornecedorCotacao, ItemCotacao, PedidoFornecedor } from "@/tipos/api";

export type CompraImportada = {
  id: string;
  tipo: "compra" | "orcamento";
  data: string;
  solicitante: string;
  area: string;
  cnpj: string;
  codigoFornecedor: string;
  fornecedor: string;
  ocs: string;
  descricao: string;
  valor: number;
  prazoPagamento: string;
  provisionado: string;
  autorizador: string;
  aprovador: string;
  situacao: string;
  origemCotacao: string;
  /** Chave do vínculo com a cotação (backup deste sistema). Vazia no
   * sistema anterior — o backend marca como "legado". */
  origemChave: string;
};

export type FornecedorImportado = { cnpj: string; codigo: string; nome: string };
export type EventoImportado = EntradaEvento & { id: string };
export type CotacaoImportada = EntradaCotacao & { id: string };

export type Lotes = {
  formato: "anterior" | "atual";
  fornecedores: FornecedorImportado[];
  cotacoes: CotacaoImportada[];
  compras: CompraImportada[];
  eventos: EventoImportado[];
  /** Registros que não puderam ser lidos (ex.: compra sem data válida). */
  ignorados: number;
};

export type Previa = {
  formato: Lotes["formato"];
  fornecedores: number;
  cotacoes: number;
  compras: number;
  orcamentos: number;
  eventos: number;
  ignorados: number;
  periodo: { de: string; ate: string } | null;
  valorCompras: number;
};

type Obj = Record<string, unknown>;

const ehObj = (v: unknown): v is Obj => !!v && typeof v === "object" && !Array.isArray(v);

function texto(v: unknown, max = 300): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : "";
  return s.trim().slice(0, max);
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") return lerNumero(v);
  return null;
}

function naoNegativo(v: unknown, max = 999_999_999): number | null {
  const n = num(v);
  if (n === null || n < 0) return null;
  return Math.min(n, max);
}

function inteiro(v: unknown): number {
  const n = num(v);
  return n === null || n < 0 ? 0 : Math.min(Math.round(n), 1_000_000);
}

/** Primeiro campo presente entre os nomes possíveis. */
function campo(o: Obj, ...nomes: string[]): unknown {
  for (const n of nomes) if (o[n] !== undefined && o[n] !== null && o[n] !== "") return o[n];
  return undefined;
}

/** AAAA-MM-DD, DD/MM/AAAA ou instante ISO -> AAAA-MM-DD (ou "" se inválida). */
export function dataISO(v: unknown): string {
  const s = texto(v, 40);
  if (!s) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(s)) return lerDataBR(s) ?? "";
  return "";
}

function semAcento(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();
}

function escolherDaLista<T extends string>(valor: unknown, lista: readonly T[]): T | null {
  const alvo = semAcento(texto(valor, 120));
  if (!alvo) return null;
  return lista.find((x) => semAcento(x) === alvo) ?? null;
}

/** Valor guardado no armazenamento antigo do navegador: texto JSON ou já objeto. */
function abrir(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t.startsWith("{") && !t.startsWith("[")) return v;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return v;
  }
}

/** Primeiro array de objetos dentro do valor (ele mesmo ou uma propriedade). */
function arrayDeObjetos(v: unknown, preferidas: string[] = []): Obj[] {
  const aberto = abrir(v);
  if (Array.isArray(aberto)) return aberto.map(abrir).filter(ehObj);
  if (ehObj(aberto)) {
    for (const k of [...preferidas, "itens", "items", "registros", "lista", "dados", "data"]) {
      const sub = abrir(aberto[k]);
      if (Array.isArray(sub)) return sub.map(abrir).filter(ehObj);
    }
  }
  return [];
}

// ---------- Formato do sistema anterior ----------

const CHAVE_ANTIGA = /^(conta-certa|contacerta)/i;

/** Junta as chaves conta-certa-* / contacerta_* onde quer que estejam. */
function chavesAntigas(raiz: Obj): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fontes: unknown[] = [raiz, raiz.dados, raiz.data, raiz.chaves, raiz.storage, raiz.itens, raiz.keys];
  for (const f of fontes) {
    const aberto = abrir(f);
    if (ehObj(aberto)) {
      for (const [k, v] of Object.entries(aberto)) if (CHAVE_ANTIGA.test(k)) out[k] = v;
    } else if (Array.isArray(aberto)) {
      // [{chave, valor}] / [{key, value}]
      for (const e of aberto) {
        if (!ehObj(e)) continue;
        const k = texto(campo(e, "chave", "key", "nome", "name"), 200);
        if (CHAVE_ANTIGA.test(k)) out[k] = campo(e, "valor", "value", "conteudo");
      }
    }
  }
  return out;
}

function ehBackupAntigo(raiz: Obj, chaves: Record<string, unknown>): boolean {
  const formato = texto(campo(raiz, "formato", "format", "tipo", "type"), 80).toLowerCase();
  if (formato.includes("backup-geral")) {
    const versao = num(campo(raiz, "versao", "version"));
    if (versao !== null && versao !== 1) throw new Error(`Backup do sistema anterior em versão ${versao}, desconhecida. Só a versão 1 é aceita.`);
    return true;
  }
  return Object.keys(chaves).length > 0 && !formato;
}

function compraAntiga(o: Obj, i: number): CompraImportada | null {
  const data = dataISO(campo(o, "data", "date", "dia"));
  if (!data) return null;
  const situacao = texto(campo(o, "situacao", "status", "situacaoOrcamento"), 60);
  const tipoTexto = texto(campo(o, "tipo", "type", "kind"), 40).toLowerCase();
  const orcamento = /COTA|NEGOCIA/.test(semAcento(situacao)) || tipoTexto === "orcamento" || tipoTexto === "cotacao" || tipoTexto === "quote";
  const fornecedor = texto(campo(o, "fornecedor", "supplier", "nomeFornecedor"));
  const ocs = texto(campo(o, "ocs", "OCS"), 60);
  const valor = naoNegativo(campo(o, "valor", "value", "total")) ?? 0;
  const id = texto(campo(o, "id", "identificador", "uid"), 120) || `legado-${data}-${ocs}-${fornecedor}-${valor}-${i}`.slice(0, 120);
  return {
    id,
    tipo: orcamento ? "orcamento" : "compra",
    data,
    solicitante: texto(campo(o, "solicitante", "requester"), 200),
    area: texto(campo(o, "area", "departamento", "department"), 120),
    cnpj: texto(o.cnpj, 40),
    codigoFornecedor: texto(campo(o, "codigo", "codigoFornecedor", "codFornecedor", "supplierCode"), 60),
    fornecedor,
    ocs,
    descricao: texto(campo(o, "descricao", "description", "detalhes"), 4000),
    valor: Math.round(valor * 100) / 100,
    prazoPagamento: texto(campo(o, "prazo", "prazoPagamento", "pagamento", "payment"), 200),
    provisionado: texto(campo(o, "provisionado", "provisioned"), 40),
    autorizador: texto(campo(o, "autorizador", "authorizer"), 200),
    aprovador: texto(campo(o, "aprovador", "approver"), 200),
    situacao,
    origemCotacao: texto(campo(o, "origemOrcamentoId", "orcamentoId", "origemCotacao", "quoteId", "budgetId"), 120),
    origemChave: "",
  };
}

function fornecedoresAntigos(v: unknown): FornecedorImportado[] {
  const aberto = abrir(v);
  const out: FornecedorImportado[] = [];
  const add = (cnpj: unknown, codigo: unknown, nome: unknown) => {
    const n = texto(nome);
    if (n) out.push({ cnpj: texto(cnpj, 40), codigo: texto(codigo, 60), nome: n });
  };
  if (Array.isArray(aberto)) {
    for (const e of aberto.map(abrir)) {
      if (ehObj(e)) add(e.cnpj, campo(e, "codigo", "code", "codigoFornecedor"), campo(e, "nome", "fornecedor", "name", "razaoSocial"));
    }
  } else if (ehObj(aberto)) {
    for (const [chave, valor] of Object.entries(aberto)) {
      const vv = abrir(valor);
      if (typeof vv === "string") add(chave, "", vv);
      else if (ehObj(vv)) add(vv.cnpj ?? chave, campo(vv, "codigo", "code", "codigoFornecedor"), campo(vv, "nome", "fornecedor", "name", "razaoSocial"));
    }
  }
  return out;
}

function categoriaDespesa(nome: string): string {
  const alvo = semAcento(nome);
  return MODELO_TREINAMENTO.find((m) => semAcento(m.nome) === alvo)?.categoria ?? "";
}

function despesaAntiga(o: Obj, i: number, idEvento: string): Despesa {
  const nome = texto(campo(o, "nome", "name", "descricao", "description"), 200);
  const situacao = escolherDaLista(campo(o, "situacao", "status"), SITUACOES_DESPESA) ?? "";
  return {
    id: texto(campo(o, "id"), 60) || `${idEvento}-d${i}`.slice(0, 60),
    categoria: texto(campo(o, "categoria", "category"), 60) || categoriaDespesa(nome),
    nome,
    fornecedor: texto(campo(o, "fornecedor", "supplier"), 200),
    qtd: naoNegativo(campo(o, "qtd", "qty", "quantidade"), 99_999_999),
    unidade: texto(campo(o, "unidade", "unit"), 20),
    valorUnitario: naoNegativo(campo(o, "valorUnitario", "unitValue", "valor")),
    total: naoNegativo(campo(o, "total", "valorTotal")),
    situacao,
    ocs: texto(campo(o, "ocs"), 40),
  };
}

function eventoAntigo(o: Obj, i: number): EventoImportado {
  const id = texto(campo(o, "id"), 120) || `legado-evento-${i}`;
  return {
    id,
    nome: texto(campo(o, "nome", "name"), 200) || "Evento sem nome",
    local: texto(campo(o, "local", "location"), 200),
    cidade: texto(campo(o, "cidade", "city"), 120),
    data: dataISO(campo(o, "data", "date")),
    participantes: inteiro(campo(o, "participantes", "participants")),
    estados: texto(campo(o, "estados", "states"), 200),
    ocs: texto(campo(o, "ocs"), 40),
    hospedados: inteiro(campo(o, "hospedados", "hosted")),
    situacao: escolherDaLista(campo(o, "situacao", "status"), SITUACOES_EVENTO) ?? "PLANEJAMENTO",
    valorOrcado: naoNegativo(campo(o, "valorOrcado", "budget", "orcado")) ?? 0,
    creditoFornecedor: naoNegativo(campo(o, "creditoFornecedor", "supplierCredit", "credito")) ?? 0,
    observacoes: texto(campo(o, "observacoes", "notes"), 4000),
    despesas: arrayDeObjetos(campo(o, "despesas", "expenses")).slice(0, 500).map((d, k) => despesaAntiga(d, k, id)),
    versao: 0,
  };
}

/** Procura, em qualquer profundidade, objetos com fornecedores + itens. */
function acharCotacoes(v: unknown, pai: Obj | null, out: { cot: Obj; pai: Obj | null }[], profundidade = 0) {
  if (profundidade > 8) return;
  const aberto = abrir(v);
  if (Array.isArray(aberto)) {
    for (const e of aberto) acharCotacoes(e, pai, out, profundidade + 1);
    return;
  }
  if (!ehObj(aberto)) return;
  const forn = abrir(campo(aberto, "suppliers", "fornecedores"));
  const itens = abrir(campo(aberto, "items", "itens"));
  if (Array.isArray(forn) && Array.isArray(itens)) {
    out.push({ cot: aberto, pai });
    return;
  }
  for (const sub of Object.values(aberto)) acharCotacoes(sub, aberto, out, profundidade + 1);
}

function situacaoCotacao(modulo: "hortifruti" | "consumo", status: unknown): string {
  if (modulo === "consumo") return escolherDaLista(status, SITUACOES_CONSUMO) ?? "EM COTAÇÃO";
  const s = semAcento(texto(status, 60));
  if (s === "CONCLUIDO") return "CONCLUÍDO";
  if (s === "PEDIDOS ENVIADOS" || s === "PEDIDO EMITIDO" || s === "APROVADO") return "PEDIDOS ENVIADOS";
  return "EM COTAÇÃO";
}

function cotacaoAntiga(cot: Obj, pai: Obj | null, i: number): CotacaoImportada {
  const id = texto(campo(cot, "id", "quoteId", "orcamentoId"), 120) || texto(pai && campo(pai, "id"), 120) || `legado-cotacao-${i}`;
  const tipoTexto = semAcento(
    [campo(cot, "quoteType", "tipoCotacao", "tipo", "type", "kind"), pai && campo(pai, "tipo", "type", "kind")].map((x) => texto(x, 80)).join(" "),
  );
  const departamento = texto(campo(cot, "department", "departamento", "area"), 120);
  const hortifruti = !departamento && /CARNE|FRUTA|VERDURA|MISTA|HORTI/.test(tipoTexto);
  const modulo = hortifruti ? "hortifruti" : "consumo";
  let categoria: string;
  if (modulo === "hortifruti") {
    categoria = /MISTA/.test(tipoTexto) ? "Mista" : /FRUTA|VERDURA/.test(tipoTexto) ? "Frutas e verduras" : "Carnes";
    categoria = escolherDaLista(categoria, CATEGORIAS_HORTIFRUTI) ?? "Carnes";
  } else {
    categoria = escolherDaLista(departamento, DEPARTAMENTOS_CONSUMO) ?? "Demais";
  }

  const fornecedores: FornecedorCotacao[] = arrayDeObjetos(campo(cot, "suppliers", "fornecedores"))
    .slice(0, 40)
    .map((s, k) => {
      const termos = ehObj(abrir(s.terms)) ? (abrir(s.terms) as Obj) : s;
      return {
        id: texto(campo(s, "id"), 60) || `f${k}`,
        nome: texto(campo(s, "name", "nome"), 200),
        fornecedorId: "",
        codigo: texto(campo(s, "code", "codigo"), 40),
        cnpj: texto(s.cnpj, 20),
        contato: texto(campo(s, "contact", "contato"), 120),
        telefone: texto(campo(s, "phone", "telefone"), 40),
        email: texto(s.email, 200),
        endereco: texto(campo(s, "address", "endereco"), 300),
        pagamento: texto(campo(termos, "payment", "pagamento"), 120),
        entrega: texto(campo(termos, "delivery", "entrega"), 120),
        frete: texto(campo(termos, "freight", "frete"), 120),
        observacoes: texto(campo(termos, "notes", "observacoes"), 1000),
      };
    });
  // ids repetidos quebrariam a validação: desambigua
  const vistos = new Set<string>();
  for (const f of fornecedores) {
    while (vistos.has(f.id)) f.id = `${f.id}-b`;
    vistos.add(f.id);
  }

  const selecoes = abrir(campo(cot, "selections", "selecoes", "manualSelections", "escolhas"));
  const itens: ItemCotacao[] = arrayDeObjetos(campo(cot, "items", "itens"))
    .slice(0, 500)
    .map((it, k) => {
      const idItem = texto(campo(it, "id"), 60) || `${id}-i${k}`.slice(0, 60);
      const precosBrutos = abrir(campo(it, "prices", "precos"));
      const precos: Record<string, number | null> = {};
      if (ehObj(precosBrutos)) {
        for (const [fid, p] of Object.entries(precosBrutos)) if (vistos.has(fid)) precos[fid] = naoNegativo(p);
      }
      let selecionado = texto(campo(it, "selected", "selecionado", "manualSupplier", "chosenSupplier"), 60);
      if (!selecionado && ehObj(selecoes)) selecionado = texto(selecoes[idItem], 60);
      return {
        id: idItem,
        nome: texto(campo(it, "name", "nome"), 300),
        codigoArcom: texto(campo(it, "code", "codigoArcom", "codigo"), 40),
        qtd: naoNegativo(campo(it, "qty", "qtd", "quantidade"), 99_999_999),
        unidade: texto(campo(it, "unit", "unidade"), 10) || "un",
        entrega: dataISO(campo(it, "delivery", "entrega")),
        consumoMensal: naoNegativo(campo(it, "monthlyConsumption", "consumoMensal"), 99_999_999),
        estoqueAtual: naoNegativo(campo(it, "currentStock", "estoqueAtual"), 99_999_999),
        precos,
        selecionado: vistos.has(selecionado) ? selecionado : "",
        observacao: texto(campo(it, "notes", "observacao"), 500),
      };
    });

  const data =
    dataISO(campo(cot, "date", "data")) || dataISO(pai && campo(pai, "data", "date", "savedAt", "criadoEm")) || hojeISO();
  return {
    id,
    modulo,
    categoria,
    formato: /ALTERNATIV/.test(semAcento(texto(campo(cot, "mode", "formato"), 60))) ? "alternativas" : "lista",
    titulo: texto(campo(cot, "title", "titulo", "nome", "name"), 200),
    ocs: texto(campo(cot, "ocs"), 40),
    data,
    periodo: texto(campo(cot, "period", "periodo"), 120),
    solicitante: texto(campo(cot, "requester", "solicitante"), 120),
    centroCusto: texto(campo(cot, "costCenter", "centroCusto"), 120),
    situacao: situacaoCotacao(modulo, campo(cot, "status", "situacao")),
    provisionado: semAcento(texto(campo(cot, "provisioned", "provisionado"), 20)) === "SIM" ? "SIM" : "PENDENTE",
    descricao: texto(campo(cot, "specifications", "descricao", "description", "observacao"), 4000),
    conteudo: { fornecedores, itens, pedidos: {} },
    pedidoId: "",
    versao: 0,
  };
}

function unicosPorId<T extends { id: string }>(lista: T[]): T[] {
  const m = new Map<string, T>();
  for (const x of lista) m.set(x.id, x);
  return [...m.values()];
}

function lerAnterior(chaves: Record<string, unknown>): Lotes {
  let ignorados = 0;
  const compras: CompraImportada[] = [];
  const eventos: EventoImportado[] = [];
  const fornecedores: FornecedorImportado[] = [];
  const achados: { cot: Obj; pai: Obj | null }[] = [];

  for (const [chave, valor] of Object.entries(chaves)) {
    const k = chave.toLowerCase();
    if (k.includes("rascunho")) continue; // rascunho de formulário não é registro
    if (k.includes("resumo")) {
      const lista = arrayDeObjetos(valor, ["compras"]);
      lista.forEach((o, i) => {
        if (!("valor" in o || "fornecedor" in o || "ocs" in o)) return;
        const c = compraAntiga(o, i);
        if (c) compras.push(c);
        else ignorados++;
      });
    } else if (k.includes("evento")) {
      arrayDeObjetos(valor, ["eventos"]).forEach((o, i) => eventos.push(eventoAntigo(o, i)));
    } else if (k.includes("fornecedor")) {
      fornecedores.push(...fornecedoresAntigos(valor));
    } else if (k.includes("resultado") || k.includes("carnes") || k.includes("comparativo") || k.includes("historico")) {
      // rascunhos ativos (conta-certa-carnes-v1, conta-certa-comparativo-v1)
      // não são orçamentos salvos: só o histórico de resultados entra.
      if (k.includes("resultado") || k.includes("historico")) acharCotacoes(valor, null, achados);
    }
  }
  const cotacoes = achados.map((a, i) => cotacaoAntiga(a.cot, a.pai, i));
  return {
    formato: "anterior",
    fornecedores,
    cotacoes: unicosPorId(cotacoes),
    compras: unicosPorId(compras),
    eventos: unicosPorId(eventos),
    ignorados,
  };
}

// ---------- Formato deste sistema (versão 2) ----------

function lerAtual(raiz: Obj): Lotes {
  const lista = (k: string) => (Array.isArray(raiz[k]) ? (raiz[k] as unknown[]).filter(ehObj) : []);
  const compras = lista("compras").map((c) => ({
    id: texto(c.id, 120),
    tipo: c.tipo === "orcamento" ? ("orcamento" as const) : ("compra" as const),
    data: dataISO(c.data),
    solicitante: texto(c.solicitante, 200),
    area: texto(c.area, 120),
    cnpj: texto(c.cnpj, 40),
    codigoFornecedor: texto(c.codigoFornecedor, 60),
    fornecedor: texto(c.fornecedor),
    ocs: texto(c.ocs, 60),
    descricao: texto(c.descricao, 4000),
    valor: naoNegativo(c.valor) ?? 0,
    prazoPagamento: texto(c.prazoPagamento, 200),
    provisionado: texto(c.provisionado, 40),
    autorizador: texto(c.autorizador, 200),
    aprovador: texto(c.aprovador, 200),
    situacao: texto(c.situacao, 60),
    origemCotacao: texto(c.origemCotacaoId, 120),
    origemChave: texto(c.origemChave, 120),
  }));
  const cotacoes = lista("cotacoes").map((c): CotacaoImportada => {
    const doc = ehObj(c.conteudo) ? c.conteudo : {};
    const pedidosBrutos = ehObj(doc.pedidos) ? doc.pedidos : {};
    const pedidos: Record<string, PedidoFornecedor> = {};
    for (const [fid, p] of Object.entries(pedidosBrutos)) {
      if (!ehObj(p)) continue;
      pedidos[fid] = {
        os: texto(p.os, 40),
        enviadoEm: dataISO(p.enviadoEm),
        nfNumero: texto(p.nfNumero, 40),
        nfData: dataISO(p.nfData),
        nfLancada: p.nfLancada === true,
        observacao: texto(p.observacao, 500),
      };
    }
    const fornecedores = (Array.isArray(doc.fornecedores) ? doc.fornecedores : []).filter(ehObj).map(
      (f): FornecedorCotacao => ({
        id: texto(f.id, 60),
        nome: texto(f.nome, 200),
        fornecedorId: texto(f.fornecedorId, 60),
        codigo: texto(f.codigo, 40),
        cnpj: texto(f.cnpj, 20),
        contato: texto(f.contato, 120),
        telefone: texto(f.telefone, 40),
        email: texto(f.email, 200),
        endereco: texto(f.endereco, 300),
        pagamento: texto(f.pagamento, 120),
        entrega: texto(f.entrega, 120),
        frete: texto(f.frete, 120),
        observacoes: texto(f.observacoes, 1000),
      }),
    );
    const itens = (Array.isArray(doc.itens) ? doc.itens : []).filter(ehObj).map(
      (it): ItemCotacao => ({
        id: texto(it.id, 60),
        nome: texto(it.nome),
        codigoArcom: texto(it.codigoArcom, 40),
        qtd: naoNegativo(it.qtd),
        unidade: texto(it.unidade, 10),
        entrega: dataISO(it.entrega),
        consumoMensal: naoNegativo(it.consumoMensal),
        estoqueAtual: naoNegativo(it.estoqueAtual),
        precos: ehObj(it.precos) ? Object.fromEntries(Object.entries(it.precos).map(([k, v]) => [k, naoNegativo(v)])) : {},
        selecionado: texto(it.selecionado, 60),
        observacao: texto(it.observacao, 500),
      }),
    );
    return {
      id: texto(c.id, 120),
      modulo: c.modulo === "hortifruti" ? "hortifruti" : "consumo",
      categoria: texto(c.categoria, 60),
      formato: c.formato === "alternativas" ? "alternativas" : "lista",
      titulo: texto(c.titulo, 200),
      ocs: texto(c.ocs, 40),
      data: dataISO(c.data) || hojeISO(),
      periodo: texto(c.periodo, 120),
      solicitante: texto(c.solicitante, 120),
      centroCusto: texto(c.centroCusto, 120),
      situacao: texto(c.situacao, 40),
      provisionado: c.provisionado === "SIM" ? "SIM" : "PENDENTE",
      descricao: texto(c.descricao, 4000),
      conteudo: { fornecedores, itens, pedidos },
      pedidoId: "",
      versao: 0,
    };
  });
  const eventos = lista("eventos").map((e, i) => {
    const ev = eventoAntigo(e, i);
    // no formato atual os nomes já são os mesmos; eventoAntigo cobre os dois
    return { ...ev, id: texto(e.id, 120) || ev.id };
  });
  const fornecedores = lista("fornecedores")
    .map((f) => ({ cnpj: texto(f.cnpj, 40), codigo: texto(f.codigo, 60), nome: texto(f.nome) }))
    .filter((f) => f.nome);
  return { formato: "atual", fornecedores, cotacoes, compras: compras.filter((c) => c.id && c.data), eventos, ignorados: 0 };
}

/** Lê o JSON do arquivo. Lança Error com mensagem pra usuária se o formato
 * não for reconhecido. */
export function lerBackup(json: unknown): Lotes {
  const raiz = abrir(json);
  if (!ehObj(raiz)) throw new Error("O arquivo não é um backup do Conta Certa (conteúdo inesperado).");
  const formato = texto(campo(raiz, "formato", "format"), 80);
  if (formato === "conta-certa-backup") {
    const versao = num(raiz.versao);
    if (versao !== 2) throw new Error(`Backup do Conta Certa em versão ${versao ?? "desconhecida"}. Só a versão 2 é aceita.`);
    return lerAtual(raiz);
  }
  const chaves = chavesAntigas(raiz);
  if (!ehBackupAntigo(raiz, chaves)) {
    throw new Error(
      formato
        ? `Formato "${formato}" não reconhecido. Use o Backup Geral do sistema anterior (versão 1) ou o backup deste sistema (versão 2).`
        : "Não encontramos dados do Conta Certa neste arquivo.",
    );
  }
  return lerAnterior(chaves);
}

export function previa(l: Lotes): Previa {
  const datas = l.compras.map((c) => c.data).sort();
  return {
    formato: l.formato,
    fornecedores: l.fornecedores.length,
    cotacoes: l.cotacoes.length,
    compras: l.compras.filter((c) => c.tipo === "compra").length,
    orcamentos: l.compras.filter((c) => c.tipo === "orcamento").length,
    eventos: l.eventos.length,
    ignorados: l.ignorados,
    periodo: datas.length ? { de: datas[0] ?? "", ate: datas[datas.length - 1] ?? "" } : null,
    valorCompras: Math.round(l.compras.filter((c) => c.tipo === "compra").reduce((s, c) => s + c.valor, 0) * 100) / 100,
  };
}

/** Quebra uma lista em lotes do tamanho aceito por cada rota. */
export function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < lista.length; i += tamanho) out.push(lista.slice(i, i + tamanho));
  return out;
}

export const TAMANHO_LOTE = { fornecedores: 1000, cotacoes: 40, compras: 300, eventos: 100 } as const;

/** Usado pelo teste rápido: SITUACOES_HORTIFRUTI garante o mapeamento. */
export const SITUACOES_VALIDAS_HORTIFRUTI = SITUACOES_HORTIFRUTI;
