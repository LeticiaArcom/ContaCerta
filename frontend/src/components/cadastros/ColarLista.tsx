import { FileUp } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { dataBR, quantidade } from "@/core/formato";
import { lerPedido, type Leitura } from "@/core/importarPedido";
import { useEstadoUI } from "@/core/estadoUI";
import { extrairTextoPDF } from "@/hooks/recursos";

/** Cola uma lista (WhatsApp, texto, TXT/CSV ou PDF pesquisável), mostra a
 * prévia e devolve os itens reconhecidos. */
export function ColarLista({ aoFechar, aoConfirmar }: { aoFechar: () => void; aoConfirmar: (l: Leitura, substituir: boolean) => void }) {
  const [texto, setTexto] = useState("");
  const [aviso, setAviso] = useState("");
  const arquivo = useRef<HTMLInputElement>(null);
  const { iniciarOcupado, terminarOcupado } = useEstadoUI();
  const leitura = texto.trim() ? lerPedido(texto) : null;

  async function aoArquivo(f: File | undefined) {
    setAviso("");
    if (!f) return;
    try {
      if (/\.pdf$/i.test(f.name) || f.type === "application/pdf") {
        iniciarOcupado();
        const t = await extrairTextoPDF(f).finally(terminarOcupado);
        if (!t.trim()) setAviso("Este PDF parece ser só imagem (digitalizado). Peça o arquivo original ou cole o conteúdo aqui.");
        setTexto(t);
      } else {
        setTexto(await f.text());
      }
    } finally {
      if (arquivo.current) arquivo.current.value = "";
    }
  }

  return (
    <Dialog
      aberto
      aoMudar={(a) => !a && aoFechar()}
      titulo="Colar lista do pedido"
      descricao="Cole a mensagem do WhatsApp ou a lista, ou escolha um arquivo TXT, CSV ou PDF. Confira a prévia antes de incluir."
      largura="max-w-3xl"
      rodape={
        <>
          <Button variante="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variante="secondary" disabled={!leitura?.itens.length} onClick={() => leitura && aoConfirmar(leitura, true)}>
            Substituir os itens
          </Button>
          <Button disabled={!leitura?.itens.length} onClick={() => leitura && aoConfirmar(leitura, false)}>
            Adicionar {leitura?.itens.length ?? 0} itens
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <input
          ref={arquivo}
          type="file"
          accept=".txt,.csv,.pdf,text/plain,text/csv,application/pdf"
          className="hidden"
          aria-label="Arquivo do pedido"
          onChange={(e) => void aoArquivo(e.target.files?.[0])}
        />
        <div>
          <Button variante="secondary" tamanho="sm" onClick={() => arquivo.current?.click()}>
            <FileUp /> Escolher arquivo (TXT, CSV ou PDF)
          </Button>
        </div>
        <Textarea
          aria-label="Lista do pedido"
          className="min-h-40 font-mono text-xs"
          placeholder={"Costelinha suína 30 kg entrega 03/11\nAlcatra; 25; kg; 03/11"}
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {aviso ? <p className="text-sm font-medium text-danger">{aviso}</p> : null}
        {leitura ? (
          <div className="overflow-x-auto rounded-md border border-surface-border">
            <table className="w-full text-sm">
              <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
                <tr>
                  <th className="px-3 py-1.5">Item</th>
                  <th className="px-3 py-1.5">Quantidade</th>
                  <th className="px-3 py-1.5">Entregar até</th>
                </tr>
              </thead>
              <tbody>
                {leitura.itens.map((it, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td className="px-3 py-1.5 text-verde-escuro">{it.nome}</td>
                    <td className="px-3 py-1.5">{quantidade(it.qtd, it.unidade) || "-"}</td>
                    <td className="px-3 py-1.5">{dataBR(it.entrega) || "-"}</td>
                  </tr>
                ))}
                {!leitura.itens.length ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-arcom-gray">
                      Nenhum item reconhecido.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {leitura.periodo ? <p className="px-3 py-2 text-xs text-arcom-gray">Período: {leitura.periodo}</p> : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
