// Exportações e importação do Acompanhamento de Eventos: CSV (inclusive o
// que vem do Google Planilhas), imagem executiva e cálculo dos indicadores.
import { CATEGORIAS_DESPESA, SITUACOES_DESPESA, SITUACOES_EVENTO } from "@/core/constantes";
import { baixarCSV, numeroCSV, nomeArquivo } from "@/core/exportar";
import { dataBR, lerDataBR, lerNumero, moeda, novoId, numero, percentual } from "@/core/formato";
import type { Relatorio } from "@/core/imagem";
import type { Despesa, EntradaEvento } from "@/tipos/api";

export type EventoEdicao = EntradaEvento & { id?: string };

export function totalDespesa(d: Despesa): number {
  if (d.total !== null && d.total !== undefined) return d.total;
  return (d.qtd ?? 0) * (d.valorUnitario ?? 0);
}

export function indicadores(e: EventoEdicao) {
  const efetivo = Math.round(e.despesas.reduce((s, d) => s + totalDespesa(d), 0) * 100) / 100;
  const diferenca = Math.round((e.valorOrcado - efetivo) * 100) / 100;
  const utilizacao = e.valorOrcado > 0 ? (efetivo / e.valorOrcado) * 100 : 0;
  return { efetivo, diferenca, utilizacao, estourou: e.valorOrcado > 0 && efetivo > e.valorOrcado };
}

export function subtotaisPorCategoria(e: EventoEdicao): { categoria: string; total: number; itens: number }[] {
  const m = new Map<string, { total: number; itens: number }>();
  for (const d of e.despesas) {
    const k = d.categoria || "Sem categoria";
    const a = m.get(k) ?? { total: 0, itens: 0 };
    m.set(k, { total: a.total + totalDespesa(d), itens: a.itens + 1 });
  }
  return [...m.entries()].map(([categoria, v]) => ({ categoria, ...v })).sort((a, b) => b.total - a.total);
}

export function novaDespesa(parcial: Partial<Despesa> = {}): Despesa {
  return { id: novoId(), categoria: "", nome: "", fornecedor: "", qtd: null, unidade: "un", valorUnitario: null, total: null, situacao: "A COTAR", ocs: "", ...parcial };
}

export function eventoVazio(): EventoEdicao {
  return {
    nome: "",
    local: "",
    cidade: "",
    data: "",
    participantes: 0,
    estados: "",
    ocs: "",
    hospedados: 0,
    situacao: "PLANEJAMENTO",
    valorOrcado: 0,
    creditoFornecedor: 0,
    observacoes: "",
    despesas: [],
    versao: 0,
  };
}

const CAMPOS_GERAIS: [string, (e: EventoEdicao) => string][] = [
  ["Nome do evento", (e) => e.nome],
  ["Local", (e) => e.local],
  ["Cidade", (e) => e.cidade],
  ["Data", (e) => dataBR(e.data)],
  ["Total de participantes", (e) => String(e.participantes)],
  ["Estados participantes", (e) => e.estados],
  ["OCS", (e) => e.ocs],
  ["Pessoas hospedadas", (e) => String(e.hospedados)],
  ["Situação", (e) => e.situacao],
  ["Valor orçado", (e) => numeroCSV(e.valorOrcado)],
  ["Crédito de fornecedor", (e) => numeroCSV(e.creditoFornecedor)],
  ["Observações", (e) => e.observacoes],
];

const CABECALHO_DESPESAS = ["Categoria", "Descrição", "Fornecedor", "Quantidade", "Unidade", "Valor unitário", "Valor total", "Situação", "OCS"];

export function exportarCSV(e: EventoEdicao) {
  const linhas: unknown[][] = CAMPOS_GERAIS.map(([rotulo, f]) => [rotulo, f(e)]);
  const ind = indicadores(e);
  linhas.push(["Gasto efetivo previsto", numeroCSV(ind.efetivo)], ["Diferença", numeroCSV(ind.diferenca)], []);
  linhas.push(CABECALHO_DESPESAS);
  for (const d of e.despesas) {
    linhas.push([d.categoria, d.nome, d.fornecedor, numeroCSV(d.qtd), d.unidade, numeroCSV(d.valorUnitario), numeroCSV(totalDespesa(d)), d.situacao, d.ocs]);
  }
  baixarCSV(nomeArquivo(`evento-${e.nome || "sem-nome"}`, "csv"), ["Campo", "Valor"], linhas);
}

// ---------- Importação de CSV ----------

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Lê CSV com aspas; detecta ";" ou ",". */
export function lerCSV(texto: string): string[][] {
  const limpo = texto.replace(/^\ufeff/, "");
  const amostra = limpo.split(/\r?\n/).slice(0, 10).join("\n");
  const sep = (amostra.match(/;/g)?.length ?? 0) >= (amostra.match(/,/g)?.length ?? 0) ? ";" : ",";
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let aspas = false;
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i];
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else campo += c;
  }
  if (campo || linha.length) {
    linha.push(campo);
    linhas.push(linha);
  }
  return linhas.map((l) => l.map((x) => x.trim()));
}

const MAPA_GERAL: Record<string, keyof EventoEdicao> = {
  "nome do evento": "nome",
  nome: "nome",
  evento: "nome",
  local: "local",
  "local do evento": "local",
  cidade: "cidade",
  "cidade do evento": "cidade",
  data: "data",
  "data do evento": "data",
  "total de participantes": "participantes",
  participantes: "participantes",
  "estados participantes": "estados",
  estados: "estados",
  ocs: "ocs",
  "pessoas hospedadas": "hospedados",
  hospedados: "hospedados",
  hospedagens: "hospedados",
  situacao: "situacao",
  "situacao do orcamento": "situacao",
  "valor orcado": "valorOrcado",
  orcamento: "valorOrcado",
  "credito de fornecedor": "creditoFornecedor",
  "credito do fornecedor": "creditoFornecedor",
  observacoes: "observacoes",
};

const MAPA_DESPESA: Record<string, keyof Despesa> = {
  categoria: "categoria",
  descricao: "nome",
  despesa: "nome",
  item: "nome",
  fornecedor: "fornecedor",
  quantidade: "qtd",
  qtd: "qtd",
  unidade: "unidade",
  "valor unitario": "valorUnitario",
  unitario: "valorUnitario",
  "valor total": "total",
  total: "total",
  situacao: "situacao",
  status: "situacao",
  ocs: "ocs",
};

function dataCSV(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return lerDataBR(s) ?? "";
}

/** Converte o CSV (exportado daqui ou do Google Planilhas) num evento. */
export function importarCSV(texto: string, base: EventoEdicao): EventoEdicao {
  const linhas = lerCSV(texto).filter((l) => l.some(Boolean));
  const ev: EventoEdicao = { ...base, despesas: [] };
  let colunas: (keyof Despesa | null)[] | null = null;
  for (const l of linhas) {
    const chaves = l.map(norm);
    // cabeçalho da tabela de despesas: tem descrição/despesa e algum valor
    if (!colunas && chaves.some((k) => MAPA_DESPESA[k] === "nome") && chaves.some((k) => MAPA_DESPESA[k] === "total" || MAPA_DESPESA[k] === "valorUnitario")) {
      colunas = chaves.map((k) => MAPA_DESPESA[k] ?? null);
      continue;
    }
    if (colunas) {
      const d = novaDespesa({ situacao: "" });
      colunas.forEach((c, i) => {
        const v = l[i] ?? "";
        if (!c) return;
        if (c === "qtd" || c === "valorUnitario" || c === "total") {
          const n = lerNumero(v);
          d[c] = n !== null && n >= 0 ? n : null;
        } else if (c === "situacao") {
          d.situacao = (SITUACOES_DESPESA as readonly string[]).find((s) => norm(s) === norm(v)) as Despesa["situacao"] | undefined ?? "";
        } else if (c === "categoria") {
          d.categoria = CATEGORIAS_DESPESA.find((s) => norm(s) === norm(v)) ?? v.slice(0, 60);
        } else if (c !== "id") {
          d[c] = v.slice(0, c === "unidade" ? 20 : 200);
        }
      });
      if (d.nome || d.total) ev.despesas.push(d);
      continue;
    }
    const campo = MAPA_GERAL[chaves[0] ?? ""];
    const valor = l[1] ?? "";
    if (!campo) continue;
    if (campo === "participantes" || campo === "hospedados") ev[campo] = Math.max(0, Math.round(lerNumero(valor) ?? 0));
    else if (campo === "valorOrcado" || campo === "creditoFornecedor") ev[campo] = Math.max(0, lerNumero(valor) ?? 0);
    else if (campo === "data") ev.data = dataCSV(valor);
    else if (campo === "situacao") ev.situacao = SITUACOES_EVENTO.find((s) => norm(s) === norm(valor)) ?? ev.situacao;
    else if (campo === "nome" || campo === "local" || campo === "cidade" || campo === "estados" || campo === "ocs" || campo === "observacoes") ev[campo] = valor;
  }
  return ev;
}

// ---------- Imagem executiva ----------

export function relatorioEvento(e: EventoEdicao): Relatorio {
  const ind = indicadores(e);
  return {
    titulo: e.nome || "Evento",
    subtitulo: "Acompanhamento de evento",
    indicadores: [
      { rotulo: "Valor orçado", valor: moeda(e.valorOrcado) },
      { rotulo: "Gasto efetivo previsto", valor: moeda(ind.efetivo) },
      { rotulo: "Crédito do fornecedor", valor: moeda(e.creditoFornecedor) },
      { rotulo: "Diferença", valor: moeda(ind.diferenca), perigo: ind.diferenca < 0 },
      { rotulo: "Utilização", valor: e.valorOrcado > 0 ? percentual(ind.utilizacao) : "-", perigo: ind.estourou },
    ],
    secoes: [
      {
        titulo: "Dados do evento",
        colunas: [
          { titulo: "Local", largura: 3 },
          { titulo: "Cidade", largura: 2 },
          { titulo: "Data", largura: 1.4 },
          { titulo: "Participantes", largura: 1.4, alinhar: "dir" },
          { titulo: "Estados", largura: 1.6 },
          { titulo: "OCS", largura: 1.2 },
          { titulo: "Hospedados", largura: 1.3, alinhar: "dir" },
          { titulo: "Situação", largura: 1.8 },
        ],
        linhas: [[e.local || "-", e.cidade || "-", dataBR(e.data) || "-", String(e.participantes), e.estados || "-", e.ocs || "-", String(e.hospedados), e.situacao]],
      },
      {
        titulo: "Despesas",
        colunas: [
          { titulo: "Categoria", largura: 1.8 },
          { titulo: "Descrição", largura: 3, maxLinhas: 2 },
          { titulo: "Fornecedor", largura: 2.2, maxLinhas: 2 },
          { titulo: "Qtd", largura: 1.2, alinhar: "dir" },
          { titulo: "Valor unitário", largura: 1.6, alinhar: "dir" },
          { titulo: "Valor total", largura: 1.7, alinhar: "dir" },
          { titulo: "Situação", largura: 1.6 },
        ],
        linhas: e.despesas.map((d) => [
          d.categoria || "-",
          d.nome || "-",
          d.fornecedor || "-",
          d.qtd !== null ? `${numero(d.qtd, 3)} ${d.unidade}` : "-",
          moeda(d.valorUnitario) || "-",
          moeda(totalDespesa(d)),
          d.situacao || "-",
        ]),
        rodape: ["Total previsto", "", "", "", "", moeda(ind.efetivo), ""],
        vazio: "Nenhuma despesa lançada.",
      },
    ],
    observacao: e.observacoes || undefined,
  };
}
