// Ordem de compra (A4) de um fornecedor escolhido num orçamento aprovado de
// Compras de consumo. Abre em nova aba e chama a impressão do navegador pra
// salvar em PDF.
import { Printer } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { efetivada, formDeCotacao } from "@/components/cotacao/estado";
import { escolher } from "@/core/cotacao";
import { dataBR, hojeISO, moeda, numero } from "@/core/formato";
import { useCotacao } from "@/hooks/recursos";

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-arcom-gray">{rotulo}</p>
      <p className="text-sm font-medium text-verde-escuro">{valor || "-"}</p>
    </div>
  );
}

export default function OrdemCompra() {
  const { id = "", fornecedorId = "" } = useParams();
  const consulta = useCotacao(id);
  const form = consulta.data ? formDeCotacao(consulta.data) : null;
  const fornecedor = form?.conteudo.fornecedores.find((f) => f.id === fornecedorId);
  const escolhas = form ? escolher(form.modulo, form.conteudo).filter((e) => e.fornecedorId === fornecedorId) : [];
  const valida = !!form && form.modulo === "consumo" && efetivada(form) && !!fornecedor && escolhas.length > 0;

  useEffect(() => {
    if (!valida) return;
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, [valida]);

  if (consulta.isPending) return null;
  if (!form || !valida) {
    return (
      <main className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="max-w-md rounded-lg border border-surface-border bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-bold text-verde-escuro">Ordem de compra indisponível</h1>
          <p className="mt-2 text-sm text-arcom-gray">
            A ordem de compra só é gerada para orçamentos aprovados (APROVADO, PEDIDO EMITIDO ou CONCLUÍDO) e para um fornecedor escolhido no orçamento.
          </p>
        </div>
      </main>
    );
  }

  const itens = new Map(form.conteudo.itens.map((it, i) => [it.id, { it, n: i + 1 }]));
  const total = escolhas.reduce((s, e) => s + e.total, 0);
  const th = "border-b border-verde-escuro bg-verde-escuro px-2 py-1.5 text-left text-[10px] font-bold uppercase tracking-wider text-white";

  return (
    <main className="min-h-screen bg-surface py-6 print:bg-white print:py-0">
      <style>{"@page { size: A4 portrait; margin: 12mm; }"}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir / salvar PDF
        </Button>
      </div>
      <article className="mx-auto max-w-[210mm] bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-4 border-b-4 border-verde-lima pb-4">
          <img src="/logo-arcom.svg" alt="ARCOM" className="h-20 w-auto" />
          <div className="text-right">
            <p className="text-xs font-bold uppercase tracking-wider text-verde-arcom">Arcom S/A</p>
            <h1 className="text-2xl font-black text-verde-escuro">Ordem de compra</h1>
            <p className="text-sm font-semibold text-verde-escuro">OCS {form.ocs || "-"}</p>
            <p className="text-xs text-arcom-gray">Emitida em {dataBR(hojeISO())}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-4 rounded-md border border-surface-border p-4">
          <div className="col-span-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-arcom-gray">Fornecedor</p>
            <p className="text-lg font-bold text-verde-escuro">{fornecedor.nome}</p>
          </div>
          <Dado rotulo="Código" valor={fornecedor.codigo} />
          <Dado rotulo="CNPJ" valor={fornecedor.cnpj} />
          <Dado rotulo="Contato" valor={fornecedor.contato} />
          <Dado rotulo="Telefone" valor={fornecedor.telefone} />
          <Dado rotulo="E-mail" valor={fornecedor.email} />
          <Dado rotulo="Endereço" valor={fornecedor.endereco} />
        </section>

        <section className="mt-4 grid grid-cols-4 gap-4">
          <Dado rotulo="Departamento" valor={form.categoria} />
          <Dado rotulo="Solicitante" valor={form.solicitante} />
          <Dado rotulo="Centro de custo" valor={form.centroCusto} />
          <Dado rotulo="Compra" valor={form.titulo} />
        </section>

        <table className="mt-5 w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className={th}>Nº</th>
              <th className={th}>Código ARCOM</th>
              <th className={th}>Descrição</th>
              <th className={`${th} text-right`}>Qtd</th>
              <th className={th}>Un</th>
              <th className={th}>Entrega</th>
              <th className={`${th} text-right`}>Unitário</th>
              <th className={`${th} text-right`}>Total</th>
            </tr>
          </thead>
          <tbody>
            {escolhas.map((e) => {
              const x = itens.get(e.itemId);
              return (
                <tr key={e.itemId} className="border-b border-surface-border">
                  <td className="px-2 py-1.5">{x?.n}</td>
                  <td className="px-2 py-1.5">{x?.it.codigoArcom || "-"}</td>
                  <td className="px-2 py-1.5 font-medium text-verde-escuro">{x?.it.nome}</td>
                  <td className="px-2 py-1.5 text-right">{numero(e.quantidade, 3)}</td>
                  <td className="px-2 py-1.5">{x?.it.unidade}</td>
                  <td className="px-2 py-1.5">{dataBR(x?.it.entrega) || "-"}</td>
                  <td className="px-2 py-1.5 text-right">{moeda(e.precoUnitario)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{moeda(e.total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={7} className="px-2 py-2 text-right text-sm font-bold text-verde-escuro">
                Total
              </td>
              <td className="px-2 py-2 text-right text-sm font-black text-verde-arcom">{moeda(total)}</td>
            </tr>
          </tfoot>
        </table>

        <section className="mt-5 grid grid-cols-3 gap-4 rounded-md bg-surface p-4">
          <Dado rotulo="Condição de pagamento" valor={fornecedor.pagamento} />
          <Dado rotulo="Prazo de entrega" valor={fornecedor.entrega} />
          <Dado rotulo="Frete" valor={fornecedor.frete} />
          <div className="col-span-3">
            <Dado rotulo="Observações" valor={[fornecedor.observacoes, form.descricao].filter(Boolean).join(" · ")} />
          </div>
        </section>

        <footer className="mt-10 grid grid-cols-2 gap-10 text-center text-xs text-arcom-gray">
          <div className="border-t border-arcom-gray pt-2">Compras · Arcom S/A</div>
          <div className="border-t border-arcom-gray pt-2">Aprovação</div>
        </footer>
      </article>
    </main>
  );
}
