// Página de cotação (abas Nova cotação / Histórico) usada por Cotação de
// carnes e verduras e por Compras de consumo.
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { TituloTela } from "@/components/Layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/core/api";
import { novoItem } from "@/core/cotacao";
import { notificar } from "@/core/toast";
import { buscarCotacao } from "@/hooks/recursos";
import type { Modulo, PedidoRestaurante } from "@/tipos/api";
import { duplicarForm, formDeCotacao, formVazio, type FormCotacao } from "./estado";
import { EditorCotacao } from "./EditorCotacao";
import { HistoricoCotacoes } from "./HistoricoCotacoes";
import { VisualizarCotacao } from "./VisualizarCotacao";

export function PaginaCotacao({ modulo, titulo, descricao }: { modulo: Modulo; titulo: string; descricao: string }) {
  const [form, setFormEstado] = useState<FormCotacao>(() => formVazio(modulo));
  const [aba, setAba] = useState("nova");
  const [visualizando, setVisualizando] = useState<FormCotacao | null>(null);
  const [params, setParams] = useSearchParams();
  const pedidoId = modulo === "hortifruti" ? params.get("pedido") : null;
  const cotacaoParam = params.get("cotacao");

  const setForm = (fn: (f: FormCotacao) => FormCotacao) => setFormEstado(fn);

  // ?pedido=<id>: pré-preenche a cotação com o pedido do restaurante.
  const pedido = useQuery({
    queryKey: ["pedidos-restaurante", "item", pedidoId],
    queryFn: async () => (await api.get<PedidoRestaurante>(`/pedidos-restaurante/${pedidoId}`)).data,
    enabled: !!pedidoId,
  });
  const aplicado = useRef<string | null>(null);
  useEffect(() => {
    const p = pedido.data;
    if (!p || aplicado.current === p.id) return;
    aplicado.current = p.id;
    if (p.cotacaoId) {
      notificar.aviso("Este pedido já virou cotação. Abrindo a cotação existente.");
      setParams({ cotacao: p.cotacaoId }, { replace: true });
      return;
    }
    setFormEstado({
      ...formVazio("hortifruti"),
      categoria: p.categoria,
      periodo: p.periodo,
      descricao: p.observacao,
      pedidoId: p.id,
      conteudo: {
        fornecedores: [],
        pedidos: {},
        itens: p.itens.length
          ? p.itens.map((i) => novoItem({ nome: i.nome, qtd: i.qtd, unidade: i.unidade || "un", entrega: i.entrega, observacao: i.observacao }))
          : [novoItem()],
      },
    });
    setAba("nova");
    notificar.info(`Pedido de ${p.criadoPorNome} carregado. Adicione os fornecedores e os preços.`);
  }, [pedido.data, setParams]);

  // ?cotacao=<id>: abre a visualização dessa cotação.
  const cotacao = useQuery({
    queryKey: ["cotacoes", "item", cotacaoParam],
    queryFn: () => buscarCotacao(cotacaoParam ?? ""),
    enabled: !!cotacaoParam,
  });
  const abertaParam = useRef<string | null>(null);
  useEffect(() => {
    const c = cotacao.data;
    if (!c || abertaParam.current === c.id) return;
    abertaParam.current = c.id;
    setAba("historico");
    setVisualizando(formDeCotacao(c));
  }, [cotacao.data]);

  const editar = (f: FormCotacao) => {
    setVisualizando(null);
    setFormEstado(f);
    setAba("nova");
    window.scrollTo({ top: 0 });
  };

  return (
    <div>
      <TituloTela titulo={titulo} descricao={descricao} />
      <Tabs value={aba} onValueChange={setAba}>
        <TabsList>
          <TabsTrigger value="nova">{form.id ? "Editando cotação" : modulo === "hortifruti" ? "Nova cotação" : "Nova compra"}</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>
        <TabsContent value="nova">
          <EditorCotacao form={form} setForm={setForm} />
        </TabsContent>
        <TabsContent value="historico">
          <HistoricoCotacoes
            modulo={modulo}
            aoAbrir={(c, acao) => {
              const f = formDeCotacao(c);
              if (acao === "visualizar") setVisualizando(f);
              else if (acao === "editar") editar(f);
              else {
                editar(duplicarForm(f));
                notificar.info("Cópia aberta como nova cotação. Salve para criar o registro.");
              }
            }}
          />
        </TabsContent>
      </Tabs>
      <VisualizarCotacao
        form={visualizando}
        aoFechar={() => {
          setVisualizando(null);
          if (cotacaoParam) setParams({}, { replace: true });
        }}
        aoEditar={editar}
      />
    </div>
  );
}
