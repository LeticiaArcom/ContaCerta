// Grade editável da cotação: itens nas linhas, um preço por fornecedor nas
// colunas. Menor preço (ou escolha manual) destacado em verde; clicar no
// marcador de um preço escolhe aquele fornecedor manualmente.
import { CircleCheck, Circle, CopyPlus, Pencil, Plus, Trash2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoGrade } from "@/components/ui/input";
import { cn } from "@/core/cn";
import { UNIDADES } from "@/core/constantes";
import { chaveProduto, escolher, grupos, idsAlternativos, menorPrecoItem, novoItem, preco } from "@/core/cotacao";
import { dataBR, diferencaPercentual, moeda, percentual } from "@/core/formato";
import { confirmar, pedirTexto } from "@/core/janelas";
import { adicionarFornecedor } from "./acoes";
import type { ConteudoCotacao, FornecedorCotacao, HistoricoCusto, ItemCotacao, Modulo } from "@/tipos/api";
import { CampoNumero } from "./CampoNumero";

type Props = {
  modulo: Modulo;
  conteudo: ConteudoCotacao;
  aoMudar: (fn: (c: ConteudoCotacao) => ConteudoCotacao) => void;
  /** Estoque/Almoxarifado: código ARCOM, consumo, estoque e histórico de custo. */
  estoque?: boolean;
  /** Quantidades alternativas: mostra o botão de faixa em cada linha. */
  alternativas?: boolean;
  historico?: HistoricoCusto[];
  somenteLeitura?: boolean;
};

function TendenciaCusto({ atual, anterior }: { atual: number; anterior: number }) {
  if (!atual || !anterior) return null;
  const dif = diferencaPercentual(atual, anterior);
  if (Math.abs(dif) < 0.5)
    return (
      <span className="inline-flex items-center gap-0.5 text-arcom-gray" title="Estável em relação à última compra">
        <Minus className="size-3" /> estável
      </span>
    );
  return dif > 0 ? (
    <span className="inline-flex items-center gap-0.5 font-semibold text-danger" title="Aumento em relação à última compra">
      <TrendingUp className="size-3" /> +{percentual(dif)}
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 font-semibold text-verde-arcom" title="Redução em relação à última compra">
      <TrendingDown className="size-3" /> {percentual(dif)}
    </span>
  );
}

export function GradeCotacao({ modulo, conteudo, aoMudar, estoque, alternativas, historico = [], somenteLeitura }: Props) {
  const c = conteudo;
  const escolhas = escolher(modulo, c);
  const escolhaPorItem = new Map(escolhas.map((e) => [e.itemId, e]));
  // Em alternativas a escolha é do grupo; marca o grupo inteiro
  const escolhaDoGrupo = new Map<string, (typeof escolhas)[number]>();
  for (const g of grupos(modulo, c.itens)) {
    const e = g.map((it) => escolhaPorItem.get(it.id)).find(Boolean);
    if (e) g.forEach((it) => escolhaDoGrupo.set(it.id, e));
  }
  const alternativos = idsAlternativos(modulo, c.itens);
  const ultimoCusto = new Map<string, HistoricoCusto>();
  for (const h of historico) if (h.precoUnitario && !ultimoCusto.has(h.codigoArcom)) ultimoCusto.set(h.codigoArcom, h);
  const nomePorCodigo = new Map<string, HistoricoCusto>();
  for (const h of historico) if (!nomePorCodigo.has(h.codigoArcom)) nomePorCodigo.set(h.codigoArcom, h);

  const mudarItem = (id: string, parcial: Partial<ItemCotacao>) =>
    aoMudar((x) => ({ ...x, itens: x.itens.map((it) => (it.id === id ? { ...it, ...parcial } : it)) }));

  const mudarPreco = (id: string, fid: string, v: number | null) =>
    aoMudar((x) => ({ ...x, itens: x.itens.map((it) => (it.id === id ? { ...it, precos: { ...it.precos, [fid]: v } } : it)) }));

  const alternarEscolha = (it: ItemCotacao, fid: string) =>
    aoMudar((x) => {
      const grupo = grupos(modulo, x.itens).find((g) => g.some((i) => i.id === it.id)) ?? [it];
      const idsGrupo = new Set(grupo.map((i) => i.id));
      const jaManual = it.selecionado === fid;
      return {
        ...x,
        itens: x.itens.map((i) => {
          if (!idsGrupo.has(i.id)) return i;
          if (i.id === it.id) return { ...i, selecionado: jaManual ? "" : fid };
          return { ...i, selecionado: "" };
        }),
      };
    });

  const removerItem = (id: string) =>
    aoMudar((x) => {
      const itens = x.itens.filter((it) => it.id !== id);
      return { ...x, itens: itens.length ? itens : [novoItem()] };
    });

  const adicionarFaixa = (it: ItemCotacao) =>
    aoMudar((x) => {
      const idx = x.itens.findIndex((i) => i.id === it.id);
      // vai pro fim do grupo do mesmo produto
      let fim = idx;
      while (fim + 1 < x.itens.length && chaveProduto(x.itens[fim + 1]?.nome ?? "") === chaveProduto(it.nome)) fim++;
      const nova = novoItem({ nome: it.nome, codigoArcom: it.codigoArcom, unidade: it.unidade, entrega: it.entrega });
      const itens = [...x.itens];
      itens.splice(fim + 1, 0, nova);
      return { ...x, itens };
    });

  const renomear = async (f: FornecedorCotacao) => {
    const nome = await pedirTexto({ titulo: "Renomear fornecedor", rotulo: "Nome do fornecedor", valorInicial: f.nome, confirmar: "Salvar" });
    if (!nome) return;
    aoMudar((x) => ({ ...x, fornecedores: x.fornecedores.map((y) => (y.id === f.id ? { ...y, nome: nome.toUpperCase() } : y)) }));
  };

  const remover = async (f: FornecedorCotacao) => {
    const comPreco = c.itens.filter((it) => preco(it.precos[f.id])).length;
    const ok = await confirmar({
      titulo: `Excluir o fornecedor ${f.nome}?`,
      mensagem: comPreco
        ? `Esta coluna tem ${comPreco} preço(s) preenchido(s). Os preços dela também serão apagados desta cotação. O histórico já salvo não muda até você salvar.`
        : "A coluna será retirada desta cotação.",
      confirmar: "Excluir fornecedor",
      perigo: true,
    });
    if (!ok) return;
    aoMudar((x) => {
      const pedidos = { ...x.pedidos };
      delete pedidos[f.id];
      return {
        fornecedores: x.fornecedores.filter((y) => y.id !== f.id),
        itens: x.itens.map((it) => {
          const precos = { ...it.precos };
          delete precos[f.id];
          return { ...it, precos, selecionado: it.selecionado === f.id ? "" : it.selecionado };
        }),
        pedidos,
      };
    });
  };

  const th = "border-b border-verde-escuro bg-verde-escuro px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-white";

  return (
    <div className="overflow-x-auto rounded-md border border-surface-border bg-white">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr>
            <th className={cn(th, "w-10 text-center")}>Nº</th>
            {estoque ? <th className={cn(th, "w-28")}>Código ARCOM</th> : null}
            <th className={cn(th, "min-w-48")}>Item</th>
            <th className={cn(th, "w-36")}>Entregar até</th>
            <th className={cn(th, "w-36")}>Qtd</th>
            {estoque ? (
              <>
                <th className={cn(th, "w-24 text-right")}>Consumo mensal</th>
                <th className={cn(th, "w-24 text-right")}>Estoque atual</th>
              </>
            ) : null}
            {c.fornecedores.map((f) => (
              <th key={f.id} className={cn(th, "min-w-36")}>
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate" title={f.nome}>
                    {f.nome || "Fornecedor"}
                  </span>
                  {somenteLeitura ? null : (
                    <span className="flex shrink-0 gap-0.5 print:hidden">
                      <button type="button" className="rounded p-0.5 text-white/70 hover:text-verde-lima" title="Renomear" onClick={() => void renomear(f)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button type="button" className="rounded p-0.5 text-white/70 hover:text-verde-lima" title="Excluir fornecedor" onClick={() => void remover(f)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </th>
            ))}
            <th className={cn(th, "w-32 text-right")}>Total escolhido</th>
            {estoque ? <th className={cn(th, "w-44")}>Histórico de custo</th> : null}
            {somenteLeitura ? null : <th className={cn(th, "w-16 print:hidden")} aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {c.itens.map((it, idx) => {
            const e = escolhaDoGrupo.get(it.id);
            const escolhaDaLinha = e && e.itemId === it.id ? e : undefined;
            const menor = menorPrecoItem(it, c.fornecedores);
            const alt = alternativos.has(it.id);
            const ult = ultimoCusto.get(it.codigoArcom.trim());
            return (
              <tr key={it.id} className={cn("border-b border-surface-border align-middle", idx % 2 ? "bg-surface/60" : "bg-white")}>
                <td className="px-2 text-center text-xs font-semibold text-arcom-gray">{idx + 1}</td>
                {estoque ? (
                  <td className="px-1">
                    <CampoGrade
                      aria-label="Código ARCOM"
                      value={it.codigoArcom}
                      readOnly={somenteLeitura}
                      onChange={(ev) => {
                        const codigo = ev.target.value;
                        const conhecido = nomePorCodigo.get(codigo.trim());
                        mudarItem(it.id, {
                          codigoArcom: codigo,
                          ...(conhecido && !it.nome.trim() ? { nome: conhecido.item, unidade: conhecido.unidade || it.unidade } : {}),
                        });
                      }}
                    />
                  </td>
                ) : null}
                <td className="px-1">
                  <div className="flex items-center gap-1">
                    <CampoGrade aria-label="Item" placeholder="Descrição do item" value={it.nome} readOnly={somenteLeitura} onChange={(ev) => mudarItem(it.id, { nome: ev.target.value })} />
                    {alt ? <span className="shrink-0 rounded-full bg-verde-lima/40 px-1.5 text-[10px] font-bold uppercase text-verde-escuro">opção</span> : null}
                  </div>
                </td>
                <td className="px-1">
                  {somenteLeitura ? (
                    <span className="px-2">{dataBR(it.entrega)}</span>
                  ) : (
                    <CampoGrade type="date" aria-label="Entregar até" value={it.entrega} onChange={(ev) => mudarItem(it.id, { entrega: ev.target.value })} />
                  )}
                </td>
                <td className="px-1">
                  <div className="flex items-center gap-1">
                    <CampoNumero aria-label="Quantidade" className="text-right" casas={3} valor={it.qtd} readOnly={somenteLeitura} aoMudar={(v) => mudarItem(it.id, { qtd: v })} />
                    <select
                      aria-label="Unidade"
                      disabled={somenteLeitura}
                      className="h-8 rounded-md border border-transparent bg-transparent text-xs text-verde-escuro hover:border-surface-border focus:border-verde-arcom focus:outline-none"
                      value={it.unidade}
                      onChange={(ev) => mudarItem(it.id, { unidade: ev.target.value })}
                    >
                      {UNIDADES.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
                {estoque ? (
                  <>
                    <td className="px-1">
                      <CampoNumero aria-label="Consumo mensal" className="text-right" casas={3} valor={it.consumoMensal} readOnly={somenteLeitura} aoMudar={(v) => mudarItem(it.id, { consumoMensal: v })} />
                    </td>
                    <td className="px-1">
                      <CampoNumero aria-label="Estoque atual" className="text-right" casas={3} valor={it.estoqueAtual} readOnly={somenteLeitura} aoMudar={(v) => mudarItem(it.id, { estoqueAtual: v })} />
                    </td>
                  </>
                ) : null}
                {c.fornecedores.map((f) => {
                  const p = preco(it.precos[f.id]);
                  const escolhido = escolhaDaLinha?.fornecedorId === f.id;
                  const manual = escolhido && it.selecionado === f.id;
                  const dica = p
                    ? [
                        `Total: ${moeda(p * preco(it.qtd))}`,
                        menor && p > menor ? `${percentual(diferencaPercentual(p, menor))} acima do menor preço` : "Menor preço do item",
                        manual ? "Escolhido manualmente" : escolhido ? "Escolhido automaticamente (menor preço)" : "",
                      ]
                        .filter(Boolean)
                        .join(" · ")
                    : undefined;
                  return (
                    <td key={f.id} className="px-1" title={dica}>
                      <div className={cn("flex items-center gap-0.5 rounded-md", escolhido && "bg-verde-lima/40")}>
                        <CampoNumero
                          aria-label={`Preço ${f.nome}`}
                          className={cn("text-right", escolhido && "font-bold text-verde-arcom")}
                          valor={it.precos[f.id] ?? null}
                          readOnly={somenteLeitura}
                          aoMudar={(v) => mudarPreco(it.id, f.id, v)}
                        />
                        {p && !somenteLeitura ? (
                          <button
                            type="button"
                            aria-label={manual ? `Voltar ao menor preço (${f.nome})` : `Escolher ${f.nome}`}
                            title={manual ? "Escolha manual. Clique para voltar ao menor preço." : "Escolher este fornecedor"}
                            onClick={() => alternarEscolha(it, f.id)}
                            className={cn("shrink-0 rounded p-0.5 print:hidden", escolhido ? "text-verde-arcom" : "text-arcom-gray/50 hover:text-verde-arcom")}
                          >
                            {escolhido ? <CircleCheck className={cn("size-4", manual && "fill-verde-lima")} /> : <Circle className="size-4" />}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
                <td className="px-2 text-right font-semibold text-verde-escuro">
                  {escolhaDaLinha ? moeda(escolhaDaLinha.total) : alt && e ? <span className="text-xs font-normal text-arcom-gray">outra opção</span> : ""}
                </td>
                {estoque ? (
                  <td className="px-2 text-xs leading-tight text-arcom-gray">
                    {ult ? (
                      <div>
                        <p>
                          <span className="font-semibold text-verde-escuro">{moeda(ult.precoUnitario)}</span> · {ult.fornecedor}
                        </p>
                        <p>
                          {dataBR(ult.data)} · {ult.quantidade}
                          {ult.unidade}{" "}
                          {escolhaDaLinha ? <TendenciaCusto atual={escolhaDaLinha.precoUnitario} anterior={ult.precoUnitario} /> : null}
                        </p>
                      </div>
                    ) : it.codigoArcom.trim() ? (
                      "Sem compra anterior"
                    ) : (
                      ""
                    )}
                  </td>
                ) : null}
                {somenteLeitura ? null : (
                  <td className="px-1 print:hidden">
                    <div className="flex justify-end gap-0.5">
                      {alternativas ? (
                        <button type="button" className="rounded p-1 text-arcom-gray hover:text-verde-arcom" title="Adicionar faixa de quantidade" onClick={() => adicionarFaixa(it)}>
                          <CopyPlus className="size-4" />
                        </button>
                      ) : null}
                      <button type="button" className="rounded p-1 text-arcom-gray hover:text-danger" title="Excluir linha" onClick={() => removerItem(it.id)}>
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {somenteLeitura ? null : (
        <div className="flex flex-wrap gap-2 border-t border-surface-border p-2 print:hidden">
          <Button variante="ghost" tamanho="sm" onClick={() => aoMudar((x) => ({ ...x, itens: [...x.itens, novoItem({ unidade: x.itens[x.itens.length - 1]?.unidade ?? "un" })] }))}>
            <Plus /> Adicionar item
          </Button>
          {alternativas ? (
            <Button
              variante="ghost"
              tamanho="sm"
              onClick={() => {
                const ultimo = c.itens[c.itens.length - 1];
                if (ultimo) adicionarFaixa(ultimo);
              }}
            >
              <CopyPlus /> Adicionar faixa de quantidade
            </Button>
          ) : null}
          <Button variante="ghost" tamanho="sm" onClick={() => void adicionarFornecedor(aoMudar)}>
            <Plus /> Adicionar fornecedor
          </Button>
        </div>
      )}
    </div>
  );
}
