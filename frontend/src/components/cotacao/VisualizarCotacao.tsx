// Visualização de uma cotação salva: comparativo completo com o menor custo
// (ou a escolha manual) em verde, filtro por fornecedor e as cópias prontas
// para a diretoria / o fornecedor.
import { ClipboardCopy, Copy, FileText, ImageDown, Pencil } from "lucide-react";
import { useState } from "react";
import { BadgeSituacao } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/input";
import { escolher, porFornecedor } from "@/core/cotacao";
import { dataBR, moeda } from "@/core/formato";
import { baixarRelatorio, copiarRelatorio, copiarTextoComAviso } from "./acoes";
import { efetivada, nomeModulo, type FormCotacao } from "./estado";
import { GradeCotacao } from "./GradeCotacao";
import { PedidosFornecedor } from "./PedidosFornecedor";
import { Recomendacoes } from "./Recomendacoes";
import { comEstoque, relatorioCotacao, textoPedido } from "./relatorio";

export function VisualizarCotacao({ form, aoFechar, aoEditar }: { form: FormCotacao | null; aoFechar: () => void; aoEditar: (f: FormCotacao) => void }) {
  const [filtro, setFiltro] = useState("");
  if (!form) return null;
  const escolhas = escolher(form.modulo, form.conteudo);
  const resumo = porFornecedor(form.conteudo, escolhas);
  const doFornecedor = new Set(escolhas.filter((e) => e.fornecedorId === filtro).map((e) => e.itemId));
  const conteudo = filtro
    ? { ...form.conteudo, fornecedores: form.conteudo.fornecedores.filter((f) => f.id === filtro), itens: form.conteudo.itens.filter((it) => doFornecedor.has(it.id)) }
    : form.conteudo;
  const nome = `${nomeModulo(form)} ${form.titulo || form.periodo} ${form.data}`;

  return (
    <Dialog
      aberto
      aoMudar={(a) => {
        if (!a) {
          setFiltro("");
          aoFechar();
        }
      }}
      largura="max-w-[min(1400px,96vw)]"
      titulo={form.titulo || nomeModulo(form)}
      descricao={[nomeModulo(form), form.periodo && `Período ${form.periodo}`, form.ocs && `OCS ${form.ocs}`, dataBR(form.data), form.solicitante].filter(Boolean).join(" · ")}
      rodape={
        <>
          <Button variante="ghost" onClick={() => void baixarRelatorio(relatorioCotacao(form, filtro || undefined), nome)}>
            <ImageDown /> PNG
          </Button>
          {filtro ? (
            <Button variante="ghost" onClick={() => void copiarTextoComAviso(textoPedido(form, filtro), "Pedido copiado.")}>
              <ClipboardCopy /> Copiar pedido em texto
            </Button>
          ) : null}
          <Button variante="secondary" onClick={() => void copiarRelatorio(relatorioCotacao(form, filtro || undefined))}>
            <Copy /> {filtro ? "Copiar imagem do fornecedor" : form.modulo === "consumo" ? "Copiar orçamento" : "Copiar resumo"}
          </Button>
          <Button onClick={() => aoEditar(form)}>
            <Pencil /> Editar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <BadgeSituacao situacao={form.situacao} />
          {form.modulo === "consumo" ? <BadgeSituacao situacao={form.provisionado} /> : null}
          <Select aria-label="Filtrar por fornecedor" className="h-9 w-auto" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
            <option value="">Todos os fornecedores</option>
            {resumo.map((r) => (
              <option key={r.fornecedor.id} value={r.fornecedor.id}>
                Só a compra de {r.fornecedor.nome} ({moeda(r.total)})
              </option>
            ))}
          </Select>
          {form.modulo === "consumo" && efetivada(form)
            ? resumo.map((r) => (
                <Button key={r.fornecedor.id} tamanho="sm" variante="secondary" onClick={() => window.open(`/ordem-compra/${form.id}/${r.fornecedor.id}`, "_blank", "noopener")}>
                  <FileText /> Gerar ordem de compra · {r.fornecedor.nome}
                </Button>
              ))
            : null}
        </div>
        {form.descricao ? <p className="whitespace-pre-line text-sm text-arcom-gray">{form.descricao}</p> : null}
        <GradeCotacao modulo={form.modulo} conteudo={conteudo} aoMudar={() => undefined} estoque={comEstoque(form)} somenteLeitura />
        {filtro ? null : <Recomendacoes modulo={form.modulo} conteudo={form.conteudo} />}
        {form.modulo === "consumo" && form.conteudo.fornecedores.length ? (
          <div className="overflow-x-auto rounded-md border border-surface-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-left text-[11px] font-bold uppercase tracking-wider text-arcom-gray">
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2">Pagamento</th>
                  <th className="px-3 py-2">Entrega</th>
                  <th className="px-3 py-2">Frete</th>
                  <th className="px-3 py-2">Observações</th>
                </tr>
              </thead>
              <tbody>
                {form.conteudo.fornecedores.map((f) => (
                  <tr key={f.id} className="border-t border-surface-border">
                    <td className="px-3 py-2 font-semibold text-verde-escuro">{f.nome}</td>
                    <td className="px-3 py-2">{f.pagamento || "-"}</td>
                    <td className="px-3 py-2">{f.entrega || "-"}</td>
                    <td className="px-3 py-2">{f.frete || "-"}</td>
                    <td className="px-3 py-2">{f.observacoes || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {form.modulo === "hortifruti" ? <PedidosFornecedor form={form} somenteLeitura /> : null}
      </div>
    </Dialog>
  );
}
