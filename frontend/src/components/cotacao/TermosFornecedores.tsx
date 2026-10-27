// Condições comerciais e dados de cada fornecedor (Compras de consumo).
// Painel expansível por fornecedor; CNPJ/código preenchem pelo cadastro.
import { ChevronDown, Search } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { cn } from "@/core/cn";
import { notificar } from "@/core/toast";
import { consultarFornecedor } from "@/hooks/recursos";
import type { ConteudoCotacao, FornecedorCotacao } from "@/tipos/api";

type Chave = keyof Omit<FornecedorCotacao, "id" | "fornecedorId">;

const CAMPOS_TERMOS: [Chave, string][] = [
  ["pagamento", "Pagamento"],
  ["entrega", "Prazo de entrega"],
  ["frete", "Frete"],
  ["observacoes", "Observações"],
];

const CAMPOS_DADOS: [Chave, string][] = [
  ["codigo", "Código do fornecedor"],
  ["cnpj", "CNPJ"],
  ["contato", "Contato"],
  ["telefone", "Telefone"],
  ["email", "E-mail"],
  ["endereco", "Endereço"],
];

export function TermosFornecedores({
  conteudo,
  aoMudar,
}: {
  conteudo: ConteudoCotacao;
  aoMudar: (fn: (c: ConteudoCotacao) => ConteudoCotacao) => void;
}) {
  const [aberto, setAberto] = useState<string | null>(null);
  if (!conteudo.fornecedores.length) return null;

  const mudar = (id: string, parcial: Partial<FornecedorCotacao>) =>
    aoMudar((c) => ({ ...c, fornecedores: c.fornecedores.map((f) => (f.id === id ? { ...f, ...parcial } : f)) }));

  const buscar = async (f: FornecedorCotacao) => {
    try {
      const r = await consultarFornecedor(f.cnpj.trim() ? { cnpj: f.cnpj } : { codigo: f.codigo });
      if (!r.encontrado) {
        notificar.aviso("Fornecedor não encontrado no cadastro.");
        return;
      }
      mudar(f.id, { cnpj: r.cnpj || f.cnpj, codigo: r.codigo || f.codigo, nome: f.nome || r.nome });
      notificar.sucesso(r.aviso ?? `Dados de ${r.nome} preenchidos.`);
    } catch (e) {
      notificar.aviso((e as { mensagem?: string }).mensagem ?? "Não foi possível consultar o fornecedor.");
    }
  };

  return (
    <div className="space-y-2">
      {conteudo.fornecedores.map((f) => {
        const expandido = aberto === f.id;
        return (
          <div key={f.id} className="rounded-md border border-surface-border bg-white">
            <button
              type="button"
              onClick={() => setAberto(expandido ? null : f.id)}
              className="flex w-full items-center justify-between gap-2 px-4 py-2 text-left"
              aria-expanded={expandido}
            >
              <span className="font-semibold text-verde-escuro">{f.nome}</span>
              <span className="flex items-center gap-3 text-xs text-arcom-gray">
                {f.pagamento ? <span>Pagamento: {f.pagamento}</span> : <span className="text-danger">Sem condição de pagamento</span>}
                {f.entrega ? <span>Entrega: {f.entrega}</span> : null}
                <ChevronDown className={cn("size-4 transition duration-fast", expandido && "rotate-180")} />
              </span>
            </button>
            {expandido ? (
              <div className="grid gap-3 border-t border-surface-border p-4 sm:grid-cols-2 lg:grid-cols-4">
                {[...CAMPOS_TERMOS, ...CAMPOS_DADOS].map(([chave, rotulo]) => (
                  <Campo key={chave} rotulo={rotulo} htmlFor={`${f.id}-${chave}`} className={chave === "endereco" || chave === "observacoes" ? "sm:col-span-2" : ""}>
                    <Input id={`${f.id}-${chave}`} className="h-9" value={f[chave]} onChange={(e) => mudar(f.id, { [chave]: e.target.value })} />
                  </Campo>
                ))}
                <div className="flex items-end">
                  <Button tamanho="sm" variante="secondary" disabled={!f.cnpj.trim() && !f.codigo.trim()} onClick={() => void buscar(f)}>
                    <Search /> Buscar pelo CNPJ/código
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
