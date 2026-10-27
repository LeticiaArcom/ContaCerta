// Gera a imagem executiva (PNG) de um relatório — resumo diário, orçamento,
// cotação, evento — desenhando direto num <canvas>, sem biblioteca extra.
// O mesmo conteúdo serve pra "Copiar imagem" (área de transferência) e
// "Baixar PNG". Visual no padrão ARCOM: cabeçalho verde escuro com a logo,
// friso verde-lima, tabela com cabeçalho escuro e destaque verde no menor
// custo / opção escolhida.

// Mesmos valores dos tokens do tailwind.config.js (canvas não lê classe CSS).
const COR = {
  verdeEscuro: "#1F4033",
  verdeArcom: "#007840",
  verdeLima: "#BAE64F",
  cinza: "#636466",
  danger: "#D13D29",
  surface: "#F6F6F6",
  borda: "#E6E7E8",
  branco: "#FFFFFF",
  destaque: "rgba(186,230,79,0.35)", // verde-lima translúcido
};

const FONTE = '"Red Hat Display", system-ui, sans-serif';

export type Coluna = {
  titulo: string;
  /** Peso relativo da largura. */
  largura: number;
  alinhar?: "esq" | "dir" | "centro";
  /** Quantas linhas o texto pode quebrar (padrão 2). */
  maxLinhas?: number;
};

export type Celula =
  | string
  | { texto: string; destaque?: boolean; negrito?: boolean; perigo?: boolean };

export type Secao = {
  titulo?: string;
  colunas: Coluna[];
  linhas: Celula[][];
  rodape?: Celula[];
  vazio?: string;
};

export type Relatorio = {
  titulo: string;
  subtitulo?: string;
  indicadores?: { rotulo: string; valor: string; perigo?: boolean }[];
  secoes: Secao[];
  observacao?: string;
  /** Largura lógica em px (padrão 1400). */
  largura?: number;
};

const ESCALA = 2;
const MARGEM = 40;
const LINHA = 20;
const PAD = 10;

function norm(c: Celula) {
  return typeof c === "string" ? { texto: c } : c;
}

function quebrar(ctx: CanvasRenderingContext2D, texto: string, largura: number, max: number): string[] {
  const linhas: string[] = [];
  for (const paragrafo of texto.split(/\n/)) {
    let atual = "";
    for (const palavra of paragrafo.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (ctx.measureText(tentativa).width <= largura) {
        atual = tentativa;
        continue;
      }
      if (atual) linhas.push(atual);
      atual = palavra;
      // palavra maior que a coluna: corta no caractere
      while (ctx.measureText(atual).width > largura && atual.length > 1) {
        let corte = atual.length - 1;
        while (corte > 1 && ctx.measureText(atual.slice(0, corte)).width > largura) corte--;
        linhas.push(atual.slice(0, corte));
        atual = atual.slice(corte);
      }
    }
    linhas.push(atual);
  }
  if (linhas.length > max) {
    const cortadas = linhas.slice(0, max);
    let ultima = cortadas[max - 1] ?? "";
    while (ultima && ctx.measureText(`${ultima}…`).width > largura) ultima = ultima.slice(0, -1);
    cortadas[max - 1] = `${ultima}…`;
    return cortadas;
  }
  return linhas.length ? linhas : [""];
}

function carregarImagem(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

type Layout = {
  colX: number[];
  colW: number[];
};

function layoutColunas(colunas: Coluna[], larguraUtil: number): Layout {
  const pesos = colunas.reduce((s, c) => s + c.largura, 0) || 1;
  const colW = colunas.map((c) => (c.largura / pesos) * larguraUtil);
  const colX: number[] = [];
  let x = MARGEM;
  for (const w of colW) {
    colX.push(x);
    x += w;
  }
  return { colX, colW };
}

/** Desenha (ou só mede, se desenhar=false) e devolve a altura usada. */
function desenhar(ctx: CanvasRenderingContext2D, rel: Relatorio, largura: number, logo: HTMLImageElement | null, desenhar: boolean): number {
  const larguraUtil = largura - MARGEM * 2;
  let y = 0;

  // Cabeçalho
  const altCab = 96;
  if (desenhar) {
    ctx.fillStyle = COR.verdeEscuro;
    ctx.fillRect(0, 0, largura, altCab);
    ctx.fillStyle = COR.verdeLima;
    ctx.fillRect(0, altCab, largura, 6);
    if (logo) {
      const h = 64;
      const w = (logo.width / logo.height) * h;
      ctx.drawImage(logo, MARGEM, (altCab - h) / 2, w, h);
    }
    ctx.fillStyle = COR.branco;
    ctx.textAlign = "right";
    ctx.font = `900 28px ${FONTE}`;
    ctx.fillText(rel.titulo, largura - MARGEM, 44);
    if (rel.subtitulo) {
      ctx.font = `500 16px ${FONTE}`;
      ctx.fillStyle = COR.verdeLima;
      ctx.fillText(rel.subtitulo, largura - MARGEM, 72);
    }
    ctx.textAlign = "left";
  }
  y = altCab + 6 + 28;

  // Indicadores
  if (rel.indicadores?.length) {
    const n = rel.indicadores.length;
    const gap = 16;
    const w = (larguraUtil - gap * (n - 1)) / n;
    const h = 72;
    rel.indicadores.forEach((ind, i) => {
      const x = MARGEM + i * (w + gap);
      if (desenhar) {
        ctx.fillStyle = COR.branco;
        ctx.strokeStyle = COR.borda;
        ctx.lineWidth = 1;
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        ctx.fillStyle = COR.verdeLima;
        ctx.fillRect(x, y, 4, h);
        ctx.fillStyle = COR.cinza;
        ctx.font = `700 11px ${FONTE}`;
        ctx.fillText(ind.rotulo.toUpperCase(), x + 16, y + 26);
        ctx.fillStyle = ind.perigo ? COR.danger : COR.verdeEscuro;
        ctx.font = `800 22px ${FONTE}`;
        ctx.fillText(ind.valor, x + 16, y + 54);
      }
    });
    y += h + 24;
  }

  for (const secao of rel.secoes) {
    if (secao.titulo) {
      if (desenhar) {
        ctx.fillStyle = COR.verdeEscuro;
        ctx.font = `700 18px ${FONTE}`;
        ctx.fillText(secao.titulo, MARGEM, y + 18);
      }
      y += 32;
    }
    const { colX, colW } = layoutColunas(secao.colunas, larguraUtil);

    // Cabeçalho da tabela
    ctx.font = `700 11px ${FONTE}`;
    const cabLinhas = secao.colunas.map((c, i) => quebrar(ctx, c.titulo.toUpperCase(), (colW[i] ?? 0) - PAD * 2, 2));
    const altCabTab = Math.max(...cabLinhas.map((l) => l.length)) * 15 + 16;
    if (desenhar) {
      ctx.fillStyle = COR.verdeEscuro;
      ctx.fillRect(MARGEM, y, larguraUtil, altCabTab);
      ctx.fillStyle = COR.branco;
      secao.colunas.forEach((c, i) => {
        const linhas = cabLinhas[i] ?? [];
        linhas.forEach((t, li) => escreverAlinhado(ctx, t, colX[i] ?? 0, colW[i] ?? 0, y + 20 + li * 15, c.alinhar));
      });
    }
    y += altCabTab;

    const linhasTabela = secao.linhas.length ? secao.linhas : [];
    if (!linhasTabela.length) {
      if (desenhar) {
        ctx.fillStyle = COR.cinza;
        ctx.font = `500 14px ${FONTE}`;
        ctx.fillText(secao.vazio ?? "Nenhum registro.", MARGEM + PAD, y + 26);
      }
      y += 40;
    }
    const todas = secao.rodape ? [...linhasTabela, secao.rodape] : linhasTabela;
    todas.forEach((linha, li) => {
      const ehRodape = !!secao.rodape && li === todas.length - 1;
      const celulas = linha.map(norm);
      const textos = celulas.map((cel, ci) => {
        ctx.font = `${cel.negrito || ehRodape ? 700 : 500} 14px ${FONTE}`;
        return quebrar(ctx, cel.texto, (colW[ci] ?? 0) - PAD * 2, secao.colunas[ci]?.maxLinhas ?? 2);
      });
      const alt = Math.max(1, ...textos.map((t) => t.length)) * LINHA + PAD * 1.6;
      if (desenhar) {
        ctx.fillStyle = ehRodape ? COR.surface : li % 2 ? COR.surface : COR.branco;
        ctx.fillRect(MARGEM, y, larguraUtil, alt);
        celulas.forEach((cel, ci) => {
          if (cel.destaque) {
            ctx.fillStyle = COR.destaque;
            ctx.fillRect((colX[ci] ?? 0) + 2, y + 2, (colW[ci] ?? 0) - 4, alt - 4);
          }
          ctx.fillStyle = cel.perigo ? COR.danger : cel.destaque ? COR.verdeArcom : ehRodape ? COR.verdeEscuro : COR.cinza;
          ctx.font = `${cel.negrito || ehRodape || cel.destaque ? 700 : 500} 14px ${FONTE}`;
          (textos[ci] ?? []).forEach((t, k) =>
            escreverAlinhado(ctx, t, colX[ci] ?? 0, colW[ci] ?? 0, y + PAD + 14 + k * LINHA, secao.colunas[ci]?.alinhar),
          );
        });
        ctx.strokeStyle = COR.borda;
        ctx.beginPath();
        ctx.moveTo(MARGEM, y + alt - 0.5);
        ctx.lineTo(MARGEM + larguraUtil, y + alt - 0.5);
        ctx.stroke();
      }
      y += alt;
    });
    y += 28;
  }

  if (rel.observacao) {
    ctx.font = `500 13px ${FONTE}`;
    const linhas = quebrar(ctx, rel.observacao, larguraUtil, 6);
    if (desenhar) {
      ctx.fillStyle = COR.cinza;
      linhas.forEach((t, i) => ctx.fillText(t, MARGEM, y + 14 + i * 18));
    }
    y += linhas.length * 18 + 12;
  }

  // Rodapé
  if (desenhar) {
    ctx.fillStyle = COR.borda;
    ctx.fillRect(MARGEM, y, larguraUtil, 1);
    ctx.fillStyle = COR.cinza;
    ctx.font = `500 12px ${FONTE}`;
    const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", "");
    ctx.fillText(`Gerado em ${agora} · Conta Certa · ARCOM`, MARGEM, y + 24);
  }
  return y + 44;
}

function escreverAlinhado(ctx: CanvasRenderingContext2D, texto: string, x: number, w: number, y: number, alinhar: Coluna["alinhar"]) {
  if (alinhar === "dir") {
    ctx.textAlign = "right";
    ctx.fillText(texto, x + w - PAD, y);
  } else if (alinhar === "centro") {
    ctx.textAlign = "center";
    ctx.fillText(texto, x + w / 2, y);
  } else {
    ctx.textAlign = "left";
    ctx.fillText(texto, x + PAD, y);
  }
  ctx.textAlign = "left";
}

/** Gera o PNG do relatório. */
export async function gerarImagem(rel: Relatorio): Promise<Blob> {
  await document.fonts.ready;
  const largura = rel.largura ?? 1400;
  const logo = await carregarImagem("/logo-arcom-verde-escuro.svg");
  const medidor = document.createElement("canvas").getContext("2d");
  if (!medidor) throw new Error("Canvas indisponível");
  const altura = desenhar(medidor, rel, largura, logo, false);

  const canvas = document.createElement("canvas");
  canvas.width = largura * ESCALA;
  canvas.height = Math.ceil(altura * ESCALA);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível");
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = COR.surface;
  ctx.fillRect(0, 0, largura, altura);
  ctx.textBaseline = "alphabetic";
  desenhar(ctx, rel, largura, logo, true);

  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Falha ao gerar a imagem"))), "image/png");
  });
}

/** Copia o PNG pra área de transferência (cola direto no WhatsApp/e-mail). */
export async function copiarImagem(blob: Blob | Promise<Blob>) {
  // Passar a Promise direto pro ClipboardItem mantém o "gesto do usuário"
  // válido no Safari enquanto a imagem ainda está sendo gerada.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
