// Exportações feitas no navegador: CSV (UTF-8 com BOM e ponto e vírgula,
// pra abrir certo no Excel), JSON e download de arquivo.

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function celulaCSV(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Valores numéricos no CSV com vírgula decimal (Excel em pt-BR). */
export function numeroCSV(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "";
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

export function baixarCSV(nome: string, cabecalho: string[], linhas: unknown[][]) {
  const texto = [cabecalho, ...linhas].map((l) => l.map(celulaCSV).join(";")).join("\r\n");
  baixarBlob(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }), nome);
}

export function baixarJSON(nome: string, dados: unknown) {
  baixarBlob(new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" }), nome);
}

/** Copia texto pra área de transferência. */
export async function copiarTexto(texto: string) {
  await navigator.clipboard.writeText(texto);
}

/** Nome de arquivo seguro a partir de um título. */
export function nomeArquivo(base: string, extensao: string): string {
  const limpo = base
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${limpo || "conta-certa"}.${extensao}`;
}
