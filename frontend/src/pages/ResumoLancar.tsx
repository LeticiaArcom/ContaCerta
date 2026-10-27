import { Eraser, FileText } from "lucide-react";
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { TituloTela } from "@/components/Layout";
import { FormularioCompra } from "@/components/resumo/FormularioCompra";
import { paraEntrada, temConteudo, valoresVazios, type ValoresCompra } from "@/components/resumo/compraForm";
import { separar } from "@/components/resumo/relatorioDiario";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { dataBR, dataHoraBR, moeda } from "@/core/formato";
import { notificar } from "@/core/toast";
import { useRascunho } from "@/hooks/rascunho";
import { useSalvarCompra, useTodasCompras } from "@/hooks/recursos";

function restaurar(r: unknown): ValoresCompra {
  const base = valoresVazios();
  if (!r || typeof r !== "object") return base;
  const out = { ...base };
  for (const k of Object.keys(base) as (keyof ValoresCompra)[]) {
    const v = (r as Record<string, unknown>)[k];
    if (typeof v === "string") (out as Record<string, string>)[k] = v;
  }
  if (out.tipo !== "compra" && out.tipo !== "orcamento") out.tipo = "compra";
  if (out.provisionado !== "SIM") out.provisionado = "PENDENTE";
  return out;
}

export default function ResumoLancar() {
  const salvar = useSalvarCompra();
  const [valores, setValores] = useState<ValoresCompra>(() => valoresVazios());
  const [inicial, setInicial] = useState<ValoresCompra>(() => valoresVazios());
  const [chave, setChave] = useState(0);
  const [aplicado, setAplicado] = useState(false);
  const [restauradoEm, setRestauradoEm] = useState<string | null>(null);

  const rascunho = useRascunho("resumo-lancar", valores, { ativo: temConteudo(valores) });

  // Ao abrir: se havia rascunho, volta com ele (uma vez só).
  if (!rascunho.carregando && !aplicado) {
    setAplicado(true);
    if (rascunho.inicial && temConteudo(restaurar(rascunho.inicial))) {
      const r = restaurar(rascunho.inicial);
      setInicial(r);
      setValores(r);
      setChave((k) => k + 1);
      setRestauradoEm(rascunho.inicialEm);
    }
  }

  const aoMudar = useCallback((v: ValoresCompra) => setValores(v), []);

  const recomecar = (data: string) => {
    const novo = valoresVazios(data);
    setInicial(novo);
    setValores(novo);
    setChave((k) => k + 1);
    setRestauradoEm(null);
  };

  const dia = useTodasCompras({ data: valores.data }, /^\d{4}-\d{2}-\d{2}$/.test(valores.data));
  const { compras, orcamentos, total } = separar(dia.data ?? []);

  return (
    <>
      <TituloTela
        titulo="Lançar compra"
        descricao="Registre as compras e orçamentos do dia. O CNPJ ou o código preenchem o fornecedor sozinhos quando já são conhecidos."
        acoes={
          <Button variante="secondary" asChild>
            <Link to="/resumo/diario">
              <FileText /> Ver resumo diário
            </Link>
          </Button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader
            titulo="Nova compra"
            descricao={
              rascunho.salvoAs
                ? `Rascunho salvo às ${rascunho.salvoAs}`
                : "O preenchimento é salvo automaticamente a cada 5 segundos."
            }
          />
          <CardBody>
            {restauradoEm ? (
              <p className="mb-4 rounded-md bg-verde-lima/30 px-3 py-2 text-sm text-verde-escuro">
                Recuperamos o preenchimento que estava em andamento ({dataHoraBR(restauradoEm)}).
              </p>
            ) : null}
            {rascunho.carregando ? (
              <div className="h-96 animate-pulse rounded-md bg-surface" />
            ) : (
              <FormularioCompra
                key={chave}
                inicial={inicial}
                aoMudar={aoMudar}
                salvando={salvar.isPending}
                aoSalvar={async (v) => {
                  await salvar.mutateAsync({ dados: paraEntrada(v, 0) });
                  notificar.sucesso(v.tipo === "compra" ? "Compra salva no resumo do dia." : "Orçamento salvo no resumo do dia.");
                  await rascunho.limpar();
                  recomecar(v.data);
                }}
                acoesExtras={
                  <Button
                    variante="ghost"
                    onClick={() => {
                      void rascunho.limpar();
                      recomecar(valores.data);
                    }}
                  >
                    <Eraser /> Limpar formulário
                  </Button>
                }
              />
            )}
          </CardBody>
        </Card>

        <Card className="self-start">
          <CardHeader
            titulo={`Lançamentos de ${dataBR(valores.data)}`}
            descricao={`${compras.length} compra(s) · ${moeda(total)}${orcamentos.length ? ` · ${orcamentos.length} orçamento(s)` : ""}`}
          />
          <ul className="max-h-[560px] divide-y divide-surface-border overflow-y-auto">
            {dia.isPending ? (
              <li className="p-4">
                <div className="h-16 animate-pulse rounded-md bg-surface" />
              </li>
            ) : null}
            {!dia.isPending && compras.length + orcamentos.length === 0 ? (
              <li className="p-4 text-sm text-arcom-gray">Nenhum lançamento neste dia.</li>
            ) : null}
            {[...compras, ...orcamentos].map((c) => (
              <li key={c.id} className="px-4 py-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold text-verde-escuro">{c.fornecedor || c.descricao || "-"}</p>
                  {c.tipo === "compra" ? (
                    <span className="whitespace-nowrap font-bold text-verde-escuro">{moeda(c.valor)}</span>
                  ) : (
                    <Badge variante="alerta">Orçamento</Badge>
                  )}
                </div>
                <p className="text-xs text-arcom-gray">
                  {c.area}
                  {c.ocs ? ` · OCS ${c.ocs}` : ""}
                  {c.solicitante ? ` · ${c.solicitante}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
