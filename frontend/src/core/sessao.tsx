// Sessão do usuário. O token vive num cookie HttpOnly (o backend define) —
// este módulo nunca lê nem grava token; só sabe "quem está logado" perguntando
// pro backend. Permissão NUNCA é persistida no cliente (nada de
// localStorage) — quem decide acesso é sempre o backend, na hora da
// requisição real (ver padroes/02-frontend.md, item "Sessão").
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { Papel, Usuario } from "@/tipos/api";
import { api, configurarApi } from "./api";
import { notificar } from "./toast";

export type { Usuario };

const CHAVE_SESSAO = ["sessao"] as const;

async function buscarSessao(): Promise<Usuario | null> {
  try {
    const { data } = await api.get<Usuario>("/sessao", {
      skipErroGlobal: true,
    });
    return data;
  } catch {
    return null; // sem sessão é estado normal (deslogado), não é erro de tela
  }
}

// Este arquivo mistura hooks/componentes com tipo e constante de propósito
// (é o módulo de sessão inteiro, coeso) — desliga o aviso de Fast Refresh
// pontualmente em vez de fragmentar em mais arquivos por causa de uma regra
// de DX.
// eslint-disable-next-line react-refresh/only-export-components
export function useSessao() {
  const { data, isLoading } = useQuery({
    queryKey: CHAVE_SESSAO,
    queryFn: buscarSessao,
    staleTime: 5 * 60_000,
    retry: false,
  });
  return { usuario: data ?? null, carregando: isLoading };
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (credenciais: { email: string; senha: string }) =>
      (await api.post<Usuario>("/sessao", credenciais, { skipErroGlobal: true })).data,
    onSuccess: (u) => queryClient.setQueryData(CHAVE_SESSAO, u),
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function useConfiguracaoInicial() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dados: { nome: string; email: string; senha: string }) =>
      (await api.post<Usuario>("/sessao/configuracao-inicial", dados)).data,
    onSuccess: (u) => queryClient.setQueryData(CHAVE_SESSAO, u),
  });
}

// eslint-disable-next-line react-refresh/only-export-components
export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.post("/sessao/logout");
    },
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(CHAVE_SESSAO, null);
    },
  });
}

/**
 * Liga o cliente axios ao ciclo de vida da sessão. Monte uma vez, na raiz do
 * app (ver App.tsx).
 */
export function ProvedorDeSessao({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    configurarApi({
      onNaoAutenticado: () => {
        queryClient.setQueryData(CHAVE_SESSAO, null);
      },
      onErro: (mensagem) => notificar.erro(mensagem),
    });
  }, [queryClient]);

  return <>{children}</>;
}

/** Layout route de guarda — envolva as rotas privadas com ela em rotas.tsx.
 * Com `papel`, só esse papel entra (o backend recusa do mesmo jeito; aqui
 * é só pra não mostrar uma tela que daria erro). */
export function RotaProtegida({ papel }: { papel?: Papel }) {
  const { usuario, carregando } = useSessao();
  const location = useLocation();

  if (carregando) return null;
  if (!usuario)
    return <Navigate to="/login" state={{ de: location }} replace />;
  if (papel && usuario.papel !== papel) return <Navigate to="/" replace />;

  return <Outlet />;
}
