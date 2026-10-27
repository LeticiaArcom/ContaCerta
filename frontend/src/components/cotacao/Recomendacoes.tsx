// Cartões de recomendação abaixo da grade (a faixa de total geral foi
// retirada; a comparação fica por item e os consolidados ficam aqui).
import { Indicador } from "@/components/ui/card";
import { economiaPotencial, escolher, idsAlternativos, itensComPreco, porFornecedor, totaisCompletos, totalEscolhido } from "@/core/cotacao";
import { moeda, quantidade } from "@/core/formato";
import type { ConteudoCotacao, Modulo } from "@/tipos/api";

export function Recomendacoes({ modulo, conteudo }: { modulo: Modulo; conteudo: ConteudoCotacao }) {
  const escolhas = escolher(modulo, conteudo);
  const total = totalEscolhido(escolhas);
  const alternativas = idsAlternativos(modulo, conteudo.itens).size > 0;
  const completos = totaisCompletos(modulo, conteudo);
  const melhorCompleto = completos[0];
  const distribuicao = porFornecedor(conteudo, escolhas);
  const itens = new Map(conteudo.itens.map((it) => [it.id, it]));
  const comQtd = conteudo.itens.filter((it) => it.qtd).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Indicador rotulo="Melhor combinação" valor={moeda(total) || "R$ 0,00"} detalhe={alternativas ? "Uma opção por produto (faixas não somam)" : "Menor preço ou escolha manual por item"} />
        <Indicador
          rotulo="Melhor fornecedor completo"
          valor={melhorCompleto ? moeda(melhorCompleto.total) : "-"}
          detalhe={melhorCompleto ? melhorCompleto.fornecedor.nome : alternativas ? "Não se aplica a quantidades alternativas" : "Nenhum fornecedor cotou todos os itens"}
        />
        <Indicador
          rotulo="Economia ao dividir"
          valor={melhorCompleto && melhorCompleto.total > total ? moeda(melhorCompleto.total - total) : moeda(economiaPotencial(modulo, conteudo)) || "R$ 0,00"}
          detalhe={melhorCompleto && melhorCompleto.total > total ? "Contra o melhor fornecedor completo" : "Diferença entre maior e menor preço"}
        />
        <Indicador rotulo="Itens com preço" valor={`${itensComPreco(conteudo)} de ${comQtd}`} detalhe="Frete não entra no cálculo" />
      </div>
      {distribuicao.length ? (
        <div className="overflow-x-auto rounded-md border border-surface-border bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface text-left text-[11px] font-bold uppercase tracking-wider text-arcom-gray">
                <th className="px-3 py-2">Distribuição recomendada</th>
                <th className="px-3 py-2">Itens</th>
                {alternativas ? <th className="px-3 py-2">Opção escolhida</th> : null}
                <th className="px-3 py-2">Pagamento</th>
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {distribuicao.map((d) => (
                <tr key={d.fornecedor.id} className="border-t border-surface-border">
                  <td className="px-3 py-2 font-semibold text-verde-escuro">{d.fornecedor.nome}</td>
                  <td className="px-3 py-2">{d.itens}</td>
                  {alternativas ? (
                    <td className="px-3 py-2 text-xs">
                      {d.escolhas.map((e) => {
                        const it = itens.get(e.itemId);
                        return (
                          <p key={e.itemId}>
                            {it?.nome}: {quantidade(e.quantidade, it?.unidade ?? "")} × {moeda(e.precoUnitario)}
                          </p>
                        );
                      })}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">{d.fornecedor.pagamento || "-"}</td>
                  <td className="px-3 py-2 text-right font-bold text-verde-arcom">{moeda(d.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {completos.length > 1 ? (
        <p className="text-xs text-arcom-gray">
          Totais de quem cotou todos os itens: {completos.map((c) => `${c.fornecedor.nome} ${moeda(c.total)}`).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}
