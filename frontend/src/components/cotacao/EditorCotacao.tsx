// Formulário de cotação compartilhado (carnes e verduras / compras de
// consumo): cabeçalho, grade, recomendações, condições/pedidos por
// fornecedor e ações. O estado mora na página (pra o histórico poder abrir
// uma cotação pra editar); aqui só se edita e salva.
import { FilePlus2, FileSpreadsheet, FileText, ImageDown, Copy, Printer, Save, Upload, Plus } from "lucide-react";
import { useState } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Campo, Input, Select, Textarea } from "@/components/ui/input";
import {
  CATEGORIAS_HORTIFRUTI,
  DEPARTAMENTOS_CONSUMO,
  FORNECEDORES_SUGERIDOS_HORTIFRUTI,
  SITUACOES_CONSUMO,
  SITUACOES_HORTIFRUTI,
} from "@/core/constantes";
import { escolher, novoFornecedor, novoItem, porFornecedor } from "@/core/cotacao";
import type { ErroApi } from "@/core/erro";
import { dataHoraBR, moeda } from "@/core/formato";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import { useRascunho } from "@/hooks/rascunho";
import { useHistoricoCusto, useSalvarCotacao } from "@/hooks/recursos";
import type { ConteudoCotacao, Formato } from "@/tipos/api";
import { adicionarFornecedor, baixarRelatorio, copiarRelatorio } from "./acoes";
import { efetivada, entradaDoForm, formDeCotacao, formTemConteudo, formVazio, nomeModulo, type FormCotacao } from "./estado";
import { GradeCotacao } from "./GradeCotacao";
import { ImportarPedido, type ModoImportacao } from "./ImportarPedido";
import { PedidosFornecedor } from "./PedidosFornecedor";
import { Recomendacoes } from "./Recomendacoes";
import { comEstoque, exportarCSV, relatorioCotacao } from "./relatorio";
import { TermosFornecedores } from "./TermosFornecedores";

export function EditorCotacao({ form, setForm }: { form: FormCotacao; setForm: (fn: (f: FormCotacao) => FormCotacao) => void }) {
  const hortifruti = form.modulo === "hortifruti";
  const chaveRascunho = hortifruti ? "cotacao-carnes" : "compras-consumo";
  const rascunho = useRascunho(chaveRascunho, form, { ativo: !form.id && formTemConteudo(form) });
  const [decidiuRascunho, setDecidiuRascunho] = useState(false);
  const [importando, setImportando] = useState(false);
  const salvar = useSalvarCotacao();
  const estoque = comEstoque(form);
  const codigos = estoque ? form.conteudo.itens.map((it) => it.codigoArcom) : [];
  const historico = useHistoricoCusto(codigos, form.id);

  const mudar = <K extends keyof FormCotacao>(campo: K, valor: FormCotacao[K]) => setForm((f) => ({ ...f, [campo]: valor }));
  const mudarConteudo = (fn: (c: ConteudoCotacao) => ConteudoCotacao) => setForm((f) => ({ ...f, conteudo: fn(f.conteudo) }));

  const rascunhoPendente =
    !decidiuRascunho && !form.id && rascunho.inicial && !formTemConteudo(form) && formTemConteudo(rascunho.inicial);

  const mudarCategoria = (categoria: string) =>
    setForm((f) => {
      const vazia = !f.conteudo.fornecedores.length && f.conteudo.itens.every((it) => !it.nome.trim() && !it.qtd);
      if (f.modulo === "hortifruti" && categoria === "Frutas e verduras" && vazia) {
        return {
          ...f,
          categoria,
          conteudo: {
            ...f.conteudo,
            fornecedores: FORNECEDORES_SUGERIDOS_HORTIFRUTI.map((n) => novoFornecedor(n.toUpperCase())),
            itens: [novoItem({ unidade: "cx" })],
          },
        };
      }
      return { ...f, categoria };
    });

  const importar = (itens: { nome: string; qtd: number | null; unidade: string; entrega: string }[], modo: ModoImportacao, periodo: string) =>
    setForm((f) => {
      const novos = itens.map((i) => novoItem({ nome: i.nome, qtd: i.qtd, unidade: i.unidade, entrega: i.entrega }));
      const existentes = f.conteudo.itens.filter((it) => it.nome.trim() || it.qtd || Object.values(it.precos).some(Boolean));
      return {
        ...f,
        periodo: f.periodo || periodo,
        conteudo: { ...f.conteudo, itens: modo === "substituir" ? novos : [...existentes, ...novos] },
      };
    });

  const novaCotacao = async () => {
    if (formTemConteudo(form)) {
      const ok = await confirmar({
        titulo: hortifruti ? "Iniciar uma nova cotação?" : "Iniciar uma nova compra?",
        mensagem: form.id
          ? "As alterações não salvas desta cotação serão descartadas. O que já está salvo no histórico continua preservado."
          : "O preenchimento atual será descartado. O histórico salvo continua preservado.",
        confirmar: "Começar do zero",
      });
      if (!ok) return;
    }
    setForm(() => formVazio(form.modulo));
    if (!form.id) void rascunho.limpar();
  };

  const aoSalvar = () => {
    const nova = !form.id;
    salvar.mutate(
      { id: form.id || undefined, dados: entradaDoForm(form) },
      {
        onSuccess: (c) => {
          if (nova) {
            void rascunho.limpar();
            setForm(() => formVazio(form.modulo));
            notificar.sucesso(
              hortifruti
                ? "Cotação salva no histórico e enviada ao Resumo Diário."
                : efetivada(c)
                  ? "Compra salva e lançada no Resumo Diário."
                  : "Orçamento salvo e enviado ao Resumo Diário (orçamentos realizados).",
            );
          } else {
            setForm(() => formDeCotacao(c));
            notificar.sucesso("Alterações salvas. O Resumo Diário foi atualizado.");
          }
        },
        onError: (e) => {
          const erro = e as ErroApi;
          if (erro.codigo === "validacao" && erro.campos) notificar.erro(Object.values(erro.campos)[0] ?? erro.mensagem);
        },
      },
    );
  };

  const escolhidos = porFornecedor(form.conteudo, escolher(form.modulo, form.conteudo));
  const situacoes = hortifruti ? SITUACOES_HORTIFRUTI : SITUACOES_CONSUMO;
  const rel = () => relatorioCotacao(form);

  return (
    <div className="space-y-5">
      {rascunhoPendente ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-verde-lima bg-verde-lima/20 px-4 py-3 print:hidden">
          <p className="text-sm text-verde-escuro">
            Existe um preenchimento não salvo{rascunho.inicialEm ? ` de ${dataHoraBR(rascunho.inicialEm)}` : ""}. Quer continuar de onde parou?
          </p>
          <div className="flex gap-2">
            <Button
              tamanho="sm"
              variante="ghost"
              onClick={() => {
                setDecidiuRascunho(true);
                void rascunho.limpar();
              }}
            >
              Descartar
            </Button>
            <Button
              tamanho="sm"
              onClick={() => {
                setDecidiuRascunho(true);
                const r = rascunho.inicial as FormCotacao;
                setForm(() => ({ ...formVazio(form.modulo), ...r, id: "", versao: 0, modulo: form.modulo }));
              }}
            >
              Restaurar rascunho
            </Button>
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader
          titulo={form.id ? `Editando: ${form.titulo || nomeModulo(form)}` : hortifruti ? "Nova cotação" : "Nova compra"}
          descricao={
            form.id
              ? "Salvar atualiza o mesmo registro (não cria cópia)."
              : rascunho.salvoAs
                ? `Rascunho salvo automaticamente às ${rascunho.salvoAs}.`
                : "O preenchimento é salvo automaticamente como rascunho."
          }
          acoes={
            <>
              <Button variante="ghost" onClick={() => setImportando(true)}>
                <Upload /> Importar pedido
              </Button>
              <Button variante="ghost" onClick={() => void novaCotacao()}>
                <FilePlus2 /> {hortifruti ? "Nova semana" : "Nova compra"}
              </Button>
            </>
          }
        />
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {hortifruti ? (
            <>
              <Campo rotulo="Tipo da cotação" htmlFor="categoria">
                <Select id="categoria" value={form.categoria} onChange={(e) => mudarCategoria(e.target.value)}>
                  {CATEGORIAS_HORTIFRUTI.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Período da compra" htmlFor="periodo">
                <Input id="periodo" placeholder="02/11 a 07/11" value={form.periodo} onChange={(e) => mudar("periodo", e.target.value)} />
              </Campo>
            </>
          ) : (
            <>
              <Campo rotulo="Departamento" htmlFor="categoria">
                <Select id="categoria" value={form.categoria} onChange={(e) => mudarCategoria(e.target.value)}>
                  {DEPARTAMENTOS_CONSUMO.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </Campo>
              <Campo rotulo="Formato da cotação" htmlFor="formato">
                <Select id="formato" value={form.formato} onChange={(e) => mudar("formato", e.target.value as Formato)}>
                  <option value="lista">Lista de itens</option>
                  <option value="alternativas">Quantidades alternativas</option>
                </Select>
              </Campo>
              <Campo rotulo="Nome da compra ou projeto" htmlFor="titulo" className="sm:col-span-2">
                <Input id="titulo" value={form.titulo} onChange={(e) => mudar("titulo", e.target.value)} />
              </Campo>
              <Campo rotulo="Solicitante" htmlFor="solicitante">
                <Input id="solicitante" value={form.solicitante} onChange={(e) => mudar("solicitante", e.target.value.toUpperCase())} />
              </Campo>
              <Campo rotulo="Centro de custo" htmlFor="centroCusto">
                <Input id="centroCusto" value={form.centroCusto} onChange={(e) => mudar("centroCusto", e.target.value)} />
              </Campo>
            </>
          )}
          <Campo rotulo={hortifruti ? "OCS" : "OCS ou referência"} htmlFor="ocs">
            <Input id="ocs" value={form.ocs} onChange={(e) => mudar("ocs", e.target.value)} />
          </Campo>
          <Campo rotulo="Data da cotação" htmlFor="data">
            <Input id="data" type="date" value={form.data} onChange={(e) => mudar("data", e.target.value)} />
          </Campo>
          <Campo rotulo="Situação" htmlFor="situacao">
            <Select id="situacao" value={form.situacao} onChange={(e) => mudar("situacao", e.target.value)}>
              {situacoes.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Campo>
          {!hortifruti ? (
            <Campo rotulo="Provisionado" htmlFor="provisionado">
              <Select id="provisionado" value={form.provisionado} onChange={(e) => mudar("provisionado", e.target.value as FormCotacao["provisionado"])}>
                <option>PENDENTE</option>
                <option>SIM</option>
              </Select>
            </Campo>
          ) : null}
          <Campo rotulo={hortifruti ? "Observação" : "Descrição e especificações"} htmlFor="descricao" className="sm:col-span-2 lg:col-span-4">
            <Textarea id="descricao" className="min-h-14" value={form.descricao} onChange={(e) => mudar("descricao", e.target.value)} />
          </Campo>
          {form.pedidoId ? (
            <p className="text-xs font-medium text-verde-arcom sm:col-span-2 lg:col-span-4">Cotação vinculada a um pedido do restaurante.</p>
          ) : null}
        </CardBody>
      </Card>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-verde-escuro">Comparativo de preços</h2>
          {!form.conteudo.fornecedores.length ? (
            <Button tamanho="sm" onClick={() => void adicionarFornecedor(mudarConteudo)}>
              <Plus /> Adicionar fornecedor
            </Button>
          ) : null}
        </div>
        <GradeCotacao
          modulo={form.modulo}
          conteudo={form.conteudo}
          aoMudar={mudarConteudo}
          estoque={estoque}
          alternativas={form.modulo === "consumo" && form.formato === "alternativas"}
          historico={historico.data}
        />
        <p className="text-xs text-arcom-gray">
          O menor preço de cada item fica marcado em verde. Para escolher outro fornecedor (qualidade, prazo), clique no marcador ao lado do preço; clique de novo para voltar ao automático. Passe o mouse no preço para ver o total e a diferença.
        </p>
      </section>

      <Recomendacoes modulo={form.modulo} conteudo={form.conteudo} />

      {!hortifruti && form.conteudo.fornecedores.length ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-verde-escuro">Condições por fornecedor</h2>
          <TermosFornecedores conteudo={form.conteudo} aoMudar={mudarConteudo} />
        </section>
      ) : null}

      {hortifruti ? (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-verde-escuro">Pedidos por fornecedor e acompanhamento da NF</h2>
          <p className="text-sm text-arcom-gray">
            Gere a OS no sistema, informe aqui e envie o pedido ao fornecedor. Depois da entrega, lance a NF e marque como lançada.
          </p>
          <PedidosFornecedor form={form} aoMudar={mudarConteudo} />
        </section>
      ) : null}

      {!hortifruti && form.id && efetivada(form) && escolhidos.length ? (
        <section className="flex flex-wrap items-center gap-2 rounded-md border border-surface-border bg-white px-4 py-3 print:hidden">
          <span className="text-sm font-semibold text-verde-escuro">Ordem de compra:</span>
          {escolhidos.map((r) => (
            <Button key={r.fornecedor.id} tamanho="sm" variante="secondary" onClick={() => window.open(`/ordem-compra/${form.id}/${r.fornecedor.id}`, "_blank", "noopener")}>
              <FileText /> {r.fornecedor.nome} · {moeda(r.total)}
            </Button>
          ))}
        </section>
      ) : null}

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center justify-end gap-2 border-t border-surface-border bg-white/95 px-4 py-3 shadow-md lg:-mx-6 lg:px-6 print:hidden">
        <Button variante="ghost" onClick={() => exportarCSV(form)}>
          <FileSpreadsheet /> CSV
        </Button>
        <Button variante="ghost" onClick={() => window.print()}>
          <Printer /> Imprimir / PDF
        </Button>
        <Button variante="ghost" onClick={() => void baixarRelatorio(rel(), `${nomeModulo(form)} ${form.titulo || form.periodo} ${form.data}`)}>
          <ImageDown /> PNG
        </Button>
        <Button variante="secondary" onClick={() => void copiarRelatorio(rel())}>
          <Copy /> Copiar imagem
        </Button>
        <Button onClick={aoSalvar} disabled={salvar.isPending}>
          <Save /> {salvar.isPending ? "Salvando..." : form.id ? "Salvar alterações" : hortifruti ? "Salvar cotação" : "Salvar orçamento"}
        </Button>
      </div>

      <ImportarPedido aberto={importando} aoMudar={setImportando} aoImportar={importar} />
    </div>
  );
}
