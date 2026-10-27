// Importar pedido: texto colado (WhatsApp, Gemini), TXT, CSV ou PDF
// pesquisável. Mostra a prévia antes de adicionar ou substituir as linhas.
import { Download, FileUp } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { baixarBlob } from "@/core/exportar";
import { dataBR, quantidade } from "@/core/formato";
import { lerPedido, MODELO_TXT, type ItemImportado } from "@/core/importarPedido";
import { useEstadoUI } from "@/core/estadoUI";
import { notificar } from "@/core/toast";
import { extrairTextoPDF } from "@/hooks/recursos";

export type ModoImportacao = "adicionar" | "substituir";

export function ImportarPedido({
  aberto,
  aoMudar,
  aoImportar,
}: {
  aberto: boolean;
  aoMudar: (a: boolean) => void;
  aoImportar: (itens: ItemImportado[], modo: ModoImportacao, periodo: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const [lendo, setLendo] = useState(false);
  const { iniciarOcupado, terminarOcupado } = useEstadoUI();
  const leitura = texto.trim() ? lerPedido(texto) : { itens: [], periodo: "" };

  const lerArquivo = async (arquivo: File) => {
    setLendo(true);
    iniciarOcupado();
    try {
      if (arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf")) {
        const t = await extrairTextoPDF(arquivo);
        if (!t.trim()) {
          notificar.aviso("Este PDF não tem texto pesquisável (é só imagem). Peça o arquivo original ou cole o conteúdo no campo.");
          return;
        }
        setTexto(t);
      } else {
        setTexto(await arquivo.text());
      }
    } catch {
      // erro de API já vira toast no interceptor
    } finally {
      setLendo(false);
      terminarOcupado();
    }
  };

  const confirmar = (modo: ModoImportacao) => {
    aoImportar(leitura.itens, modo, leitura.periodo);
    setTexto("");
    aoMudar(false);
  };

  return (
    <Dialog
      aberto={aberto}
      aoMudar={aoMudar}
      largura="max-w-3xl"
      titulo="Importar pedido"
      descricao="Cole a mensagem do WhatsApp ou o conteúdo copiado do Gemini, ou escolha um arquivo TXT, CSV ou PDF."
      rodape={
        <>
          <Button variante="ghost" onClick={() => baixarBlob(new Blob([MODELO_TXT], { type: "text/plain;charset=utf-8" }), "modelo-pedido.txt")}>
            <Download /> Baixar modelo TXT
          </Button>
          <Button variante="secondary" disabled={!leitura.itens.length} onClick={() => confirmar("substituir")}>
            Substituir linhas
          </Button>
          <Button disabled={!leitura.itens.length} onClick={() => confirmar("adicionar")}>
            Adicionar {leitura.itens.length ? `${leitura.itens.length} itens` : "itens"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-surface-border px-3 py-3 text-sm font-medium text-verde-arcom hover:bg-surface">
          <FileUp className="size-4" />
          {lendo ? "Lendo arquivo..." : "Escolher arquivo (TXT, CSV ou PDF)"}
          <input
            type="file"
            accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void lerArquivo(f);
              e.target.value = "";
            }}
          />
        </label>
        <Textarea aria-label="Texto do pedido" className="min-h-40 font-mono text-xs" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={MODELO_TXT} />
        {leitura.itens.length ? (
          <div className="max-h-64 overflow-y-auto rounded-md border border-surface-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-verde-escuro text-left text-[11px] font-bold uppercase tracking-wider text-white">
                <tr>
                  <th className="px-2 py-1.5">Item</th>
                  <th className="px-2 py-1.5">Qtd</th>
                  <th className="px-2 py-1.5">Entrega</th>
                </tr>
              </thead>
              <tbody>
                {leitura.itens.map((it, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td className="px-2 py-1">{it.nome}</td>
                    <td className="px-2 py-1">{quantidade(it.qtd, it.unidade) || "-"}</td>
                    <td className="px-2 py-1">{dataBR(it.entrega) || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : texto.trim() ? (
          <p className="text-sm text-arcom-gray">Nenhum item reconhecido. Confira se cada linha tem o produto e a quantidade.</p>
        ) : null}
        {leitura.periodo ? <p className="text-xs text-arcom-gray">Período reconhecido: {leitura.periodo}</p> : null}
      </div>
    </Dialog>
  );
}
