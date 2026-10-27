// Histórico de cotações salvas: filtros, Visualizar, Editar, Duplicar e
// Excluir. Editar atualiza o mesmo registro; Duplicar abre uma cópia nova.
import { CopyPlus, Eye, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { BadgeSituacao, Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { CATEGORIAS_HORTIFRUTI, DEPARTAMENTOS_CONSUMO, SITUACOES_CONSUMO, SITUACOES_HORTIFRUTI } from "@/core/constantes";
import { dataBR, moeda } from "@/core/formato";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import { buscarCotacao, useCotacoes, useExcluirCotacao } from "@/hooks/recursos";
import type { Cotacao, Modulo } from "@/tipos/api";

export type AcaoHistorico = "visualizar" | "editar" | "duplicar";

export function HistoricoCotacoes({ modulo, aoAbrir }: { modulo: Modulo; aoAbrir: (c: Cotacao, acao: AcaoHistorico) => void }) {
  const [filtros, setFiltros] = useState({ busca: "", categoria: "", situacao: "", provisionado: "", de: "", ate: "" });
  const [pagina, setPagina] = useState(1);
  const lista = useCotacoes({ modulo, ...filtros, pagina, porPagina: 30 });
  const excluir = useExcluirCotacao();
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const hortifruti = modulo === "hortifruti";

  const mudar = (campo: keyof typeof filtros, v: string) => {
    setPagina(1);
    setFiltros((f) => ({ ...f, [campo]: v }));
  };

  const abrir = async (id: string, acao: AcaoHistorico) => {
    setAbrindo(id);
    try {
      aoAbrir(await buscarCotacao(id), acao);
    } catch {
      // toast já mostrado pelo interceptor
    } finally {
      setAbrindo(null);
    }
  };

  const aoExcluir = async (c: Cotacao) => {
    const ok = await confirmar({
      titulo: "Excluir esta cotação?",
      mensagem: `"${c.titulo || c.periodo || dataBR(c.data)}" sai do histórico e os lançamentos que ela gerou no Resumo Diário também são retirados.${c.pedidoId ? " O pedido do restaurante volta a ficar disponível para cotar." : ""}`,
      confirmar: "Excluir cotação",
      perigo: true,
    });
    if (!ok) return;
    excluir.mutate(c.id, { onSuccess: () => notificar.sucesso("Cotação excluída.") });
  };

  const itens = lista.data?.itens ?? [];
  const pag = lista.data?.paginacao;

  return (
    <Card>
      <div className="grid gap-2 border-b border-surface-border p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Input aria-label="Buscar" placeholder="Buscar por nome, OCS, fornecedor, item" className="sm:col-span-3 lg:col-span-2" value={filtros.busca} onChange={(e) => mudar("busca", e.target.value)} />
        <Select aria-label={hortifruti ? "Tipo" : "Departamento"} value={filtros.categoria} onChange={(e) => mudar("categoria", e.target.value)}>
          <option value="">{hortifruti ? "Todos os tipos" : "Todos os departamentos"}</option>
          {(hortifruti ? CATEGORIAS_HORTIFRUTI : DEPARTAMENTOS_CONSUMO).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        <Select aria-label="Situação" value={filtros.situacao} onChange={(e) => mudar("situacao", e.target.value)}>
          <option value="">Todas as situações</option>
          {(hortifruti ? SITUACOES_HORTIFRUTI : SITUACOES_CONSUMO).map((c) => (
            <option key={c}>{c}</option>
          ))}
        </Select>
        {hortifruti ? null : (
          <Select aria-label="Provisionado" value={filtros.provisionado} onChange={(e) => mudar("provisionado", e.target.value)}>
            <option value="">Provisionado: todos</option>
            <option>PENDENTE</option>
            <option>SIM</option>
          </Select>
        )}
        <Input aria-label="Data inicial" type="date" value={filtros.de} onChange={(e) => mudar("de", e.target.value)} />
        <Input aria-label="Data final" type="date" value={filtros.ate} onChange={(e) => mudar("ate", e.target.value)} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="bg-surface text-left text-[11px] font-bold uppercase tracking-wider text-arcom-gray">
              <th className="px-4 py-2">Data</th>
              <th className="px-4 py-2">{hortifruti ? "Tipo / período" : "Compra"}</th>
              <th className="px-4 py-2">OCS</th>
              <th className="px-4 py-2">Situação</th>
              {hortifruti ? null : <th className="px-4 py-2">Provisionado</th>}
              <th className="px-4 py-2 text-right">Total escolhido</th>
              <th className="px-4 py-2 text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {lista.isPending
              ? Array.from({ length: 4 }, (_, i) => (
                  <tr key={i} className="border-t border-surface-border">
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-4 animate-pulse rounded bg-surface" />
                    </td>
                  </tr>
                ))
              : null}
            {!lista.isPending && !itens.length ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-arcom-gray">
                  Nenhuma cotação encontrada.
                </td>
              </tr>
            ) : null}
            {itens.map((c) => (
              <tr key={c.id} className="border-t border-surface-border hover:bg-surface/60">
                <td className="whitespace-nowrap px-4 py-2">{dataBR(c.data)}</td>
                <td className="px-4 py-2">
                  <p className="font-semibold text-verde-escuro">{hortifruti ? c.categoria : c.titulo || "(sem nome)"}</p>
                  <p className="text-xs text-arcom-gray">
                    {hortifruti ? c.periodo || c.descricao : [c.categoria, c.solicitante].filter(Boolean).join(" · ")}
                    {c.pedidoId ? " · pedido do restaurante" : ""}
                  </p>
                </td>
                <td className="px-4 py-2">{c.ocs || "-"}</td>
                <td className="px-4 py-2">
                  <BadgeSituacao situacao={c.situacao} />
                  {hortifruti && c.situacao === "PEDIDOS ENVIADOS" ? (
                    <Badge variante="alerta" className="ml-1">
                      Aguardando NF
                    </Badge>
                  ) : null}
                </td>
                {hortifruti ? null : (
                  <td className="px-4 py-2">
                    <BadgeSituacao situacao={c.provisionado} />
                  </td>
                )}
                <td className="px-4 py-2 text-right font-semibold text-verde-escuro">{moeda(c.totalEscolhido)}</td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-1">
                    <Button tamanho="sm" variante="ghost" disabled={abrindo === c.id} onClick={() => void abrir(c.id, "visualizar")}>
                      <Eye /> Visualizar
                    </Button>
                    <Button tamanho="icone" variante="ghost" title="Editar" aria-label="Editar" disabled={abrindo === c.id} onClick={() => void abrir(c.id, "editar")}>
                      <Pencil />
                    </Button>
                    <Button tamanho="icone" variante="ghost" title="Duplicar" aria-label="Duplicar" disabled={abrindo === c.id} onClick={() => void abrir(c.id, "duplicar")}>
                      <CopyPlus />
                    </Button>
                    <Button tamanho="icone" variante="ghost" title="Excluir" aria-label="Excluir" className="hover:text-danger" onClick={() => void aoExcluir(c)}>
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pag && pag.totalPaginas > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-surface-border px-4 py-2 text-sm">
          <span className="text-arcom-gray">
            Página {pag.pagina} de {pag.totalPaginas} · {pag.total} cotações
          </span>
          <Button tamanho="sm" variante="secondary" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            Anterior
          </Button>
          <Button tamanho="sm" variante="secondary" disabled={pagina >= pag.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
