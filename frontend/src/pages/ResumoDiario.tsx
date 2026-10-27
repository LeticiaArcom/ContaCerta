import { ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, Printer } from "lucide-react";
import { useState } from "react";
import { TituloTela } from "@/components/Layout";
import { exportarCSVDoDia, relatorioDoDia, separar } from "@/components/resumo/relatorioDiario";
import { BadgeSituacao } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, Indicador } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useEstadoUI } from "@/core/estadoUI";
import { baixarBlob } from "@/core/exportar";
import { dataBR, hojeISO, moeda } from "@/core/formato";
import { copiarImagem, gerarImagem } from "@/core/imagem";
import { notificar } from "@/core/toast";
import { useTodasCompras } from "@/hooks/recursos";
import type { Compra } from "@/tipos/api";

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const th = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-white align-bottom break-words";
const td = "px-2 py-2 align-top break-words";

function TabelaCompras({ compras, total }: { compras: Compra[]; total: number }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[1400px] table-fixed border-collapse text-sm print:min-w-0 print:text-[10px]">
        <colgroup>
          <col className="w-[7.5%]" />
          <col className="w-[7%]" />
          <col className="w-[8.5%]" />
          <col className="w-[5.5%]" />
          <col className="w-[11.5%]" />
          <col className="w-[5.5%]" />
          <col className="w-[16%]" />
          <col className="w-[8.5%]" />
          <col className="w-[7%]" />
          <col className="w-[8.5%]" />
          <col className="w-[7.25%]" />
          <col className="w-[7.25%]" />
        </colgroup>
        <thead className="bg-verde-escuro">
          <tr>
            <th className={th}>Data</th>
            <th className={th}>Solicitante</th>
            <th className={th}>Área</th>
            <th className={th}>Cód. forn.</th>
            <th className={th}>Fornecedor</th>
            <th className={th}>OCS</th>
            <th className={th}>Descrição</th>
            <th className={`${th} text-right`}>Valor</th>
            <th className={th}>Prazo</th>
            <th className={`${th} text-center`}>Provisio&shy;nado</th>
            <th className={th}>Autorizador</th>
            <th className={th}>Aprovador</th>
          </tr>
        </thead>
        <tbody className="text-arcom-gray">
          {compras.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-2 py-6 text-center">
                Nenhuma compra lançada neste dia.
              </td>
            </tr>
          ) : null}
          {compras.map((c) => (
            <tr key={c.id} className="border-b border-surface-border even:bg-surface">
              <td className={`${td} whitespace-nowrap`}>{dataBR(c.data)}</td>
              <td className={td}>{c.solicitante}</td>
              <td className={`${td} font-semibold text-verde-escuro`}>{c.area}</td>
              <td className={`${td} whitespace-nowrap`}>{c.codigoFornecedor}</td>
              <td className={td}>{c.fornecedor}</td>
              <td className={`${td} whitespace-nowrap`}>{c.ocs}</td>
              <td className={td}>
                <span className="line-clamp-2" title={c.descricao}>
                  {c.descricao}
                </span>
              </td>
              <td className={`${td} whitespace-nowrap text-right font-bold text-verde-escuro`}>{moeda(c.valor)}</td>
              <td className={td}>{c.prazoPagamento}</td>
              <td className={`${td} text-center`}>
                <BadgeSituacao situacao={c.provisionado} />
              </td>
              <td className={td}>{c.autorizador}</td>
              <td className={td}>{c.aprovador}</td>
            </tr>
          ))}
        </tbody>
        {compras.length ? (
          <tfoot>
            <tr className="bg-surface font-bold text-verde-escuro">
              <td colSpan={7} className="px-2 py-3 text-right">
                Total do dia · {compras.length} lançamento(s)
              </td>
              <td className="whitespace-nowrap px-2 py-3 text-right">{moeda(total)}</td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

function TabelaOrcamentos({ orcamentos }: { orcamentos: Compra[] }) {
  return (
    <div className="overflow-x-auto print:overflow-visible">
      <table className="w-full min-w-[700px] table-fixed border-collapse text-sm print:min-w-0 print:text-[10px]">
        <colgroup>
          <col className="w-[15%]" />
          <col className="w-[15%]" />
          <col className="w-[55%]" />
          <col className="w-[15%]" />
        </colgroup>
        <thead className="bg-verde-escuro">
          <tr>
            <th className={th}>Solicitante</th>
            <th className={th}>Área</th>
            <th className={th}>Descrição</th>
            <th className={`${th} text-center`}>Situação</th>
          </tr>
        </thead>
        <tbody className="text-arcom-gray">
          {orcamentos.map((c) => (
            <tr key={c.id} className="border-b border-surface-border even:bg-surface">
              <td className={td}>{c.solicitante}</td>
              <td className={`${td} font-semibold text-verde-escuro`}>{c.area}</td>
              <td className={td}>
                <span className="line-clamp-2" title={c.descricao}>
                  {c.descricao}
                </span>
              </td>
              <td className={`${td} text-center`}>
                <BadgeSituacao situacao={c.situacao || "EM COTAÇÃO"} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ResumoDiario() {
  const [data, setData] = useState(hojeISO());
  const valida = /^\d{4}-\d{2}-\d{2}$/.test(data);
  const consulta = useTodasCompras({ data }, valida);
  const todas = consulta.data ?? [];
  const { compras, orcamentos, total } = separar(todas);
  const { iniciarOcupado, terminarOcupado } = useEstadoUI();
  const [gerando, setGerando] = useState(false);

  async function comImagem(acao: (p: Promise<Blob>) => Promise<void>, sucesso: string) {
    setGerando(true);
    iniciarOcupado();
    try {
      await acao(gerarImagem(relatorioDoDia(data, todas)));
      notificar.sucesso(sucesso);
    } catch {
      notificar.erro("Não foi possível gerar a imagem. Tente de novo ou use Baixar PNG.");
    } finally {
      terminarOcupado();
      setGerando(false);
    }
  }

  const semDados = consulta.isPending || todas.length === 0;

  return (
    <>
      <TituloTela
        titulo="Resumo diário"
        descricao="Compras do dia ordenadas por área e do maior valor para o menor. Orçamentos aparecem à parte e não entram no total."
        acoes={
          <>
            <Button disabled={semDados || gerando} onClick={() => void comImagem((p) => copiarImagem(p), "Imagem do resumo copiada. Cole no WhatsApp ou e-mail.")}>
              <Copy /> Copiar imagem
            </Button>
            <Button
              variante="secondary"
              disabled={semDados || gerando}
              onClick={() => void comImagem(async (p) => baixarBlob(await p, `resumo-diario-${data}.png`), "PNG gerado.")}
            >
              <Download /> Baixar PNG
            </Button>
            <Button variante="secondary" disabled={semDados} onClick={() => exportarCSVDoDia(data, todas)}>
              <FileSpreadsheet /> Exportar CSV
            </Button>
            <Button variante="secondary" disabled={semDados} onClick={() => window.print()}>
              <Printer /> Imprimir / PDF
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-end gap-2 print:hidden">
        <Button variante="secondary" tamanho="icone" className="h-10 w-10" aria-label="Dia anterior" onClick={() => valida && setData(somarDias(data, -1))}>
          <ChevronLeft />
        </Button>
        <div>
          <label htmlFor="data-resumo" className="text-xs font-bold uppercase tracking-wider text-arcom-gray">
            Data
          </label>
          <Input id="data-resumo" type="date" className="w-44" value={data} onChange={(e) => setData(e.target.value)} />
        </div>
        <Button variante="secondary" tamanho="icone" className="h-10 w-10" aria-label="Próximo dia" onClick={() => valida && setData(somarDias(data, 1))}>
          <ChevronRight />
        </Button>
        <Button variante="ghost" onClick={() => setData(hojeISO())}>
          Hoje
        </Button>
      </div>

      <div className="hidden print:mb-3 print:block">
        <p className="text-lg font-black text-verde-escuro">Resumo diário de compras · {dataBR(data)}</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3 print:hidden">
        <Indicador rotulo="Total do dia" valor={moeda(total)} />
        <Indicador rotulo="Compras realizadas" valor={compras.length} />
        <Indicador rotulo="Orçamentos realizados" valor={orcamentos.length} />
      </div>

      {consulta.isPending ? (
        <div className="h-64 animate-pulse rounded-md border border-surface-border bg-white" />
      ) : (
        <div className="flex flex-col gap-5">
          <Card className="print:border-0 print:shadow-none">
            <CardHeader titulo="Compras realizadas" descricao={`${compras.length} lançamento(s) · total ${moeda(total)}`} />
            <TabelaCompras compras={compras} total={total} />
          </Card>
          {orcamentos.length ? (
            <Card className="print:border-0 print:shadow-none">
              <CardHeader titulo="Orçamentos realizados" descricao={`${orcamentos.length} orçamento(s)`} />
              <TabelaOrcamentos orcamentos={orcamentos} />
            </Card>
          ) : null}
        </div>
      )}
    </>
  );
}
