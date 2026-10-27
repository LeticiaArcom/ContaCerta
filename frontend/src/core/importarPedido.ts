// Lê pedidos recebidos por WhatsApp, texto copiado (inclusive do Gemini),
// TXT, CSV ou o texto extraído de um PDF e devolve itens com quantidade,
// unidade e data de entrega. Usado pela Cotação de Carnes e Verduras, por
// Compras de Consumo e pelo pedido do restaurante.
import { lerDataBR, lerNumero } from "./formato";

export type ItemImportado = {
  nome: string;
  qtd: number | null;
  unidade: string;
  entrega: string;
};

const UNIDADES: [RegExp, string][] = [
  [/^(kg|kgs|quilo|quilos|quilograma|quilogramas)$/i, "kg"],
  [/^(g|gr|grs|grama|gramas)$/i, "g"],
  [/^(un|und|unid|unids|unidade|unidades|u)$/i, "un"],
  [/^(cx|cxs|caixa|caixas)$/i, "cx"],
  [/^(pct|pcts|pc|pacote|pacotes)$/i, "pct"],
  [/^(l|lt|lts|litro|litros)$/i, "lt"],
  [/^(m|mt|mts|metro|metros)$/i, "m"],
  [/^(fd|fds|fardo|fardos)$/i, "fd"],
  [/^(bdj|bandeja|bandejas)$/i, "bdj"],
  [/^(pç|pc\.|peça|peças|peca|pecas)$/i, "pç"],
];

export function normalizarUnidade(u: string): string | null {
  const limpo = u.trim().replace(/\.$/, "");
  for (const [re, un] of UNIDADES) if (re.test(limpo)) return un;
  return null;
}

const PADRAO_UNIDADE = "(kg|kgs|quilos?|quilogramas?|gr?s?|gramas?|un|und|unid|unidades?|cx|cxs|caixas?|pct|pcts|pacotes?|lts?|l|litros?|m|mts?|metros?|fd|fds|fardos?|bdj|bandejas?|pç|peças?|pecas?)";

// "30 kg de alcatra", "30kg alcatra", "Alcatra 30 kg", "Alcatra - 30kg"
const QTD_ANTES = new RegExp(`^\\s*(\\d+(?:[.,]\\d+)?)\\s*${PADRAO_UNIDADE}\\.?\\s+(?:de\\s+)?(.+)$`, "i");
const QTD_DEPOIS = new RegExp(`^(.+?)[\\s:–-]+(\\d+(?:[.,]\\d+)?)\\s*${PADRAO_UNIDADE}\\.?(?:\\s|$)(.*)$`, "i");
const SO_NUMERO_ANTES = /^\s*(\d+(?:[.,]\d+)?)\s*[x-]?\s+(.+)$/i;

// Mensagem de WhatsApp: "[27/10/26 09:15] Pollyana: texto" ou "27/10/2026 09:15 - Nome: texto"
const PREFIXO_WHATS = /^\s*\[?\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\]?\s*(?:-\s*)?[^:]{1,40}:\s*/;

const IGNORAR = /^(total|subtotal|item|itens|produto|descri[cç][aã]o|quantidade|qtd|unidade|pedido|per[ií]odo|data|observa[cç]|obs\b|p[aá]gina|fornecedor)/i;

function extrairData(texto: string): { resto: string; data: string } {
  const re = /(?:entrega|entregar|chegada|até|ate|dia|para)?\s*(?:dia\s+)?(\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?)/i;
  const m = re.exec(texto);
  if (!m || !m[1]) return { resto: texto, data: "" };
  const data = lerDataBR(m[1]) ?? "";
  return { resto: (texto.slice(0, m.index) + texto.slice(m.index + m[0].length)).trim(), data };
}

function limparNome(nome: string): string {
  return nome
    .replace(/^[\s•*·\-–—\d.)]+(?=\D)/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[;,.\-–]+$/, "")
    .trim();
}

function linhaParaItem(linha: string, dataPadrao: string): ItemImportado | null {
  let texto = linha.replace(PREFIXO_WHATS, "").trim();
  if (!texto || IGNORAR.test(texto)) return null;

  // Separadores de tabela: ";", tab, "|"
  const partes = texto.split(/\t|;|\|/).map((p) => p.trim()).filter(Boolean);
  if (partes.length >= 2) {
    const idxQtd = partes.findIndex((p, i) => i > 0 && lerNumero(p.replace(/[a-zç]+\.?$/i, "")) !== null && /\d/.test(p));
    if (idxQtd > 0) {
      const nome = partes.slice(0, idxQtd).join(" ");
      const qtdTexto = partes[idxQtd] ?? "";
      const unInline = /([a-zç]+)\.?$/i.exec(qtdTexto)?.[1];
      const unProx = partes[idxQtd + 1];
      let unidade = (unInline && normalizarUnidade(unInline)) || "";
      let usadas = idxQtd + 1;
      if (!unidade && unProx && normalizarUnidade(unProx)) {
        unidade = normalizarUnidade(unProx) ?? "";
        usadas++;
      }
      const restante = partes.slice(usadas).join(" ");
      const { data } = extrairData(restante);
      const qtd = lerNumero(qtdTexto.replace(/[a-zç]+\.?$/i, ""));
      if (nome && !IGNORAR.test(nome)) {
        return { nome: limparNome(nome), qtd, unidade: unidade || "un", entrega: data || dataPadrao };
      }
    }
  }

  const { resto, data } = extrairData(texto);
  texto = resto;
  let m = QTD_ANTES.exec(texto);
  if (m) {
    return { nome: limparNome(m[3] ?? ""), qtd: lerNumero(m[1] ?? ""), unidade: normalizarUnidade(m[2] ?? "") ?? "un", entrega: data || dataPadrao };
  }
  m = QTD_DEPOIS.exec(texto);
  if (m) {
    const nome = limparNome(`${m[1] ?? ""} ${m[4] ?? ""}`);
    return { nome, qtd: lerNumero(m[2] ?? ""), unidade: normalizarUnidade(m[3] ?? "") ?? "un", entrega: data || dataPadrao };
  }
  m = SO_NUMERO_ANTES.exec(texto);
  if (m) {
    return { nome: limparNome(m[2] ?? ""), qtd: lerNumero(m[1] ?? ""), unidade: "un", entrega: data || dataPadrao };
  }
  const nome = limparNome(texto);
  if (!nome || nome.length < 2 || !/[a-zà-ú]/i.test(nome)) return null;
  return { nome, qtd: null, unidade: "un", entrega: data || dataPadrao };
}

export type Leitura = { itens: ItemImportado[]; periodo: string };

/** Lê o texto inteiro. Uma linha sem quantidade logo depois de um item sem
 * quantidade é tratada como continuação da descrição (PDF quebrado). */
export function lerPedido(texto: string): Leitura {
  const linhas = texto.replace(/\r/g, "").split("\n");
  const periodo = /per[ií]odo[:\s]+([^\n]+)/i.exec(texto)?.[1]?.trim() ?? "";
  const itens: ItemImportado[] = [];
  let dataPadrao = "";
  for (const bruta of linhas) {
    const linha = bruta.trim();
    if (!linha) continue;
    // Linha só com data ("Entrega 03/11") vale pros próximos itens.
    if (/^(entrega|entregar|chegada|para|dia)\b[^a-z]*\d{1,2}[/.-]\d{1,2}/i.test(linha) && linha.length < 40) {
      dataPadrao = extrairData(linha).data;
      continue;
    }
    const item = linhaParaItem(linha, dataPadrao);
    if (!item) continue;
    const anterior = itens[itens.length - 1];
    if (item.qtd === null && anterior && anterior.qtd !== null && /^[a-zà-ú]/.test(linha) && linha.length < 40 && !/\d/.test(linha)) {
      anterior.nome = `${anterior.nome} ${item.nome}`.trim();
      continue;
    }
    itens.push(item);
  }
  return { itens: itens.filter((i) => i.nome), periodo };
}

export const MODELO_TXT = `Período: 02/11 a 07/11
Costelinha suína 30 kg entrega 03/11
Alcatra; 25; kg; 03/11
40 kg de peito de frango até dia 04/11
Alface americana 6 cx 05/11
Ovos 10 cx
`;
