import { Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { TituloTela } from "@/components/Layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Campo, Input, Select } from "@/components/ui/input";
import { dataHoraBR } from "@/core/formato";
import { useSessao } from "@/core/sessao";
import { notificar } from "@/core/toast";
import { useSalvarUsuario, useUsuarios } from "@/hooks/recursos";
import type { Papel, Usuario } from "@/tipos/api";

type Form = { nome: string; email: string; senha: string; papel: Papel; ativo: boolean };

function FormUsuario({ usuario, aoFechar }: { usuario?: Usuario; aoFechar: () => void }) {
  const { usuario: eu } = useSessao();
  const [dados, setDados] = useState<Form>({
    nome: usuario?.nome ?? "",
    email: usuario?.email ?? "",
    senha: "",
    papel: usuario?.papel ?? "restaurante",
    ativo: usuario?.ativo ?? true,
  });
  const [erros, setErros] = useState<Record<string, string>>({});
  const salvar = useSalvarUsuario();
  const souEu = usuario?.id === eu?.id;

  function enviar() {
    const e: Record<string, string> = {};
    if (dados.nome.trim().length < 2) e.nome = "Informe o nome.";
    if (!usuario && !/^\S+@\S+\.\S+$/.test(dados.email)) e.email = "E-mail inválido.";
    if ((!usuario || dados.senha) && dados.senha.length < 10) e.senha = "Mínimo de 10 caracteres.";
    setErros(e);
    if (Object.keys(e).length) return;
    salvar.mutate(
      { id: usuario?.id, dados: { nome: dados.nome.trim(), email: dados.email.trim(), senha: dados.senha, papel: dados.papel, ativo: dados.ativo } },
      {
        onSuccess: () => {
          notificar.sucesso(usuario ? "Usuário atualizado." : "Usuário criado. Passe o e-mail e a senha para a pessoa.");
          aoFechar();
        },
      },
    );
  }

  return (
    <Dialog
      aberto
      aoMudar={(a) => !a && aoFechar()}
      titulo={usuario ? "Editar usuário" : "Novo usuário"}
      rodape={
        <>
          <Button variante="secondary" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button onClick={enviar} disabled={salvar.isPending}>
            {salvar.isPending ? "Salvando..." : "Salvar usuário"}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(ev) => {
          ev.preventDefault();
          enviar();
        }}
      >
        <Campo rotulo="Nome" htmlFor="u-nome" erro={erros.nome}>
          <Input id="u-nome" value={dados.nome} onChange={(e) => setDados({ ...dados, nome: e.target.value })} />
        </Campo>
        <Campo rotulo="E-mail (login)" htmlFor="u-email" erro={erros.email} dica={usuario ? "O e-mail não pode ser alterado." : undefined}>
          <Input id="u-email" type="email" disabled={!!usuario} value={dados.email} onChange={(e) => setDados({ ...dados, email: e.target.value })} />
        </Campo>
        <Campo
          rotulo={usuario ? "Nova senha (opcional)" : "Senha"}
          htmlFor="u-senha"
          erro={erros.senha}
          dica={usuario ? "Deixe em branco para manter a atual. Trocar a senha encerra as sessões abertas." : "Mínimo de 10 caracteres."}
        >
          <Input id="u-senha" type="password" autoComplete="new-password" value={dados.senha} onChange={(e) => setDados({ ...dados, senha: e.target.value })} />
        </Campo>
        <Campo rotulo="Acesso" htmlFor="u-papel" dica={souEu ? "Você não pode alterar o acesso da sua própria conta." : undefined}>
          <Select id="u-papel" disabled={souEu} value={dados.papel} onChange={(e) => setDados({ ...dados, papel: e.target.value as Papel })}>
            <option value="restaurante">Restaurante — só preenche o pedido de carnes e verduras</option>
            <option value="compras">Compras — acesso completo</option>
          </Select>
        </Campo>
        {usuario ? (
          <label className="flex items-center gap-2 text-sm text-verde-escuro">
            <input
              type="checkbox"
              className="size-4 accent-verde-arcom"
              disabled={souEu}
              checked={dados.ativo}
              onChange={(e) => setDados({ ...dados, ativo: e.target.checked })}
            />
            Acesso ativo (desmarque para bloquear o login)
          </label>
        ) : null}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export default function Usuarios() {
  const usuarios = useUsuarios();
  const [editando, setEditando] = useState<{ usuario?: Usuario } | null>(null);

  return (
    <div>
      <TituloTela
        titulo="Usuários"
        descricao="Quem acessa o Conta Certa. O acesso Restaurante só enxerga Pedidos do restaurante: é assim que o time do restaurante preenche o pedido de sexta-feira para você fazer a cotação."
        acoes={
          <Button onClick={() => setEditando({})}>
            <Plus /> Novo usuário
          </Button>
        }
      />
      <Card>
        <CardBody className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead className="bg-verde-escuro text-left text-xs font-bold uppercase tracking-wider text-white">
                <tr>
                  <th className="px-4 py-2">Nome</th>
                  <th className="px-4 py-2">E-mail</th>
                  <th className="px-4 py-2">Acesso</th>
                  <th className="px-4 py-2">Situação</th>
                  <th className="px-4 py-2">Criado em</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {usuarios.data?.map((u) => (
                  <tr key={u.id} className="border-t border-surface-border odd:bg-white even:bg-surface">
                    <td className="px-4 py-2 font-semibold text-verde-escuro">{u.nome}</td>
                    <td className="px-4 py-2">{u.email}</td>
                    <td className="px-4 py-2">
                      <Badge variante={u.papel === "compras" ? "escuro" : "alerta"}>{u.papel === "compras" ? "Compras" : "Restaurante"}</Badge>
                    </td>
                    <td className="px-4 py-2">
                      <Badge variante={u.ativo ? "sucesso" : "perigo"}>{u.ativo ? "Ativo" : "Bloqueado"}</Badge>
                    </td>
                    <td className="px-4 py-2">{dataHoraBR(u.criadoEm)}</td>
                    <td className="px-4 py-2 text-right">
                      <Button variante="ghost" tamanho="icone" aria-label={`Editar ${u.nome}`} onClick={() => setEditando({ usuario: u })}>
                        <Pencil />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
      {editando ? <FormUsuario usuario={editando.usuario} aoFechar={() => setEditando(null)} /> : null}
    </div>
  );
}
