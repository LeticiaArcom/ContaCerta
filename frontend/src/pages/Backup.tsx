import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileUp, RotateCcw } from "lucide-react";
import { useRef, useState } from "react";
import { TituloTela } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { api } from "@/core/api";
import { baixarJSON } from "@/core/exportar";
import { dataBR, hojeISO, moeda } from "@/core/formato";
import { emLotes, lerBackup, previa, TAMANHO_LOTE, type Lotes, type Previa } from "@/core/importarBackup";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import type { ResultadoImportacao } from "@/tipos/api";

type Etapa = "fornecedores" | "cotacoes" | "compras" | "eventos";
const ETAPAS: { chave: Etapa; rotulo: string; rota: string }[] = [
  { chave: "fornecedores", rotulo: "Fornecedores", rota: "/importacao/fornecedores" },
  { chave: "cotacoes", rotulo: "Cotações e orçamentos", rota: "/importacao/cotacoes" },
  { chave: "compras", rotulo: "Lançamentos do Resumo", rota: "/importacao/compras" },
  { chave: "eventos", rotulo: "Eventos", rota: "/importacao/eventos" },
];

type Progresso = { etapa: string; enviados: number; total: number };
type Resultado = Partial<Record<Etapa, ResultadoImportacao>>;

function LinhaPrevia({ rotulo, valor }: { rotulo: string; valor: string | number }) {
  return (
    <div className="flex justify-between gap-4 border-b border-surface-border py-1.5 text-sm last:border-0">
      <span className="text-arcom-gray">{rotulo}</span>
      <span className="font-semibold text-verde-escuro">{valor}</span>
    </div>
  );
}

export default function Backup() {
  const qc = useQueryClient();
  const entrada = useRef<HTMLInputElement>(null);
  const [lotes, setLotes] = useState<Lotes | null>(null);
  const [resumo, setResumo] = useState<Previa | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erroArquivo, setErroArquivo] = useState("");
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const baixar = useMutation({
    mutationFn: async () => (await api.get<unknown>("/backup")).data,
    onSuccess: (dados) => {
      baixarJSON(`conta-certa-backup-${hojeISO()}.json`, dados);
      notificar.sucesso("Backup completo baixado.");
    },
  });

  const importar = useMutation({
    mutationFn: async (l: Lotes) => {
      const res: Resultado = {};
      for (const etapa of ETAPAS) {
        const lista = l[etapa.chave] as unknown[];
        const partes = emLotes(lista, TAMANHO_LOTE[etapa.chave]);
        let enviados = 0;
        const acumulado: ResultadoImportacao = { criados: 0, atualizados: 0 };
        setProgresso({ etapa: etapa.rotulo, enviados, total: lista.length });
        for (const parte of partes) {
          const { data } = await api.post<ResultadoImportacao>(etapa.rota, { itens: parte });
          acumulado.criados += data.criados;
          acumulado.atualizados += data.atualizados;
          enviados += parte.length;
          setProgresso({ etapa: etapa.rotulo, enviados, total: lista.length });
        }
        if (lista.length) res[etapa.chave] = acumulado;
      }
      return res;
    },
    onSuccess: (res) => {
      setResultado(res);
      setLotes(null);
      setResumo(null);
      notificar.sucesso("Importação concluída.");
    },
    onSettled: () => {
      setProgresso(null);
      void qc.invalidateQueries();
    },
  });

  async function aoEscolherArquivo(arquivo: File | undefined) {
    setErroArquivo("");
    setResultado(null);
    setLotes(null);
    setResumo(null);
    if (!arquivo) return;
    setNomeArquivo(arquivo.name);
    try {
      const l = lerBackup(JSON.parse(await arquivo.text()) as unknown);
      const p = previa(l);
      if (!p.compras && !p.orcamentos && !p.cotacoes && !p.eventos && !p.fornecedores) {
        setErroArquivo("O arquivo foi reconhecido, mas não tem nenhum registro para importar.");
        return;
      }
      setLotes(l);
      setResumo(p);
    } catch (e) {
      setErroArquivo(e instanceof SyntaxError ? "O arquivo não é um JSON válido." : (e as Error).message);
    } finally {
      if (entrada.current) entrada.current.value = "";
    }
  }

  async function iniciar() {
    if (!lotes || !resumo) return;
    const ok = await confirmar({
      titulo: "Importar este backup?",
      mensagem:
        "Registros com o mesmo identificador são atualizados, os novos são incluídos e nada é duplicado — pode importar o mesmo arquivo de novo com segurança. Lançamentos feitos neste sistema que não estão no arquivo continuam como estão.",
      confirmar: "Importar agora",
      cancelar: "Voltar",
    });
    if (ok) importar.mutate(lotes);
  }

  return (
    <div className="flex flex-col gap-5">
      <TituloTela
        titulo="Backup e importação"
        descricao="Os dados agora ficam no banco do Conta Certa e valem em qualquer computador. Baixe o backup completo com frequência e use a importação para trazer o histórico do sistema anterior."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader titulo="Baixar backup completo" descricao="Compras do Resumo, cotações, eventos e fornecedores num único arquivo JSON." />
          <CardBody>
            <Button onClick={() => baixar.mutate()} disabled={baixar.isPending}>
              <Download /> {baixar.isPending ? "Gerando..." : "Baixar backup completo"}
            </Button>
            <p className="mt-3 text-xs text-arcom-gray">
              O arquivo pode ser restaurado aqui mesmo, em "Importar ou restaurar backup".
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            titulo="Importar ou restaurar backup"
            descricao="Aceita o Backup Geral do sistema anterior (versão 1) e o backup deste sistema (versão 2)."
          />
          <CardBody className="flex flex-col gap-3">
            <input
              ref={entrada}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void aoEscolherArquivo(e.target.files?.[0])}
              aria-label="Arquivo de backup"
            />
            <div>
              <Button variante="secondary" onClick={() => entrada.current?.click()} disabled={importar.isPending}>
                <FileUp /> Escolher arquivo
              </Button>
            </div>
            <p className="text-xs text-arcom-gray">
              No sistema anterior, use "Baixar backup geral" na capa e escolha o arquivo aqui. Os lançamentos da base segura
              (149 compras de 16/09/2026 a 26/10/2026) vêm dentro desse arquivo.
            </p>
            {erroArquivo ? <p className="rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erroArquivo}</p> : null}
          </CardBody>
        </Card>
      </div>

      {resumo ? (
        <Card>
          <CardHeader
            titulo="Prévia da importação"
            descricao={`${nomeArquivo} · ${resumo.formato === "anterior" ? "Backup Geral do sistema anterior" : "Backup deste sistema"}`}
            acoes={
              <>
                <Button variante="ghost" onClick={() => { setLotes(null); setResumo(null); }} disabled={importar.isPending}>
                  Cancelar
                </Button>
                <Button onClick={() => void iniciar()} disabled={importar.isPending}>
                  <RotateCcw /> {importar.isPending ? "Importando..." : "Importar"}
                </Button>
              </>
            }
          />
          <CardBody className="grid gap-6 md:grid-cols-2">
            <div>
              <LinhaPrevia rotulo="Compras realizadas" valor={resumo.compras} />
              <LinhaPrevia rotulo="Orçamentos (cotações em andamento)" valor={resumo.orcamentos} />
              <LinhaPrevia rotulo="Valor das compras realizadas" valor={moeda(resumo.valorCompras)} />
              <LinhaPrevia
                rotulo="Período dos lançamentos"
                valor={resumo.periodo ? `${dataBR(resumo.periodo.de)} a ${dataBR(resumo.periodo.ate)}` : "-"}
              />
            </div>
            <div>
              <LinhaPrevia rotulo="Cotações e orçamentos completos" valor={resumo.cotacoes} />
              <LinhaPrevia rotulo="Eventos" valor={resumo.eventos} />
              <LinhaPrevia rotulo="Fornecedores" valor={resumo.fornecedores} />
              {resumo.ignorados ? <LinhaPrevia rotulo="Registros sem data válida (ignorados)" valor={resumo.ignorados} /> : null}
            </div>
            {progresso ? (
              <div className="md:col-span-2">
                <p className="mb-1 text-sm font-semibold text-verde-escuro">
                  {progresso.etapa}: {progresso.enviados} de {progresso.total}
                </p>
                <div className="h-2 overflow-hidden rounded-full bg-surface">
                  <div
                    className="h-full bg-verde-arcom transition-all duration-normal"
                    style={{ width: `${progresso.total ? (progresso.enviados / progresso.total) * 100 : 100}%` }}
                  />
                </div>
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      {resultado ? (
        <Card>
          <CardHeader titulo={<span className="flex items-center gap-2"><CheckCircle2 className="size-5 text-verde-arcom" /> Importação concluída</span>} />
          <CardBody>
            <table className="w-full max-w-lg text-sm">
              <thead>
                <tr className="text-left text-xs font-bold uppercase tracking-wider text-arcom-gray">
                  <th className="py-1">Tipo</th>
                  <th className="py-1 text-right">Incluídos</th>
                  <th className="py-1 text-right">Atualizados</th>
                </tr>
              </thead>
              <tbody>
                {ETAPAS.filter((e) => resultado[e.chave]).map((e) => (
                  <tr key={e.chave} className="border-t border-surface-border">
                    <td className="py-1.5 text-verde-escuro">{e.rotulo}</td>
                    <td className="py-1.5 text-right font-semibold">{resultado[e.chave]?.criados}</td>
                    <td className="py-1.5 text-right font-semibold">{resultado[e.chave]?.atualizados}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-arcom-gray">
              Fornecedores são mesclados ao cadastro (só completam o que falta), por isso aparecem como atualizados.
            </p>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
