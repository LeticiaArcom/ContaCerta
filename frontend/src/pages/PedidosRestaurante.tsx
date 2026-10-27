import { CalendarClock, ChevronDown, ChevronRight, ClipboardPaste, Eye, FilePlus2, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ColarLista } from "@/components/cadastros/ColarLista";
import { TituloTela } from "@/components/Layout";
import { BadgeSituacao } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Campo, CampoGrade, Input, Select } from "@/components/ui/input";
import { cn } from "@/core/cn";
import { CATEGORIAS_HORTIFRUTI, UNIDADES } from "@/core/constantes";
import { dataBR, dataHoraBR, lerNumero, novoId, quantidade } from "@/core/formato";
import { confirmar } from "@/core/janelas";
import { useSessao } from "@/core/sessao";
import { notificar } from "@/core/toast";
import { useRascunho } from "@/hooks/rascunho";
import { useExcluirPedido, usePedidos, useSalvarPedido } from "@/hooks/recursos";
import type { ItemPedido, PedidoRestaurante } from "@/tipos/api";

type FormPedido = {
  id?: string;
  versao: number;
  categoria: string;
  periodo: string;
  observacao: string;
  itens: ItemPedido[];
  situacao?: string;
};

const itemVazio = (): ItemPedido => ({ id: novoId(), nome: "", qtd: null, unidade: "kg", entrega: "", observacao: "" });
const formVazio = (): FormPedido => ({ versao: 0, categoria: "Carnes", periodo: "", observacao: "", itens: [itemVazio()] });
const temConteudo = (f: FormPedido) => !!(f.periodo || f.observacao || f.itens.some((i) => i.nome.trim() || i.qtd));

function LembreteSexta() {
  return (
    <div className="mb-5 flex items-center gap-3 rounded-md border border-surface-border border-l-4 border-l-verde-lima bg-white px-4 py-3 text-sm shadow-sm">
      <CalendarClock className="size-5 shrink-0 text-verde-arcom" />
      <p className="text-verde-escuro">
        A cotação de carnes, frutas e verduras é feita <strong>toda sexta-feira</strong>. Envie o pedido da semana seguinte até lá.
      </p>
    </div>
  );
}

// ---------- Papel restaurante: preenche e envia ----------

function FormularioPedido({ form, setForm, aoNovo }: { form: FormPedido; setForm: (f: FormPedido) => void; aoNovo: () => void }) {
  const salvar = useSalvarPedido();
  const excluir = useExcluirPedido();
  const [colando, setColando] = useState(false);
  const bloqueado = form.situacao === "EM COTAÇÃO";
  const rascunho = useRascunho("pedido-restaurante", form, { ativo: !form.id && temConteudo(form) });
  const restaurado = useRef(false);

  // Abre com o rascunho salvo, se o formulário de novo pedido ainda estiver vazio.
  useEffect(() => {
    if (restaurado.current || rascunho.carregando) return;
    restaurado.current = true;
    const r = rascunho.inicial;
    if (r && !form.id && !temConteudo(form) && Array.isArray(r.itens)) {
      setForm({ ...formVazio(), ...r, id: undefined, versao: 0 });
      rascunho.marcarSalvo();
      notificar.info("Rascunho do pedido recuperado.");
    }
  }, [rascunho, form, setForm]);

  const mudaItem = (id: string, parcial: Partial<ItemPedido>) =>
    setForm({ ...form, itens: form.itens.map((i) => (i.id === id ? { ...i, ...parcial } : i)) });

  function enviar(enviarCompras: boolean) {
    const itens = form.itens.filter((i) => i.nome.trim());
    if (!itens.length) {
      notificar.aviso("Inclua pelo menos um item com nome.");
      return;
    }
    salvar.mutate(
      {
        id: form.id,
        dados: { categoria: form.categoria, periodo: form.periodo, observacao: form.observacao, itens, enviar: enviarCompras, versao: form.versao },
      },
      {
        onSuccess: (p) => {
          void rascunho.limpar();
          if (enviarCompras) {
            notificar.sucesso("Pedido enviado para Compras.");
            aoNovo();
          } else {
            notificar.sucesso("Pedido salvo.");
            setForm(paraForm(p));
          }
        },
      },
    );
  }

  async function aoExcluir() {
    if (!form.id) return;
    const ok = await confirmar({ titulo: "Excluir pedido?", mensagem: "O pedido e seus itens serão removidos.", confirmar: "Excluir", perigo: true });
    if (ok) excluir.mutate(form.id, { onSuccess: () => { notificar.sucesso("Pedido excluído."); aoNovo(); } });
  }

  return (
    <Card>
      <CardHeader
        titulo={form.id ? "Pedido" : "Novo pedido"}
        descricao={
          bloqueado
            ? "Este pedido já virou cotação e não pode mais ser alterado."
            : rascunho.salvoAs
              ? `Rascunho salvo automaticamente às ${rascunho.salvoAs}.`
              : "Preencha os itens, quantidades e a data de entrega."
        }
        acoes={
          !bloqueado ? (
            <Button variante="secondary" tamanho="sm" onClick={() => setColando(true)}>
              <ClipboardPaste /> Colar lista
            </Button>
          ) : null
        }
      />
      <CardBody className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Categoria" htmlFor="p-cat">
            <Select id="p-cat" disabled={bloqueado} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
              {CATEGORIAS_HORTIFRUTI.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Campo>
          <Campo rotulo="Período" htmlFor="p-periodo">
            <Input id="p-periodo" disabled={bloqueado} placeholder="02/11 a 07/11" value={form.periodo} onChange={(e) => setForm({ ...form, periodo: e.target.value })} />
          </Campo>
          <Campo rotulo="Observação" htmlFor="p-obs">
            <Input id="p-obs" disabled={bloqueado} value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} />
          </Campo>
        </div>

        <div className="overflow-x-auto rounded-md border border-surface-border">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
              <tr>
                <th className="w-10 px-2 py-2 text-center">Nº</th>
                <th className="px-2 py-2">Item</th>
                <th className="w-28 px-2 py-2">Quantidade</th>
                <th className="w-24 px-2 py-2">Unidade</th>
                <th className="w-40 px-2 py-2">Entregar até</th>
                <th className="px-2 py-2">Observação</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {form.itens.map((it, i) => (
                <tr key={it.id} className="border-t border-surface-border">
                  <td className="px-2 text-center text-xs text-arcom-gray">{i + 1}</td>
                  <td className="px-1 py-1">
                    <CampoGrade aria-label={`Item ${i + 1}`} disabled={bloqueado} value={it.nome} onChange={(e) => mudaItem(it.id, { nome: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <CampoGrade
                      aria-label={`Quantidade do item ${i + 1}`}
                      inputMode="decimal"
                      disabled={bloqueado}
                      defaultValue={it.qtd ?? ""}
                      key={`${it.id}-${it.qtd ?? ""}`}
                      onBlur={(e) => mudaItem(it.id, { qtd: lerNumero(e.target.value) })}
                    />
                  </td>
                  <td className="px-1 py-1">
                    <select
                      aria-label={`Unidade do item ${i + 1}`}
                      disabled={bloqueado}
                      className="h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-sm text-verde-escuro hover:border-surface-border focus:border-verde-arcom focus:outline-none"
                      value={it.unidade}
                      onChange={(e) => mudaItem(it.id, { unidade: e.target.value })}
                    >
                      {UNIDADES.map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-1 py-1">
                    <CampoGrade type="date" aria-label={`Entrega do item ${i + 1}`} disabled={bloqueado} value={it.entrega} onChange={(e) => mudaItem(it.id, { entrega: e.target.value })} />
                  </td>
                  <td className="px-1 py-1">
                    <CampoGrade aria-label={`Observação do item ${i + 1}`} disabled={bloqueado} value={it.observacao} onChange={(e) => mudaItem(it.id, { observacao: e.target.value })} />
                  </td>
                  <td className="px-1 text-center">
                    {!bloqueado ? (
                      <button
                        type="button"
                        aria-label={`Remover item ${i + 1}`}
                        className="rounded-md p-1 text-arcom-gray hover:text-danger"
                        onClick={() => setForm({ ...form, itens: form.itens.length > 1 ? form.itens.filter((x) => x.id !== it.id) : [itemVazio()] })}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!bloqueado ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variante="ghost" onClick={() => setForm({ ...form, itens: [...form.itens, itemVazio()] })}>
              <Plus /> Adicionar item
            </Button>
            <div className="flex flex-wrap gap-2">
              {form.id ? (
                <Button variante="ghost" onClick={() => void aoExcluir()}>
                  <Trash2 className="text-danger" /> Excluir
                </Button>
              ) : null}
              {form.situacao !== "ENVIADO" ? (
                <Button variante="secondary" disabled={salvar.isPending} onClick={() => enviar(false)}>
                  Salvar rascunho
                </Button>
              ) : null}
              <Button disabled={salvar.isPending} onClick={() => enviar(true)}>
                <Send /> {form.situacao === "ENVIADO" ? "Salvar alterações" : "Enviar para Compras"}
              </Button>
            </div>
          </div>
        ) : null}
      </CardBody>
      {colando ? (
        <ColarLista
          aoFechar={() => setColando(false)}
          aoConfirmar={(l, substituir) => {
            const novos = l.itens.map((i) => ({ id: novoId(), nome: i.nome, qtd: i.qtd, unidade: i.unidade, entrega: i.entrega, observacao: "" }));
            const atuais = substituir ? [] : form.itens.filter((i) => i.nome.trim() || i.qtd);
            setForm({ ...form, periodo: form.periodo || l.periodo, itens: [...atuais, ...novos] });
            setColando(false);
            notificar.sucesso(`${novos.length} itens incluídos.`);
          }}
        />
      ) : null}
    </Card>
  );
}

function paraForm(p: PedidoRestaurante): FormPedido {
  return {
    id: p.id,
    versao: p.versao,
    categoria: p.categoria,
    periodo: p.periodo,
    observacao: p.observacao,
    itens: p.itens.length ? p.itens.map((i) => ({ ...i, observacao: i.observacao ?? "" })) : [itemVazio()],
    situacao: p.situacao,
  };
}

function VisaoRestaurante() {
  const pedidos = usePedidos({ porPagina: 50 });
  const [form, setForm] = useState<FormPedido>(formVazio);

  return (
    <div>
      <TituloTela
        titulo="Pedido do restaurante"
        descricao="Preencha o pedido de carnes, frutas e verduras da semana. A área de Compras recebe e faz a cotação com os fornecedores."
        acoes={
          <Button variante="secondary" onClick={() => setForm(formVazio())}>
            <FilePlus2 /> Novo pedido
          </Button>
        }
      />
      <LembreteSexta />
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader titulo="Meus pedidos" />
          <ul className="max-h-[70vh] overflow-y-auto">
            {pedidos.data?.itens.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setForm(paraForm(p))}
                  className={cn(
                    "w-full border-b border-l-[3px] border-surface-border px-4 py-3 text-left transition duration-fast hover:bg-surface",
                    form.id === p.id ? "border-l-verde-lima bg-surface" : "border-l-transparent",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-verde-escuro">{p.categoria}</span>
                    <BadgeSituacao situacao={p.situacao} />
                  </div>
                  <p className="text-xs text-arcom-gray">
                    {p.periodo || "Sem período"} · {p.itens.length} itens · {dataHoraBR(p.criadoEm)}
                  </p>
                </button>
              </li>
            ))}
            {pedidos.data && !pedidos.data.itens.length ? <li className="px-4 py-6 text-sm text-arcom-gray">Nenhum pedido ainda.</li> : null}
          </ul>
        </Card>
        <FormularioPedido key={form.id ?? "novo"} form={form} setForm={setForm} aoNovo={() => setForm(formVazio())} />
      </div>
    </div>
  );
}

// ---------- Papel compras: recebe e transforma em cotação ----------

function VisaoCompras() {
  const [situacao, setSituacao] = useState("ENVIADO");
  const pedidos = usePedidos({ situacao, porPagina: 50 });
  const [aberto, setAberto] = useState<string | null>(null);

  return (
    <div>
      <TituloTela
        titulo="Pedidos do restaurante"
        descricao="Pedidos enviados pelo time do restaurante. Gere a cotação a partir do pedido: os itens, quantidades e datas de entrega já entram preenchidos."
      />
      <LembreteSexta />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-border p-4">
          <label htmlFor="filtro-sit" className="text-xs font-bold uppercase tracking-wider text-arcom-gray">
            Situação
          </label>
          <Select id="filtro-sit" className="w-56" value={situacao} onChange={(e) => setSituacao(e.target.value)}>
            <option value="ENVIADO">Aguardando cotação</option>
            <option value="EM COTAÇÃO">Já em cotação</option>
            <option value="">Todos</option>
          </Select>
        </div>
        <ul>
          {pedidos.data?.itens.map((p) => (
            <li key={p.id} className="border-b border-surface-border last:border-0">
              <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-3 text-left"
                  onClick={() => setAberto(aberto === p.id ? null : p.id)}
                  aria-expanded={aberto === p.id}
                >
                  {aberto === p.id ? <ChevronDown className="size-4 text-arcom-gray" /> : <ChevronRight className="size-4 text-arcom-gray" />}
                  <div className="min-w-0">
                    <p className="font-semibold text-verde-escuro">
                      {p.categoria} {p.periodo ? `· ${p.periodo}` : ""}
                    </p>
                    <p className="text-xs text-arcom-gray">
                      Enviado por {p.criadoPorNome} em {dataHoraBR(p.atualizadoEm)} · {p.itens.length} itens
                    </p>
                  </div>
                </button>
                <BadgeSituacao situacao={p.situacao} />
                {p.cotacaoId ? (
                  <Button asChild variante="secondary" tamanho="sm">
                    <Link to={`/cotacao-carnes?cotacao=${p.cotacaoId}`}>
                      <Eye /> Ver cotação
                    </Link>
                  </Button>
                ) : (
                  <Button asChild tamanho="sm">
                    <Link to={`/cotacao-carnes?pedido=${p.id}`}>
                      <FilePlus2 /> Gerar cotação
                    </Link>
                  </Button>
                )}
              </div>
              {aberto === p.id ? (
                <div className="px-4 pb-4">
                  {p.observacao ? <p className="mb-2 text-sm text-verde-escuro">Observação: {p.observacao}</p> : null}
                  <table className="w-full text-sm">
                    <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
                      <tr>
                        <th className="px-3 py-1.5">Item</th>
                        <th className="px-3 py-1.5">Quantidade</th>
                        <th className="px-3 py-1.5">Entregar até</th>
                        <th className="px-3 py-1.5">Observação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.itens.map((it) => (
                        <tr key={it.id} className="border-t border-surface-border odd:bg-white even:bg-surface">
                          <td className="px-3 py-1.5 font-medium text-verde-escuro">{it.nome}</td>
                          <td className="px-3 py-1.5">{quantidade(it.qtd, it.unidade) || "-"}</td>
                          <td className="px-3 py-1.5">{dataBR(it.entrega) || "-"}</td>
                          <td className="px-3 py-1.5">{it.observacao || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </li>
          ))}
          {pedidos.data && !pedidos.data.itens.length ? (
            <li className="px-4 py-8 text-center text-sm text-arcom-gray">Nenhum pedido nesta situação.</li>
          ) : null}
        </ul>
      </Card>
    </div>
  );
}

export default function PedidosRestaurante() {
  const { usuario } = useSessao();
  return usuario?.papel === "compras" ? <VisaoCompras /> : <VisaoRestaurante />;
}

