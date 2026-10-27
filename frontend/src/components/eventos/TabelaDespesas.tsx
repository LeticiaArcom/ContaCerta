import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CampoGrade } from "@/components/ui/input";
import { CATEGORIAS_DESPESA, SITUACOES_DESPESA, UNIDADES_DESPESA } from "@/core/constantes";
import { lerNumero, moeda, numero } from "@/core/formato";
import type { Despesa } from "@/tipos/api";
import { novaDespesa, totalDespesa } from "./arquivos";

const seletor =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-1 text-sm text-verde-escuro hover:border-surface-border focus:border-verde-arcom focus:outline-none";

/** Campo numérico em formato brasileiro (1.234,56): confirma ao sair do campo. */
function CampoNumero({ valor, aoMudar, rotulo, moedaBR }: { valor: number | null; aoMudar: (v: number | null) => void; rotulo: string; moedaBR?: boolean }) {
  const exibido = valor === null ? "" : moedaBR ? moeda(valor) : numero(valor, 3);
  return (
    <CampoGrade
      key={exibido}
      aria-label={rotulo}
      inputMode="decimal"
      className="text-right"
      defaultValue={exibido}
      onBlur={(e) => {
        const n = lerNumero(e.target.value);
        const v = n !== null && n >= 0 ? n : null;
        if (v !== valor) aoMudar(v);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

export function TabelaDespesas({ despesas, aoMudar }: { despesas: Despesa[]; aoMudar: (d: Despesa[]) => void }) {
  const muda = (id: string, parcial: Partial<Despesa>) =>
    aoMudar(
      despesas.map((d) => {
        if (d.id !== id) return d;
        const nova = { ...d, ...parcial };
        // Total acompanha qtd × unitário; editado à mão, vale o que foi digitado.
        if (("qtd" in parcial || "valorUnitario" in parcial) && !("total" in parcial)) {
          nova.total = nova.qtd !== null && nova.valorUnitario !== null ? Math.round(nova.qtd * nova.valorUnitario * 100) / 100 : nova.total;
        }
        return nova;
      }),
    );

  return (
    <div>
      <div className="overflow-x-auto rounded-md border border-surface-border">
        <table className="w-full min-w-[1320px] text-sm">
          <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
            <tr>
              <th className="w-44 px-2 py-2">Categoria</th>
              <th className="min-w-[240px] px-2 py-2">Descrição</th>
              <th className="w-44 px-2 py-2">Fornecedor</th>
              <th className="w-24 px-2 py-2 text-right">Qtd</th>
              <th className="w-28 px-2 py-2">Unidade</th>
              <th className="w-36 px-2 py-2 text-right">Valor unitário</th>
              <th className="w-36 px-2 py-2 text-right">Valor total</th>
              <th className="w-36 px-2 py-2">Situação</th>
              <th className="w-24 px-2 py-2">OCS</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {despesas.map((d, i) => (
              <tr key={d.id} className="border-t border-surface-border odd:bg-white even:bg-surface">
                <td className="px-1 py-1">
                  <select aria-label={`Categoria da despesa ${i + 1}`} className={seletor} value={d.categoria} onChange={(e) => muda(d.id, { categoria: e.target.value })}>
                    <option value="">-</option>
                    {CATEGORIAS_DESPESA.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                    {d.categoria && !(CATEGORIAS_DESPESA as readonly string[]).includes(d.categoria) ? <option>{d.categoria}</option> : null}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <CampoGrade aria-label={`Descrição da despesa ${i + 1}`} value={d.nome} onChange={(e) => muda(d.id, { nome: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <CampoGrade aria-label={`Fornecedor da despesa ${i + 1}`} value={d.fornecedor} onChange={(e) => muda(d.id, { fornecedor: e.target.value })} />
                </td>
                <td className="px-1 py-1">
                  <CampoNumero rotulo={`Quantidade da despesa ${i + 1}`} valor={d.qtd} aoMudar={(v) => muda(d.id, { qtd: v })} />
                </td>
                <td className="px-1 py-1">
                  <select aria-label={`Unidade da despesa ${i + 1}`} className={seletor} value={d.unidade} onChange={(e) => muda(d.id, { unidade: e.target.value })}>
                    {UNIDADES_DESPESA.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                    {d.unidade && !(UNIDADES_DESPESA as readonly string[]).includes(d.unidade) ? <option>{d.unidade}</option> : null}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <CampoNumero moedaBR rotulo={`Valor unitário da despesa ${i + 1}`} valor={d.valorUnitario} aoMudar={(v) => muda(d.id, { valorUnitario: v })} />
                </td>
                <td className="px-1 py-1 font-semibold">
                  <CampoNumero moedaBR rotulo={`Valor total da despesa ${i + 1}`} valor={totalDespesa(d)} aoMudar={(v) => muda(d.id, { total: v })} />
                </td>
                <td className="px-1 py-1">
                  <select aria-label={`Situação da despesa ${i + 1}`} className={seletor} value={d.situacao} onChange={(e) => muda(d.id, { situacao: e.target.value as Despesa["situacao"] })}>
                    <option value="">-</option>
                    {SITUACOES_DESPESA.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </td>
                <td className="px-1 py-1">
                  <CampoGrade aria-label={`OCS da despesa ${i + 1}`} value={d.ocs} onChange={(e) => muda(d.id, { ocs: e.target.value })} />
                </td>
                <td className="px-1 text-center">
                  <button
                    type="button"
                    aria-label={`Remover despesa ${i + 1}`}
                    className="rounded-md p-1 text-arcom-gray hover:text-danger"
                    onClick={() => aoMudar(despesas.filter((x) => x.id !== d.id))}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
            {!despesas.length ? (
              <tr>
                <td colSpan={10} className="px-4 py-6 text-center text-arcom-gray">
                  Nenhuma despesa lançada. Adicione uma despesa ou use o modelo de treinamento.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <Button variante="ghost" className="mt-2 print:hidden" onClick={() => aoMudar([...despesas, novaDespesa()])}>
        <Plus /> Adicionar despesa
      </Button>
    </div>
  );
}

export { CampoNumero };
