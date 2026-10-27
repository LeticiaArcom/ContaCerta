import { ArrowRight, Beef, CalendarDays, ClipboardList, FileText, History, PenSquare, ShoppingCart } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { separar } from "@/components/resumo/relatorioDiario";
import { BadgeSituacao } from "@/components/ui/badge";
import { Card, CardHeader, Indicador } from "@/components/ui/card";
import { dataBR, hojeISO, moeda } from "@/core/formato";
import { useCotacoes, useEventos, usePedidos, useTodasCompras, useTotaisCompras } from "@/hooks/recursos";

function Atalho({ para, icone, titulo, texto }: { para: string; icone: ReactNode; titulo: string; texto: string }) {
  return (
    <Link
      to={para}
      className="group flex items-start gap-3 rounded-md border border-surface-border bg-white p-4 shadow-sm transition duration-fast hover:-translate-y-0.5 hover:shadow-md [&_svg]:size-5"
    >
      <span className="rounded-md bg-verde-arcom/10 p-2 text-verde-arcom">{icone}</span>
      <span>
        <span className="block font-semibold text-verde-escuro group-hover:text-verde-arcom">{titulo}</span>
        <span className="block text-xs text-arcom-gray">{texto}</span>
      </span>
    </Link>
  );
}

function Vazio({ children }: { children: ReactNode }) {
  return <li className="px-5 py-4 text-sm text-arcom-gray">{children}</li>;
}

function Esqueleto() {
  return (
    <li className="px-5 py-4">
      <div className="h-10 animate-pulse rounded-md bg-surface" />
    </li>
  );
}

export default function Painel() {
  const hoje = hojeISO();
  const dia = useTodasCompras({ data: hoje });
  const { compras, orcamentos, total } = separar(dia.data ?? []);
  const pendentes = useTotaisCompras({ provisionado: "PENDENTE", tipo: "compra" });
  const cotacoes = useCotacoes({ situacao: "EM COTAÇÃO", porPagina: 8 });
  const pedidos = usePedidos({ situacao: "ENVIADO", porPagina: 8 });
  const eventos = useEventos({});
  const proximos = (eventos.data ?? [])
    .filter((e) => e.data && e.data >= hoje && e.situacao !== "CONCLUÍDO")
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
    .slice(0, 6);

  return (
    <>
      <div className="mb-6 overflow-hidden rounded-lg bg-verde-escuro p-6 lg:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-verde-lima">Gestão de Compras</p>
        <h1 className="mt-1 text-3xl font-black text-white lg:text-5xl">Decida com números. Sem complicação.</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/80">
          Cotações, fornecedores, compras, provisionamentos e eventos num lugar só. Hoje é {dataBR(hoje)}.
        </p>
        <span className="mt-4 block h-1.5 w-16 bg-verde-lima" />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Compras de hoje" valor={moeda(total)} detalhe={`${compras.length} lançamento(s)`} />
        <Indicador rotulo="Orçamentos de hoje" valor={orcamentos.length} detalhe="não somam no total do dia" />
        <Indicador
          rotulo="Pendentes de provisionar"
          valor={pendentes.data?.quantidade ?? "-"}
          detalhe={moeda(pendentes.data?.valorTotal ?? 0)}
          perigo={(pendentes.data?.quantidade ?? 0) > 0}
        />
        <Indicador
          rotulo="Pedidos do restaurante"
          valor={pedidos.data?.paginacao.total ?? "-"}
          detalhe="aguardando cotação"
        />
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Atalho para="/resumo/lancar" icone={<PenSquare />} titulo="Lançar compra" texto="Registrar compras e orçamentos do dia" />
        <Atalho para="/resumo/diario" icone={<FileText />} titulo="Resumo diário" texto="Copiar o resumo em imagem para a empresa" />
        <Atalho para="/resumo/historico" icone={<History />} titulo="Histórico" texto="OCS abertas e provisionamentos pendentes" />
        <Atalho para="/cotacao-carnes" icone={<Beef />} titulo="Cotação de carnes e verduras" texto="Cotação semanal de sexta-feira" />
        <Atalho para="/compras-consumo" icone={<ShoppingCart />} titulo="Compras de consumo" texto="Cotações por departamento" />
        <Atalho para="/pedidos-restaurante" icone={<ClipboardList />} titulo="Pedidos do restaurante" texto="O que o time do restaurante enviou" />
        <Atalho para="/eventos" icone={<CalendarDays />} titulo="Eventos" texto="Orçado x efetivo de cada evento" />
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card>
          <CardHeader
            titulo="Cotações em andamento"
            acoes={
              <Link to="/compras-consumo" className="flex items-center gap-1 text-sm font-semibold text-verde-arcom hover:underline">
                Ver todas <ArrowRight className="size-4" />
              </Link>
            }
          />
          <ul className="divide-y divide-surface-border">
            {cotacoes.isPending ? <Esqueleto /> : null}
            {!cotacoes.isPending && !cotacoes.data?.itens.length ? <Vazio>Nenhuma cotação em andamento.</Vazio> : null}
            {cotacoes.data?.itens.map((c) => (
              <li key={c.id} className="px-5 py-3 text-sm">
                <Link
                  to={c.modulo === "hortifruti" ? `/cotacao-carnes?cotacao=${c.id}` : `/compras-consumo?cotacao=${c.id}`}
                  className="flex items-start justify-between gap-2 hover:text-verde-arcom"
                >
                  <span className="min-w-0">
                    <span className="block break-words font-semibold text-verde-escuro">
                      {c.titulo || (c.modulo === "hortifruti" ? `Cotação de ${c.categoria.toLowerCase()}` : c.categoria)}
                    </span>
                    <span className="block text-xs text-arcom-gray">
                      {c.modulo === "hortifruti" ? "Carnes e verduras" : c.categoria} · {dataBR(c.data)}
                      {c.ocs ? ` · OCS ${c.ocs}` : ""}
                    </span>
                  </span>
                  <span className="whitespace-nowrap text-xs font-bold text-verde-escuro">{moeda(c.totalEscolhido)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            titulo="Pedidos do restaurante"
            descricao="Aguardando cotação"
            acoes={
              <Link to="/pedidos-restaurante" className="flex items-center gap-1 text-sm font-semibold text-verde-arcom hover:underline">
                Abrir <ArrowRight className="size-4" />
              </Link>
            }
          />
          <ul className="divide-y divide-surface-border">
            {pedidos.isPending ? <Esqueleto /> : null}
            {!pedidos.isPending && !pedidos.data?.itens.length ? <Vazio>Nenhum pedido aguardando.</Vazio> : null}
            {pedidos.data?.itens.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-2 px-5 py-3 text-sm">
                <span>
                  <span className="block font-semibold text-verde-escuro">
                    {p.categoria}
                    {p.periodo ? ` · ${p.periodo}` : ""}
                  </span>
                  <span className="block text-xs text-arcom-gray">
                    {p.itens.length} item(ns) · {p.criadoPorNome}
                  </span>
                </span>
                <BadgeSituacao situacao={p.situacao} />
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <CardHeader
            titulo="Próximos eventos"
            acoes={
              <Link to="/eventos" className="flex items-center gap-1 text-sm font-semibold text-verde-arcom hover:underline">
                Abrir <ArrowRight className="size-4" />
              </Link>
            }
          />
          <ul className="divide-y divide-surface-border">
            {eventos.isPending ? <Esqueleto /> : null}
            {!eventos.isPending && proximos.length === 0 ? <Vazio>Nenhum evento agendado.</Vazio> : null}
            {proximos.map((e) => (
              <li key={e.id} className="flex items-start justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block break-words font-semibold text-verde-escuro">{e.nome}</span>
                  <span className="block text-xs text-arcom-gray">
                    {dataBR(e.data)}
                    {e.cidade ? ` · ${e.cidade}` : ""}
                    {e.participantes ? ` · ${e.participantes} participantes` : ""}
                  </span>
                </span>
                <BadgeSituacao situacao={e.situacao} />
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
