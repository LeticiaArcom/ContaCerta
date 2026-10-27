// Pedidos por fornecedor (carnes e verduras): o que vai pra cada fornecedor
// escolhido, a OS gerada no sistema, o envio e o acompanhamento da NF.
import { CheckCircle2, ClipboardCopy, ImageDown, Copy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { escolher, porFornecedor } from "@/core/cotacao";
import { dataBR, moeda, quantidade } from "@/core/formato";
import type { ConteudoCotacao, PedidoFornecedor } from "@/tipos/api";
import { baixarRelatorio, copiarRelatorio, copiarTextoComAviso } from "./acoes";
import type { FormCotacao } from "./estado";
import { relatorioCotacao, textoPedido } from "./relatorio";

const vazio: PedidoFornecedor = { os: "", enviadoEm: "", nfNumero: "", nfData: "", nfLancada: false, observacao: "" };

export function PedidosFornecedor({
  form,
  aoMudar,
  somenteLeitura,
}: {
  form: FormCotacao;
  aoMudar?: (fn: (c: ConteudoCotacao) => ConteudoCotacao) => void;
  somenteLeitura?: boolean;
}) {
  const c = form.conteudo;
  const resumo = porFornecedor(c, escolher(form.modulo, c));
  const itens = new Map(c.itens.map((it) => [it.id, it]));
  if (!resumo.length) return <p className="text-sm text-arcom-gray">Informe os preços para montar os pedidos por fornecedor.</p>;

  const mudar = (fid: string, parcial: Partial<PedidoFornecedor>) =>
    aoMudar?.((x) => ({ ...x, pedidos: { ...x.pedidos, [fid]: { ...vazio, ...x.pedidos[fid], ...parcial } } }));

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {resumo.map((r) => {
        const p = { ...vazio, ...c.pedidos[r.fornecedor.id] };
        const status = p.nfLancada ? "NF LANÇADA" : p.nfNumero ? "NF RECEBIDA" : p.os ? "PEDIDO ENVIADO" : "A ENVIAR";
        return (
          <div key={r.fornecedor.id} className="rounded-md border border-surface-border bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-surface-border px-4 py-3">
              <div>
                <p className="font-semibold text-verde-escuro">{r.fornecedor.nome}</p>
                <p className="text-xs text-arcom-gray">
                  {r.itens} {r.itens === 1 ? "item" : "itens"} · <span className="font-bold text-verde-arcom">{moeda(r.total)}</span>
                </p>
              </div>
              <Badge variante={p.nfLancada ? "sucesso" : p.os ? "escuro" : "alerta"}>{status}</Badge>
            </div>
            <ul className="max-h-40 overflow-y-auto px-4 py-2 text-sm">
              {r.escolhas.map((e) => {
                const it = itens.get(e.itemId);
                return (
                  <li key={e.itemId} className="flex justify-between gap-2 border-b border-surface-border/60 py-1 last:border-0">
                    <span>
                      {it?.nome} · {quantidade(e.quantidade, it?.unidade ?? "")}
                      {it?.entrega ? <span className="text-xs text-arcom-gray"> · até {dataBR(it.entrega)}</span> : null}
                    </span>
                    <span className="whitespace-nowrap font-medium text-verde-escuro">{moeda(e.total)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="grid gap-2 border-t border-surface-border px-4 py-3 sm:grid-cols-2">
              <Campo rotulo="OS (ordem de serviço)" htmlFor={`${r.fornecedor.id}-os`}>
                <Input id={`${r.fornecedor.id}-os`} className="h-9" value={p.os} readOnly={somenteLeitura} onChange={(e) => mudar(r.fornecedor.id, { os: e.target.value })} />
              </Campo>
              <Campo rotulo="Enviado em" htmlFor={`${r.fornecedor.id}-enviado`}>
                <Input id={`${r.fornecedor.id}-enviado`} type="date" className="h-9" value={p.enviadoEm} readOnly={somenteLeitura} onChange={(e) => mudar(r.fornecedor.id, { enviadoEm: e.target.value })} />
              </Campo>
              <Campo rotulo="Número da NF" htmlFor={`${r.fornecedor.id}-nf`}>
                <Input id={`${r.fornecedor.id}-nf`} className="h-9" value={p.nfNumero} readOnly={somenteLeitura} onChange={(e) => mudar(r.fornecedor.id, { nfNumero: e.target.value })} />
              </Campo>
              <Campo rotulo="Data da NF" htmlFor={`${r.fornecedor.id}-nfdata`}>
                <Input id={`${r.fornecedor.id}-nfdata`} type="date" className="h-9" value={p.nfData} readOnly={somenteLeitura} onChange={(e) => mudar(r.fornecedor.id, { nfData: e.target.value })} />
              </Campo>
              <label className="flex items-center gap-2 text-sm font-medium text-verde-escuro sm:col-span-2">
                <input
                  type="checkbox"
                  className="size-4 accent-verde-arcom"
                  checked={p.nfLancada}
                  disabled={somenteLeitura}
                  onChange={(e) => mudar(r.fornecedor.id, { nfLancada: e.target.checked })}
                />
                NF lançada no sistema
                {p.nfLancada ? <CheckCircle2 className="size-4 text-verde-arcom" /> : null}
              </label>
            </div>
            <div className="flex flex-wrap gap-2 border-t border-surface-border px-4 py-2 print:hidden">
              <Button tamanho="sm" variante="secondary" onClick={() => void copiarTextoComAviso(textoPedido(form, r.fornecedor.id), "Pedido copiado. Cole no WhatsApp ou no e-mail do fornecedor.")}>
                <ClipboardCopy /> Copiar pedido
              </Button>
              <Button tamanho="sm" variante="ghost" onClick={() => void copiarRelatorio(relatorioCotacao(form, r.fornecedor.id))}>
                <Copy /> Copiar imagem
              </Button>
              <Button tamanho="sm" variante="ghost" onClick={() => void baixarRelatorio(relatorioCotacao(form, r.fornecedor.id), `pedido ${r.fornecedor.nome} ${form.data}`)}>
                <ImageDown /> PNG
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
