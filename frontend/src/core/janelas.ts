// Janelas de confirmação e de preenchimento do próprio Conta Certa — nunca
// os alert/confirm/prompt nativos do navegador. Uso:
//
//   if (await confirmar({ titulo: "Excluir fornecedor?", mensagem: "...", perigo: true })) { ... }
//   const nome = await pedirTexto({ titulo: "Novo fornecedor", rotulo: "Nome" });
import { create } from "zustand";

export type PedidoConfirmacao = {
  tipo: "confirmar";
  titulo: string;
  mensagem: string;
  confirmar?: string;
  cancelar?: string;
  perigo?: boolean;
  resolver: (ok: boolean) => void;
};

export type PedidoTexto = {
  tipo: "texto";
  titulo: string;
  mensagem?: string;
  rotulo: string;
  valorInicial?: string;
  confirmar?: string;
  resolver: (valor: string | null) => void;
};

type EstadoJanelas = {
  atual: PedidoConfirmacao | PedidoTexto | null;
  abrir: (p: PedidoConfirmacao | PedidoTexto) => void;
  fechar: () => void;
};

export const useJanelas = create<EstadoJanelas>((set) => ({
  atual: null,
  abrir: (p) => set({ atual: p }),
  fechar: () => set({ atual: null }),
}));

export function confirmar(opcoes: Omit<PedidoConfirmacao, "tipo" | "resolver">): Promise<boolean> {
  return new Promise((resolve) => {
    useJanelas.getState().abrir({ ...opcoes, tipo: "confirmar", resolver: resolve });
  });
}

export function pedirTexto(opcoes: Omit<PedidoTexto, "tipo" | "resolver">): Promise<string | null> {
  return new Promise((resolve) => {
    useJanelas.getState().abrir({ ...opcoes, tipo: "texto", resolver: resolve });
  });
}
