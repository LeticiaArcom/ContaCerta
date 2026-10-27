import { AlertCircle, ChevronLeft, ChevronRight, FileSpreadsheet, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { TituloTela } from "@/components/Layout";
import { FormularioCompra } from "@/components/resumo/FormularioCompra";
import { deCompra, paraEntrada } from "@/components/resumo/compraForm";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, Indicador } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Campo, Input, Select } from "@/components/ui/input";
import { cn } from "@/core/cn";
import { AREAS_RESUMO } from "@/core/constantes";
import { useEstadoUI } from "@/core/estadoUI";
import { baixarCSV, numeroCSV } from "@/core/exportar";
import { dataBR, moeda } from "@/core/formato";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import {
  buscarTodas,
  useCompras,
  useExcluirCompra,
  useProvisionado,
  useSalvarCompra,
  useTotaisCompras,
} from "@/hooks/recursos";
import type { Compra, Provisionado } from "@/tipos/api";

type Filtros = {
  busca: string;
  de: string;
  ate: string;
  provisionado: string;
  area: string;
  tipo: string;
};

const FILTROS_VAZIOS: Filtros = { busca: "", de: "", ate: "", provisionado: "", area: "", tipo: "" };
const POR_PAGINA = 50;

const th = "px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-white align-bottom";
const td = "px-2 py-2 align-top break-words";

export default function ResumoHistorico() {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<Compra | null>(null);
  const { iniciarOcupado, terminarOcupado } = useEstadoUI();

  const lista = useCompras({ ...filtros, pagina, porPagina: POR_PAGINA });
  const totais = useTotaisCompras(filtros);
  const pendentes = useTotaisCompras({ provisionado: "PENDENTE", tipo: "compra" });
  const provisionado = useProvisionado();
  const excluir = useExcluirCompra();
  const salvar = useSalvarCompra();

  const mudar = (campo: keyof Filtros, valor: string) => {
    setFiltros((f) => ({ ...f, [campo]: valor }));
    setPagina(1);
  };

  const itens = lista.data?.itens ?? [];
  const pag = lista.data?.paginacao;
  const filtrando = Object.values(filtros).some(Boolean);

  async function exportar() {
    iniciarOcupado();
    try {
      const todas = await buscarTodas<Compra>("/compras", filtros);
      baixarCSV(
        "historico-de-compras.csv",
        ["Tipo", "Data", "Solicitante", "Área", "CNPJ", "Cód. fornecedor", "Fornecedor", "OCS", "Descrição", "Valor", "Prazo", "Provisionado", "Autorizador", "Aprovador", "Situação", "Identificador"],
        todas.map((c) => [
          c.tipo === "compra" ? "Compra" : "Orçamento",
          dataBR(c.data),
          c.solicitante,
          c.area,
          c.cnpj,
          c.codigoFornecedor,
          c.fornecedor,
          c.ocs,
          c.descricao,
          numeroCSV(c.valor),
          c.prazoPagamento,
          c.provisionado,
          c.autorizador,
          c.aprovador,
          c.situacao,
          c.id,
        ]),
      );
    } finally {
      terminarOcupado();
    }
  }

  async function aoExcluir(c: Compra) {
    const ok = await confirmar({
      titulo: "Excluir lançamento?",
      mensagem: `${c.fornecedor || c.descricao || "Lançamento"} de ${dataBR(c.data)}${c.tipo === "compra" ? `, ${moeda(c.valor)}` : ""}. Ele sai do resumo diário, do histórico e dos totais.${c.origemCotacaoId ? " Ele foi gerado por uma cotação: se a cotação for salva de novo, o lançamento volta." : ""}`,
      confirmar: "Excluir",
      cancelar: "Manter",
      perigo: true,
    });
    if (!ok) return;
    await excluir.mutateAsync(c.id);
    notificar.sucesso("Lançamento excluído.");
  }

  return (
    <>
      <TituloTela
        titulo="Histórico de compras"
        descricao="Todas as OCS e compras lançadas. Controle aqui o que ainda está pendente de provisionamento no sistema."
        acoes={
          <Button variante="secondary" onClick={() => void exportar()}>
            <FileSpreadsheet /> Exportar CSV
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Indicador rotulo="Compras encontradas" valor={totais.data?.quantidade ?? "-"} detalhe={filtrando ? "com os filtros aplicados" : "todo o histórico"} />
        <Indicador rotulo="Valor total filtrado" valor={moeda(totais.data?.valorTotal ?? 0)} detalhe="só compras realizadas" />
        <button
          type="button"
          className="text-left transition duration-fast hover:-translate-y-0.5"
          onClick={() => {
            setFiltros({ ...FILTROS_VAZIOS, provisionado: "PENDENTE", tipo: "compra" });
            setPagina(1);
          }}
        >
          <Indicador
            rotulo="Pendentes de provisionar"
            valor={pendentes.data?.quantidade ?? "-"}
            detalhe={`${moeda(pendentes.data?.valorTotal ?? 0)} · clique para ver só pendentes`}
            perigo={(pendentes.data?.quantidade ?? 0) > 0}
          />
        </button>
      </div>

      <Card className="mb-5 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <Campo rotulo="Buscar" htmlFor="h-busca" className="lg:col-span-2">
            <Input id="h-busca" placeholder="Fornecedor, OCS, descrição ou área" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} />
          </Campo>
          <Campo rotulo="Data inicial" htmlFor="h-de">
            <Input id="h-de" type="date" value={filtros.de} onChange={(e) => mudar("de", e.target.value)} />
          </Campo>
          <Campo rotulo="Data final" htmlFor="h-ate">
            <Input id="h-ate" type="date" value={filtros.ate} onChange={(e) => mudar("ate", e.target.value)} />
          </Campo>
          <Campo rotulo="Provisionado" htmlFor="h-prov">
            <Select id="h-prov" value={filtros.provisionado} onChange={(e) => mudar("provisionado", e.target.value)}>
              <option value="">Todos</option>
              <option value="PENDENTE">PENDENTE</option>
              <option value="SIM">SIM</option>
            </Select>
          </Campo>
          <Campo rotulo="Tipo" htmlFor="h-tipo">
            <Select id="h-tipo" value={filtros.tipo} onChange={(e) => mudar("tipo", e.target.value)}>
              <option value="">Todos</option>
              <option value="compra">Compras</option>
              <option value="orcamento">Orçamentos</option>
            </Select>
          </Campo>
          <Campo rotulo="Área" htmlFor="h-area" className="lg:col-span-2">
            <Select id="h-area" value={filtros.area} onChange={(e) => mudar("area", e.target.value)}>
              <option value="">Todas</option>
              {AREAS_RESUMO.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </Select>
          </Campo>
          <div className="flex items-end gap-2 lg:col-span-4">
            <Button
              variante={filtros.provisionado === "PENDENTE" ? "dark" : "secondary"}
              onClick={() => mudar("provisionado", filtros.provisionado === "PENDENTE" ? "" : "PENDENTE")}
            >
              <AlertCircle /> Ver só pendentes
            </Button>
            <Button variante="ghost" disabled={!filtrando} onClick={() => { setFiltros(FILTROS_VAZIOS); setPagina(1); }}>
              <X /> Limpar filtros
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1450px] table-fixed border-collapse text-sm">
            <colgroup>
              <col className="w-[7%]" />
              <col className="w-[7%]" />
              <col className="w-[9%]" />
              <col className="w-[6%]" />
              <col className="w-[13%]" />
              <col className="w-[6%]" />
              <col className="w-[18%]" />
              <col className="w-[9%]" />
              <col className="w-[8%]" />
              <col className="w-[10%]" />
              <col className="w-[7%]" />
            </colgroup>
            <thead className="bg-verde-escuro">
              <tr>
                <th className={th}>Data</th>
                <th className={th}>Solicitante</th>
                <th className={th}>Área</th>
                <th className={th}>Cód.</th>
                <th className={th}>Fornecedor</th>
                <th className={th}>OCS</th>
                <th className={th}>Descrição</th>
                <th className={`${th} text-right`}>Valor</th>
                <th className={th}>Prazo</th>
                <th className={th}>Provisionado</th>
                <th className={`${th} text-right`}>Ações</th>
              </tr>
            </thead>
            <tbody className="text-arcom-gray">
              {lista.isPending
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i} className="border-b border-surface-border">
                      <td colSpan={11} className="px-2 py-3">
                        <div className="h-5 animate-pulse rounded bg-surface" />
                      </td>
                    </tr>
                  ))
                : null}
              {!lista.isPending && itens.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-2 py-8 text-center">
                    Nenhum lançamento encontrado.
                  </td>
                </tr>
              ) : null}
              {itens.map((c) => {
                const pendente = c.tipo === "compra" && c.provisionado === "PENDENTE";
                const legado = c.provisionado !== "PENDENTE" && c.provisionado !== "SIM";
                return (
                  <tr key={c.id} className={cn("border-b border-surface-border", pendente ? "bg-danger/5" : "even:bg-surface")}>
                    <td className={`${td} whitespace-nowrap`}>{dataBR(c.data)}</td>
                    <td className={td}>{c.solicitante}</td>
                    <td className={`${td} font-semibold text-verde-escuro`}>{c.area}</td>
                    <td className={`${td} [overflow-wrap:anywhere]`}>{c.codigoFornecedor}</td>
                    <td className={td}>
                      {c.fornecedor}
                      {c.tipo === "orcamento" ? (
                        <Badge variante="alerta" className="ml-1">
                          Orçamento
                        </Badge>
                      ) : null}
                    </td>
                    <td className={`${td} whitespace-nowrap`}>{c.ocs}</td>
                    <td className={td}>
                      <span className="line-clamp-2" title={c.descricao}>
                        {c.descricao}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right font-bold text-verde-escuro`}>
                      {c.tipo === "compra" ? moeda(c.valor) : c.valor ? <span className="font-medium text-arcom-gray" title="Valor do orçamento — não entra nos totais">{moeda(c.valor)}</span> : "-"}
                    </td>
                    <td className={td}>{c.prazoPagamento}</td>
                    <td className={td}>
                      <Select
                        aria-label={`Provisionado de ${c.fornecedor || c.descricao}`}
                        className={cn("h-8 px-2 text-xs font-bold", pendente && "border-danger text-danger", c.provisionado === "SIM" && "text-verde-arcom")}
                        value={c.provisionado}
                        disabled={provisionado.isPending}
                        onChange={(e) => {
                          const v = e.target.value as Provisionado;
                          provisionado.mutate(
                            { id: c.id, provisionado: v },
                            { onSuccess: () => notificar.sucesso(`Provisionamento alterado para ${v}.`) },
                          );
                        }}
                      >
                        {legado ? <option value={c.provisionado}>{c.provisionado || "-"}</option> : null}
                        <option value="PENDENTE">PENDENTE</option>
                        <option value="SIM">SIM</option>
                      </Select>
                    </td>
                    <td className={`${td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button variante="ghost" tamanho="icone" aria-label="Editar" title="Editar" onClick={() => setEditando(c)}>
                          <Pencil />
                        </Button>
                        <Button variante="ghost" tamanho="icone" className="hover:text-danger" aria-label="Excluir" title="Excluir" onClick={() => void aoExcluir(c)}>
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pag && pag.totalPaginas > 1 ? (
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-sm">
            <span>
              Página {pag.pagina} de {pag.totalPaginas} · {pag.total} lançamento(s)
            </span>
            <div className="flex gap-2">
              <Button variante="secondary" tamanho="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft /> Anterior
              </Button>
              <Button variante="secondary" tamanho="sm" disabled={pagina >= pag.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                Próxima <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <Dialog
        aberto={!!editando}
        aoMudar={(a) => !a && setEditando(null)}
        titulo="Editar lançamento"
        descricao={
          editando?.origemCotacaoId
            ? "Este lançamento veio de uma cotação. Se a cotação for salva de novo, os campos que vêm dela (valor, fornecedor, descrição, prazo...) são sobrescritos; provisionado, autorizador e aprovador são mantidos."
            : "As alterações atualizam este mesmo lançamento."
        }
        largura="max-w-5xl"
      >
        {editando ? (
          <FormularioCompra
            key={editando.id}
            idPrefixo="editar"
            inicial={deCompra(editando)}
            salvando={salvar.isPending}
            rotuloSalvar="Salvar alterações"
            aoSalvar={async (v) => {
              await salvar.mutateAsync({ id: editando.id, dados: paraEntrada(v, editando.versao) });
              notificar.sucesso("Lançamento atualizado.");
              setEditando(null);
            }}
          />
        ) : null}
      </Dialog>
    </>
  );
}
