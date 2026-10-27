// Rascunho automático de formulário, guardado no servidor (por usuário):
// protege o preenchimento contra fechar a aba ou faltar energia e vale em
// qualquer computador. Não substitui o botão Salvar.
//
//   const r = useRascunho("resumo-lancar", valoresDoForm, { ativo: formTemConteudo });
//   r.inicial  -> o rascunho encontrado ao abrir (ou null), pra restaurar
//   r.salvoAs  -> horário do último salvamento ("15:02:10")
//   r.limpar() -> apaga depois de salvar de verdade / limpar o formulário
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/core/api";
import { horaAgora } from "@/core/formato";

const INTERVALO_MS = 5_000;

type RespostaRascunho<T> = { chave: string; conteudo: T; atualizadoEm: string };

const rascunhoKeys = {
  item: (chave: string) => ["rascunhos", chave] as const,
};

export function useRascunho<T>(chave: string, valor: T, { ativo }: { ativo: boolean }) {
  const qc = useQueryClient();
  const inicial = useQuery({
    queryKey: rascunhoKeys.item(chave),
    queryFn: async () => {
      try {
        const { data } = await api.get<RespostaRascunho<T>>(`/rascunhos/${chave}`, { skipErroGlobal: true });
        return data;
      } catch {
        return null; // sem rascunho é o normal
      }
    },
    staleTime: Infinity,
    gcTime: 0,
  });

  const [salvoAs, setSalvoAs] = useState<string | null>(null);
  const ultimoEnviado = useRef<string | null>(null);
  const atual = useRef<string>("");
  atual.current = JSON.stringify(valor);
  const ativoRef = useRef(ativo);
  ativoRef.current = ativo;

  const enviar = useCallback(async () => {
    if (!ativoRef.current || atual.current === ultimoEnviado.current) return;
    const texto = atual.current;
    try {
      await api.put(`/rascunhos/${chave}`, { conteudo: JSON.parse(texto) as unknown }, { skipErroGlobal: true });
      ultimoEnviado.current = texto;
      setSalvoAs(horaAgora());
    } catch {
      // falha de rede: tenta de novo no próximo ciclo, sem incomodar com toast
    }
  }, [chave]);

  // Só começa a salvar depois de saber se havia rascunho (senão sobrescreveria
  // o rascunho antigo com o formulário vazio antes de dar tempo de restaurar).
  const pronto = !inicial.isPending;
  useEffect(() => {
    if (!pronto) return;
    const t = setInterval(() => void enviar(), INTERVALO_MS);
    const aoSair = () => void enviar();
    window.addEventListener("beforeunload", aoSair);
    return () => {
      clearInterval(t);
      window.removeEventListener("beforeunload", aoSair);
    };
  }, [pronto, enviar]);

  const limpar = useCallback(async () => {
    ultimoEnviado.current = atual.current;
    setSalvoAs(null);
    qc.setQueryData(rascunhoKeys.item(chave), null);
    try {
      await api.delete(`/rascunhos/${chave}`, { skipErroGlobal: true });
    } catch {
      // se falhar, o próximo salvamento sobrescreve
    }
  }, [chave, qc]);

  /** Marca o valor atual como já salvo (ex.: logo depois de restaurar). */
  const marcarSalvo = useCallback(() => {
    ultimoEnviado.current = atual.current;
  }, []);

  return {
    carregando: inicial.isPending,
    inicial: inicial.data?.conteudo ?? null,
    inicialEm: inicial.data?.atualizadoEm ?? null,
    salvoAs,
    salvarAgora: enviar,
    limpar,
    marcarSalvo,
  };
}
