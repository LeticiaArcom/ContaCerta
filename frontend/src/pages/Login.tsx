import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Campo, Input } from "@/components/ui/input";
import { api } from "@/core/api";
import type { ErroApi } from "@/core/erro";
import { resolverZod } from "@/core/formulario";
import { useConfiguracaoInicial, useLogin, useSessao } from "@/core/sessao";

const esquemaLogin = z.object({
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha"),
});

const esquemaInicial = z
  .object({
    nome: z.string().min(2, "Informe seu nome"),
    email: z.string().email("E-mail inválido"),
    senha: z.string().min(10, "Mínimo de 10 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, { message: "As senhas não conferem", path: ["confirmacao"] });

function FormLogin() {
  const login = useLogin();
  const form = useForm<z.infer<typeof esquemaLogin>>({ resolver: resolverZod(esquemaLogin) });
  const erroApi = login.error as ErroApi | null;
  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void form.handleSubmit((d) => login.mutate(d))(e)} noValidate>
      <Campo rotulo="E-mail" htmlFor="email" erro={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
      </Campo>
      <Campo rotulo="Senha" htmlFor="senha" erro={form.formState.errors.senha?.message}>
        <Input id="senha" type="password" autoComplete="current-password" {...form.register("senha")} />
      </Campo>
      {erroApi ? <p className="rounded-md bg-danger/10 px-3 py-2 text-sm font-medium text-danger">{erroApi.mensagem}</p> : null}
      <Button type="submit" disabled={login.isPending}>
        {login.isPending ? "Entrando..." : "Entrar"}
      </Button>
    </form>
  );
}

function FormConfiguracaoInicial() {
  const criar = useConfiguracaoInicial();
  const form = useForm<z.infer<typeof esquemaInicial>>({ resolver: resolverZod(esquemaInicial) });
  const e = form.formState.errors;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(ev) => void form.handleSubmit((d) => criar.mutate({ nome: d.nome, email: d.email, senha: d.senha }))(ev)}
      noValidate
    >
      <p className="rounded-md bg-verde-lima/30 px-3 py-2 text-sm text-verde-escuro">
        Primeiro acesso: crie a conta da área de Compras. Depois, em Usuários, você libera o acesso do time do restaurante.
      </p>
      <Campo rotulo="Nome" htmlFor="nome" erro={e.nome?.message}>
        <Input id="nome" autoComplete="name" {...form.register("nome")} />
      </Campo>
      <Campo rotulo="E-mail" htmlFor="email" erro={e.email?.message}>
        <Input id="email" type="email" autoComplete="username" {...form.register("email")} />
      </Campo>
      <Campo rotulo="Senha" htmlFor="senha" erro={e.senha?.message}>
        <Input id="senha" type="password" autoComplete="new-password" {...form.register("senha")} />
      </Campo>
      <Campo rotulo="Confirme a senha" htmlFor="confirmacao" erro={e.confirmacao?.message}>
        <Input id="confirmacao" type="password" autoComplete="new-password" {...form.register("confirmacao")} />
      </Campo>
      <Button type="submit" disabled={criar.isPending}>
        {criar.isPending ? "Criando..." : "Criar conta e entrar"}
      </Button>
    </form>
  );
}

export default function Login() {
  const { usuario, carregando } = useSessao();
  const location = useLocation();
  const configuracao = useQuery({
    queryKey: ["sessao", "configuracao-inicial"],
    queryFn: async () =>
      (await api.get<{ necessaria: boolean }>("/sessao/configuracao-inicial", { skipErroGlobal: true })).data,
    retry: false,
  });

  if (carregando) return null;
  if (usuario) {
    const de = (location.state as { de?: { pathname?: string } } | null)?.de?.pathname;
    return <Navigate to={de && de !== "/login" ? de : "/"} replace />;
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-verde-escuro p-10 lg:flex">
        <img src="/logo-arcom-verde-escuro.svg" alt="ARCOM" className="h-24 w-auto self-start" />
        <div>
          <span className="mb-4 block h-1.5 w-16 bg-verde-lima" />
          <h1 className="text-5xl font-black leading-tight text-white">Decida com números. Sem complicação.</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">
            Cotações, fornecedores, compras, provisionamentos e eventos num lugar só.
          </p>
        </div>
        <p className="text-sm text-white/60">Conta Certa · Compras de Consumo, Restaurante e Eventos</p>
      </section>
      <section className="flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-sm rounded-lg border border-surface-border bg-white p-8 shadow-sm">
          <img src="/logo-arcom.svg" alt="ARCOM" className="mb-2 h-16 w-auto lg:hidden" />
          <p className="text-xs font-bold uppercase tracking-wider text-verde-arcom">Gestão de Compras</p>
          <h2 className="mb-6 mt-1 text-3xl font-black text-verde-escuro">Conta Certa</h2>
          {configuracao.isPending ? null : configuracao.data?.necessaria ? <FormConfiguracaoInicial /> : <FormLogin />}
        </div>
      </section>
    </main>
  );
}
