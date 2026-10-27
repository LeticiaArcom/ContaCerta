import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { cnpjValido, mascaraCNPJ } from "@/components/cadastros/cnpj";
import { TituloTela } from "@/components/Layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Campo, Input } from "@/components/ui/input";
import { confirmar } from "@/core/janelas";
import { notificar } from "@/core/toast";
import { useExcluirFornecedor, useFornecedores, useSalvarFornecedor, type EntradaFornecedor } from "@/hooks/recursos";
import type { Fornecedor } from "@/tipos/api";

const VAZIO: EntradaFornecedor = { codigo: "", cnpj: "", nome: "", contato: "", telefone: "", email: "", endereco: "", versao: 0 };
const POR_PAGINA = 25;

function FormFornecedor({ inicial, id, aoFechar }: { inicial: EntradaFornecedor; id?: string; aoFechar: () => void }) {
  const [dados, setDados] = useState(inicial);
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvarFornecedor();
  const muda = (campo: keyof EntradaFornecedor) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDados((d) => ({ ...d, [campo]: campo === "cnpj" ? mascaraCNPJ(e.target.value) : e.target.value }));

  function enviar() {
    const novos: Record<string, string> = {};
    if (!dados.nome.trim()) novos.nome = "Informe o nome.";
    if (dados.cnpj && !cnpjValido(dados.cnpj)) novos.cnpj = "CNPJ inválido.";
    if (dados.email && !/^\S+@\S+\.\S+$/.test(dados.email)) novos.email = "E-mail inválido.";
    setErros(novos);
    if (Object.keys(novos).length) return;
    salvar.mutate(
      { id, dados },
      {
        onSuccess: () => {
          notificar.sucesso(id ? "Fornecedor atualizado." : "Fornecedor cadastrado.");
          aoFechar();
        },
      },
    );
  }

  return (
    <Dialog
      aberto
      aoMudar={(a) => !a && aoFechar()}
      titulo={id ? "Editar fornecedor" : "Novo fornecedor"}
      largura="max-w-2xl"
      rodape={
        <>
          <Button variante="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Salvar fornecedor"}
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          enviar();
        }}
      >
        <Campo rotulo="Nome" htmlFor="f-nome" erro={erros.nome} className="sm:col-span-2">
          <Input id="f-nome" value={dados.nome} onChange={muda("nome")} />
        </Campo>
        <Campo rotulo="Código do fornecedor" htmlFor="f-codigo">
          <Input id="f-codigo" value={dados.codigo} onChange={muda("codigo")} />
        </Campo>
        <Campo rotulo="CNPJ" htmlFor="f-cnpj" erro={erros.cnpj}>
          <Input id="f-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={dados.cnpj} onChange={muda("cnpj")} />
        </Campo>
        <Campo rotulo="Contato" htmlFor="f-contato">
          <Input id="f-contato" value={dados.contato} onChange={muda("contato")} />
        </Campo>
        <Campo rotulo="Telefone" htmlFor="f-tel">
          <Input id="f-tel" value={dados.telefone} onChange={muda("telefone")} />
        </Campo>
        <Campo rotulo="E-mail" htmlFor="f-email" erro={erros.email} className="sm:col-span-2">
          <Input id="f-email" type="email" value={dados.email} onChange={muda("email")} />
        </Campo>
        <Campo rotulo="Endereço" htmlFor="f-end" className="sm:col-span-2">
          <Input id="f-end" value={dados.endereco} onChange={muda("endereco")} />
        </Campo>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export default function Fornecedores() {
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(1);
  const [editando, setEditando] = useState<{ id?: string; dados: EntradaFornecedor } | null>(null);
  const lista = useFornecedores({ busca, pagina, porPagina: POR_PAGINA });
  const excluir = useExcluirFornecedor();
  const pag = lista.data?.paginacao;

  async function aoExcluir(f: Fornecedor) {
    const ok = await confirmar({
      titulo: "Excluir fornecedor?",
      mensagem: `"${f.nome}" sai do cadastro. Compras e cotações já lançadas com ele continuam como estão.`,
      confirmar: "Excluir",
      perigo: true,
    });
    if (ok) excluir.mutate(f.id, { onSuccess: () => notificar.sucesso("Fornecedor excluído.") });
  }

  return (
    <div>
      <TituloTela
        titulo="Fornecedores"
        descricao="Código, CNPJ e dados comerciais. O cadastro também aprende sozinho: cada compra lançada com CNPJ ou código completa o que faltar aqui."
        acoes={
          <Button onClick={() => setEditando({ dados: VAZIO })}>
            <Plus /> Novo fornecedor
          </Button>
        }
      />
      <Card>
        <div className="border-b border-surface-border p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-arcom-gray" />
            <Input
              aria-label="Buscar fornecedor"
              placeholder="Buscar por nome, código ou CNPJ"
              className="pl-9"
              value={busca}
              onChange={(e) => {
                setBusca(e.target.value);
                setPagina(1);
              }}
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px] text-sm">
            <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
              <tr>
                <th className="px-4 py-2">Código</th>
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">CNPJ</th>
                <th className="px-4 py-2">Contato</th>
                <th className="px-4 py-2">Telefone / e-mail</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {lista.data?.itens.map((f) => (
                <tr key={f.id} className="border-t border-surface-border odd:bg-white even:bg-surface">
                  <td className="px-4 py-2 font-medium text-verde-escuro">{f.codigo || "-"}</td>
                  <td className="px-4 py-2 font-semibold text-verde-escuro">{f.nome}</td>
                  <td className="whitespace-nowrap px-4 py-2">{f.cnpj || "-"}</td>
                  <td className="px-4 py-2">{f.contato || "-"}</td>
                  <td className="px-4 py-2">{[f.telefone, f.email].filter(Boolean).join(" · ") || "-"}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variante="ghost"
                        tamanho="icone"
                        aria-label={`Editar ${f.nome}`}
                        onClick={() =>
                          setEditando({
                            id: f.id,
                            dados: { codigo: f.codigo, cnpj: f.cnpj, nome: f.nome, contato: f.contato, telefone: f.telefone, email: f.email, endereco: f.endereco, versao: f.versao },
                          })
                        }
                      >
                        <Pencil />
                      </Button>
                      <Button variante="ghost" tamanho="icone" aria-label={`Excluir ${f.nome}`} onClick={() => void aoExcluir(f)}>
                        <Trash2 className="text-danger" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {lista.data && lista.data.itens.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-arcom-gray">
                    Nenhum fornecedor encontrado.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {pag && pag.totalPaginas > 1 ? (
          <div className="flex items-center justify-between border-t border-surface-border px-4 py-3 text-sm">
            <span>
              {pag.total} fornecedores · página {pag.pagina} de {pag.totalPaginas}
            </span>
            <div className="flex gap-2">
              <Button variante="secondary" tamanho="sm" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
                Anterior
              </Button>
              <Button variante="secondary" tamanho="sm" disabled={pagina >= pag.totalPaginas} onClick={() => setPagina((p) => p + 1)}>
                Próxima
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
      {editando ? <FormFornecedor inicial={editando.dados} id={editando.id} aoFechar={() => setEditando(null)} /> : null}
    </div>
  );
}
