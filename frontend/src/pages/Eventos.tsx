import { useQueryClient } from "@tanstack/react-query";
import { Copy, CopyPlus, Download, FileDown, FileUp, ImageDown, ListPlus, Plus, Printer, Save, Search, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { eventoVazio, exportarCSV, importarCSV, indicadores, novaDespesa, relatorioEvento, subtotaisPorCategoria, type EventoEdicao } from "@/components/eventos/arquivos";
import { CampoNumero, TabelaDespesas } from "@/components/eventos/TabelaDespesas";
import { TituloTela } from "@/components/Layout";
import { BadgeSituacao } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, Indicador } from "@/components/ui/card";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import { cn } from "@/core/cn";
import { MODELO_TREINAMENTO, SITUACOES_EVENTO } from "@/core/constantes";
import type { ErroApi } from "@/core/erro";
import { useEstadoUI } from "@/core/estadoUI";
import { baixarBlob, baixarJSON, nomeArquivo } from "@/core/exportar";
import { dataBR, hojeISO, moeda, novoId, percentual } from "@/core/formato";
import { copiarImagem, gerarImagem } from "@/core/imagem";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import { useRascunho } from "@/hooks/rascunho";
import { eventoKeys, useEventos, useExcluirEvento, useSalvarEvento } from "@/hooks/recursos";
import type { EntradaEvento, Evento } from "@/tipos/api";

const ATRASO_AUTOSALVAR_MS = 2_000;

function paraEdicao(e: Evento): EventoEdicao {
  return {
    id: e.id,
    nome: e.nome,
    local: e.local,
    cidade: e.cidade,
    data: e.data ?? "",
    participantes: e.participantes,
    estados: e.estados,
    ocs: e.ocs,
    hospedados: e.hospedados,
    situacao: e.situacao,
    valorOrcado: e.valorOrcado,
    creditoFornecedor: e.creditoFornecedor,
    observacoes: e.observacoes,
    despesas: e.despesas ?? [],
    versao: e.versao,
  };
}

/** Corpo aceito pelo backend (sem campos a mais). */
function paraEntrada(e: EventoEdicao): EntradaEvento {
  return {
    nome: e.nome.trim(),
    local: e.local,
    cidade: e.cidade,
    data: e.data,
    participantes: e.participantes,
    estados: e.estados,
    ocs: e.ocs,
    hospedados: e.hospedados,
    situacao: e.situacao,
    valorOrcado: e.valorOrcado,
    creditoFornecedor: e.creditoFornecedor,
    observacoes: e.observacoes,
    despesas: e.despesas.map((d) => ({
      id: d.id,
      categoria: d.categoria,
      nome: d.nome,
      fornecedor: d.fornecedor,
      qtd: d.qtd,
      unidade: d.unidade,
      valorUnitario: d.valorUnitario,
      total: d.total,
      situacao: d.situacao,
      ocs: d.ocs,
    })),
    versao: e.versao,
  };
}

/** Assinatura do conteúdo, sem a versão — diz se há algo novo pra salvar. */
const assinatura = (e: EventoEdicao) => JSON.stringify({ ...paraEntrada(e), versao: 0 });

export default function Eventos() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState("");
  const lista = useEventos({ busca, situacao });
  const salvar = useSalvarEvento();
  const excluir = useExcluirEvento();
  const { iniciarOcupado, terminarOcupado } = useEstadoUI();

  const [edicao, setEdicao] = useState<EventoEdicao | null>(null);
  const salvoRef = useRef<string>("");
  const [salvoAs, setSalvoAs] = useState<string | null>(null);
  const arquivoCSV = useRef<HTMLInputElement>(null);

  const rascunho = useRascunho("evento-novo", edicao, { ativo: !!edicao && !edicao.id && !!edicao.nome.trim() });
  const rascunhoUsado = useRef(false);

  const mudar = (parcial: Partial<EventoEdicao>) => setEdicao((e) => (e ? { ...e, ...parcial } : e));

  const selecionar = (e: EventoEdicao) => {
    salvoRef.current = e.id ? assinatura(e) : "";
    setSalvoAs(null);
    setEdicao(e);
  };

  const recarregar = useCallback(
    async (id: string) => {
      await qc.invalidateQueries({ queryKey: eventoKeys.all });
      const atual = qc
        .getQueriesData<Evento[]>({ queryKey: eventoKeys.all })
        .flatMap(([, d]) => d ?? [])
        .find((x) => x.id === id);
      if (atual) selecionar(paraEdicao(atual));
    },
    [qc],
  );

  const gravar = useCallback(
    (e: EventoEdicao, silencioso: boolean) => {
      if (!e.nome.trim()) {
        if (!silencioso) notificar.aviso("Informe o nome do evento.");
        return;
      }
      const assin = assinatura(e);
      salvar.mutate(
        { id: e.id, dados: paraEntrada(e) },
        {
          onSuccess: (resp) => {
            salvoRef.current = assin;
            setSalvoAs(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
            // mantém o que foi digitado durante o envio; só atualiza id/versão
            setEdicao((atual) => (atual && (atual.id === resp.id || !atual.id) ? { ...atual, id: resp.id, versao: resp.versao } : atual));
            if (!e.id) {
              void rascunho.limpar();
              notificar.sucesso("Evento criado.");
            } else if (!silencioso) notificar.sucesso("Evento salvo.");
          },
          onError: (erro) => {
            if ((erro as ErroApi).codigo === "versao_desatualizada" && e.id) {
              notificar.aviso("O evento foi alterado em outra tela. Recarregamos a versão mais recente.");
              void recarregar(e.id);
            }
          },
        },
      );
    },
    [salvar, rascunho, recarregar],
  );

  // Salvamento automático: evento já existente, ~2s depois da última alteração.
  useEffect(() => {
    if (!edicao?.id || salvar.isPending) return;
    if (assinatura(edicao) === salvoRef.current) return;
    const t = setTimeout(() => gravar(edicao, true), ATRASO_AUTOSALVAR_MS);
    return () => clearTimeout(t);
  }, [edicao, gravar, salvar.isPending]);

  function novo() {
    const r = rascunho.inicial as EventoEdicao | null;
    if (r && !rascunhoUsado.current && Array.isArray(r.despesas)) {
      rascunhoUsado.current = true;
      selecionar({ ...eventoVazio(), ...r, id: undefined, versao: 0 });
      rascunho.marcarSalvo();
      notificar.info("Rascunho do evento novo recuperado.");
      return;
    }
    selecionar(eventoVazio());
  }

  function trocarPara(e: Evento) {
    if (edicao?.id && assinatura(edicao) !== salvoRef.current) gravar(edicao, true);
    selecionar(paraEdicao(e));
  }

  function duplicar() {
    if (!edicao) return;
    const copia: EventoEdicao = {
      ...edicao,
      id: undefined,
      versao: 0,
      nome: `${edicao.nome} (cópia)`,
      despesas: edicao.despesas.map((d) => novaDespesa({ ...d, id: novoId() })),
    };
    selecionar(copia);
    gravar(copia, false);
  }

  async function aoExcluir() {
    if (!edicao?.id) return;
    const ok = await confirmar({
      titulo: "Excluir evento?",
      mensagem: `"${edicao.nome}" e todas as ${edicao.despesas.length} despesas lançadas saem da lista.`,
      confirmar: "Excluir evento",
      perigo: true,
    });
    if (!ok) return;
    excluir.mutate(edicao.id, {
      onSuccess: () => {
        notificar.sucesso("Evento excluído.");
        setEdicao(null);
      },
    });
  }

  function usarModelo() {
    if (!edicao) return;
    const existentes = new Set(edicao.despesas.map((d) => d.nome.trim().toLowerCase()));
    const novas = MODELO_TREINAMENTO.filter((m) => !existentes.has(m.nome.toLowerCase())).map((m) =>
      novaDespesa({ nome: m.nome, categoria: m.categoria, unidade: m.unidade, situacao: "A COTAR" }),
    );
    if (!novas.length) {
      notificar.info("Todos os itens do modelo já estão no evento.");
      return;
    }
    mudar({ despesas: [...edicao.despesas, ...novas] });
    notificar.sucesso(`${novas.length} despesas do modelo incluídas.`);
  }

  async function imagem(acao: "copiar" | "baixar") {
    if (!edicao) return;
    iniciarOcupado();
    try {
      const blob = gerarImagem(relatorioEvento(edicao));
      if (acao === "copiar") {
        await copiarImagem(blob);
        notificar.sucesso("Imagem copiada. Cole no WhatsApp ou no e-mail.");
      } else {
        baixarBlob(await blob, nomeArquivo(`evento-${edicao.nome}`, "png"));
      }
    } catch {
      notificar.erro("Não foi possível gerar a imagem neste navegador.");
    } finally {
      terminarOcupado();
    }
  }

  async function aoImportarCSV(f: File | undefined) {
    if (!f || !edicao) return;
    try {
      const ev = importarCSV(await f.text(), edicao);
      if (edicao.despesas.length) {
        const ok = await confirmar({
          titulo: "Substituir as despesas?",
          mensagem: `O arquivo traz ${ev.despesas.length} despesas e os dados gerais do evento. As ${edicao.despesas.length} despesas atuais serão substituídas.`,
          confirmar: "Substituir",
        });
        if (!ok) return;
      }
      setEdicao(ev);
      notificar.sucesso(`CSV importado: ${ev.despesas.length} despesas.`);
    } finally {
      if (arquivoCSV.current) arquivoCSV.current.value = "";
    }
  }

  const ind = edicao ? indicadores(edicao) : null;
  const pendente = !!edicao?.id && assinatura(edicao) !== salvoRef.current;

  return (
    <div>
      <TituloTela
        titulo="Acompanhamento de eventos"
        descricao="Todos os eventos da empresa: dados, hospedagens e cada despesa (equipamentos, palestrante, deslocamentos, happy hour, coffee break), com orçado x efetivo."
        acoes={
          <>
            <Button variante="secondary" onClick={() => baixarJSON(`eventos-backup-${hojeISO()}.json`, lista.data ?? [])} disabled={!lista.data?.length}>
              <Download /> Backup JSON
            </Button>
            <Button onClick={novo}>
              <Plus /> Novo evento
            </Button>
          </>
        }
      />

      <div className="grid gap-5 xl:grid-cols-[300px_1fr]">
        <Card className="h-fit print:hidden">
          <div className="flex flex-col gap-2 border-b border-surface-border p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-arcom-gray" />
              <Input aria-label="Buscar evento" placeholder="Nome, cidade, local ou OCS" className="pl-9" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            <Select aria-label="Filtrar por situação" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
              <option value="">Todas as situações</option>
              {SITUACOES_EVENTO.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto">
            {lista.data?.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() => trocarPara(e)}
                  className={cn(
                    "w-full border-b border-l-[3px] border-surface-border px-4 py-3 text-left transition duration-fast hover:bg-surface",
                    edicao?.id === e.id ? "border-l-verde-lima bg-surface" : "border-l-transparent",
                  )}
                >
                  <p className="font-semibold text-verde-escuro">{e.nome}</p>
                  <p className="text-xs text-arcom-gray">
                    {[dataBR(e.data), e.cidade].filter(Boolean).join(" · ") || "Sem data"}
                  </p>
                  <div className="mt-1">
                    <BadgeSituacao situacao={e.situacao} />
                  </div>
                </button>
              </li>
            ))}
            {lista.data && !lista.data.length ? <li className="px-4 py-6 text-sm text-arcom-gray">Nenhum evento encontrado.</li> : null}
          </ul>
        </Card>

        {!edicao || !ind ? (
          <Card>
            <CardBody className="py-16 text-center text-arcom-gray">Selecione um evento na lista ou crie um novo.</CardBody>
          </Card>
        ) : (
          <div className="flex min-w-0 flex-col gap-5">
            <Card>
              <CardHeader
                titulo={edicao.nome || "Novo evento"}
                descricao={
                  edicao.id
                    ? salvar.isPending
                      ? "Salvando..."
                      : pendente
                        ? "Alterações serão salvas automaticamente."
                        : salvoAs
                          ? `Salvo automaticamente às ${salvoAs}.`
                          : "Alterações são salvas automaticamente."
                    : rascunho.salvoAs
                      ? `Rascunho guardado às ${rascunho.salvoAs}. Clique em Salvar evento para criar.`
                      : "Preencha e clique em Salvar evento."
                }
                acoes={
                  <>
                    <Button variante="secondary" tamanho="sm" onClick={() => void imagem("copiar")}>
                      <Copy /> Copiar imagem
                    </Button>
                    <Button variante="secondary" tamanho="sm" onClick={() => void imagem("baixar")}>
                      <ImageDown /> PNG
                    </Button>
                    <Button variante="secondary" tamanho="sm" onClick={() => exportarCSV(edicao)}>
                      <FileDown /> CSV
                    </Button>
                    <Button variante="secondary" tamanho="sm" onClick={() => arquivoCSV.current?.click()}>
                      <FileUp /> Importar CSV
                    </Button>
                    <Button variante="secondary" tamanho="sm" onClick={() => window.print()}>
                      <Printer /> Imprimir / PDF
                    </Button>
                    {edicao.id ? (
                      <>
                        <Button variante="ghost" tamanho="sm" onClick={duplicar}>
                          <CopyPlus /> Duplicar
                        </Button>
                        <Button variante="ghost" tamanho="sm" onClick={() => void aoExcluir()}>
                          <Trash2 className="text-danger" /> Excluir
                        </Button>
                      </>
                    ) : null}
                  </>
                }
              />
              <input
                ref={arquivoCSV}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                aria-label="Arquivo CSV do evento"
                onChange={(e) => void aoImportarCSV(e.target.files?.[0])}
              />
              <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Campo rotulo="Nome do evento" htmlFor="ev-nome" className="md:col-span-2">
                  <Input id="ev-nome" value={edicao.nome} onChange={(e) => mudar({ nome: e.target.value })} />
                </Campo>
                <Campo rotulo="Local do evento" htmlFor="ev-local">
                  <Input id="ev-local" value={edicao.local} onChange={(e) => mudar({ local: e.target.value })} />
                </Campo>
                <Campo rotulo="Cidade do evento" htmlFor="ev-cidade">
                  <Input id="ev-cidade" value={edicao.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />
                </Campo>
                <Campo rotulo="Data do evento" htmlFor="ev-data">
                  <Input id="ev-data" type="date" value={edicao.data} onChange={(e) => mudar({ data: e.target.value })} />
                </Campo>
                <Campo rotulo="Total de participantes" htmlFor="ev-part">
                  <Input id="ev-part" type="number" min={0} value={edicao.participantes} onChange={(e) => mudar({ participantes: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </Campo>
                <Campo rotulo="Pessoas hospedadas" htmlFor="ev-hosp">
                  <Input id="ev-hosp" type="number" min={0} value={edicao.hospedados} onChange={(e) => mudar({ hospedados: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                </Campo>
                <Campo rotulo="Estados participantes" htmlFor="ev-estados">
                  <Input id="ev-estados" placeholder="MG, GO, SP" value={edicao.estados} onChange={(e) => mudar({ estados: e.target.value })} />
                </Campo>
                <Campo rotulo="OCS" htmlFor="ev-ocs">
                  <Input id="ev-ocs" value={edicao.ocs} onChange={(e) => mudar({ ocs: e.target.value })} />
                </Campo>
                <Campo rotulo="Situação do orçamento" htmlFor="ev-sit">
                  <Select id="ev-sit" value={edicao.situacao} onChange={(e) => mudar({ situacao: e.target.value })}>
                    {SITUACOES_EVENTO.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </Select>
                </Campo>
                <Campo rotulo="Valor orçado" htmlFor="ev-orcado">
                  <div id="ev-orcado" className="rounded-md border border-surface-border bg-white">
                    <CampoNumero moedaBR rotulo="Valor orçado" valor={edicao.valorOrcado} aoMudar={(v) => mudar({ valorOrcado: v ?? 0 })} />
                  </div>
                </Campo>
                <Campo rotulo="Crédito de fornecedor" htmlFor="ev-credito">
                  <div id="ev-credito" className="rounded-md border border-surface-border bg-white">
                    <CampoNumero moedaBR rotulo="Crédito de fornecedor" valor={edicao.creditoFornecedor} aoMudar={(v) => mudar({ creditoFornecedor: v ?? 0 })} />
                  </div>
                </Campo>
                <Campo rotulo="Observações" htmlFor="ev-obs" className="md:col-span-2 xl:col-span-4">
                  <Textarea id="ev-obs" value={edicao.observacoes} onChange={(e) => mudar({ observacoes: e.target.value })} />
                </Campo>
              </CardBody>
            </Card>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Indicador rotulo="Valor orçado" valor={moeda(edicao.valorOrcado)} />
              <Indicador rotulo="Gasto efetivo previsto" valor={moeda(ind.efetivo)} detalhe={`${edicao.despesas.length} despesas`} />
              <Indicador rotulo="Crédito do fornecedor" valor={moeda(edicao.creditoFornecedor)} />
              <Indicador rotulo="Diferença (orçado - efetivo)" valor={moeda(ind.diferenca)} perigo={ind.diferenca < 0} />
            </div>
            <Card>
              <CardBody>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="font-semibold text-verde-escuro">Utilização do orçamento</span>
                  <span className={cn("font-bold", ind.estourou ? "text-danger" : "text-verde-arcom")}>
                    {edicao.valorOrcado > 0 ? percentual(ind.utilizacao) : "Informe o valor orçado"}
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface" role="progressbar" aria-valuenow={Math.round(ind.utilizacao)} aria-valuemin={0} aria-valuemax={100} aria-label="Utilização do orçamento">
                  <div
                    className={cn("h-full transition-all duration-normal", ind.estourou ? "bg-danger" : "bg-verde-arcom")}
                    style={{ width: `${Math.min(100, ind.utilizacao)}%` }}
                  />
                </div>
                {ind.estourou ? <p className="mt-2 text-sm font-semibold text-danger">O gasto previsto passou do orçamento em {moeda(-ind.diferenca)}.</p> : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                titulo="Despesas do evento"
                descricao="Valor total = quantidade × valor unitário; pode ser ajustado à mão."
                acoes={
                  <Button variante="secondary" tamanho="sm" onClick={usarModelo}>
                    <ListPlus /> Usar modelo de treinamento
                  </Button>
                }
              />
              <CardBody>
                <TabelaDespesas despesas={edicao.despesas} aoMudar={(despesas) => mudar({ despesas })} />
                {edicao.despesas.length ? (
                  <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {subtotaisPorCategoria(edicao).map((s) => (
                      <div key={s.categoria} className="flex justify-between rounded-md border border-surface-border px-3 py-2 text-sm">
                        <span className="text-arcom-gray">
                          {s.categoria} ({s.itens})
                        </span>
                        <span className="font-semibold text-verde-escuro">{moeda(s.total)}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </CardBody>
            </Card>

            <div className="flex justify-end print:hidden">
              <Button onClick={() => gravar(edicao, false)} disabled={salvar.isPending}>
                <Save /> {salvar.isPending ? "Salvando..." : "Salvar evento"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
