// Chaves e hooks do TanStack Query de cada recurso do backend. Uma factory de
// chave por recurso (padroes/02-frontend.md); toda mutation invalida a lista
// certa no onSuccess.
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api";
import type {
  Compra,
  ConsultaFornecedor,
  Cotacao,
  EntradaCompra,
  EntradaCotacao,
  EntradaEvento,
  Evento,
  Fornecedor,
  HistoricoCusto,
  Lista,
  PedidoRestaurante,
  Provisionado,
  Sugestoes,
  TotaisCompras,
  Usuario,
} from "@/tipos/api";

type Filtros = Record<string, string | number | undefined>;

function limpar(f: Filtros): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== "") out[k] = v;
  return out;
}

/** Busca todas as páginas de uma lista (o backend limita 100 por página). */
export async function buscarTodas<T>(url: string, filtros: Filtros = {}): Promise<T[]> {
  const itens: T[] = [];
  for (let pagina = 1; pagina <= 200; pagina++) {
    const { data } = await api.get<Lista<T>>(url, { params: { ...limpar(filtros), pagina, porPagina: 100 } });
    itens.push(...data.itens);
    if (pagina >= data.paginacao.totalPaginas) break;
  }
  return itens;
}

// ---------- Compras (Resumo Inteligente) ----------

export const compraKeys = {
  all: ["compras"] as const,
  lista: (f: Filtros) => [...compraKeys.all, "lista", f] as const,
  todas: (f: Filtros) => [...compraKeys.all, "todas", f] as const,
  totais: (f: Filtros) => [...compraKeys.all, "totais", f] as const,
  sugestoes: () => [...compraKeys.all, "sugestoes"] as const,
};

export function useCompras(f: Filtros) {
  return useQuery({
    queryKey: compraKeys.lista(f),
    queryFn: async () => (await api.get<Lista<Compra>>("/compras", { params: limpar(f) })).data,
    placeholderData: keepPreviousData,
  });
}

/** Todas as compras do filtro (resumo diário / exportação). */
export function useTodasCompras(f: Filtros, habilitado = true) {
  return useQuery({
    queryKey: compraKeys.todas(f),
    queryFn: () => buscarTodas<Compra>("/compras", f),
    enabled: habilitado,
  });
}

export function useTotaisCompras(f: Filtros) {
  return useQuery({
    queryKey: compraKeys.totais(f),
    queryFn: async () => (await api.get<TotaisCompras>("/compras/totais", { params: limpar(f) })).data,
    placeholderData: keepPreviousData,
  });
}

export function useSugestoes() {
  return useQuery({
    queryKey: compraKeys.sugestoes(),
    queryFn: async () => (await api.get<Sugestoes>("/compras/sugestoes")).data,
    staleTime: 5 * 60_000,
  });
}

export function useSalvarCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: EntradaCompra }) =>
      id ? (await api.put<Compra>(`/compras/${id}`, dados)).data : (await api.post<Compra>("/compras", dados)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: compraKeys.all }),
  });
}

export function useProvisionado() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, provisionado }: { id: string; provisionado: Provisionado }) =>
      (await api.patch<Compra>(`/compras/${id}/provisionado`, { provisionado })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: compraKeys.all }),
  });
}

export function useExcluirCompra() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/compras/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: compraKeys.all }),
  });
}

// ---------- Fornecedores ----------

export const fornecedorKeys = {
  all: ["fornecedores"] as const,
  lista: (f: Filtros) => [...fornecedorKeys.all, "lista", f] as const,
};

export function useFornecedores(f: Filtros) {
  return useQuery({
    queryKey: fornecedorKeys.lista(f),
    queryFn: async () => (await api.get<Lista<Fornecedor>>("/fornecedores", { params: limpar(f) })).data,
    placeholderData: keepPreviousData,
  });
}

export type EntradaFornecedor = Omit<Fornecedor, "id" | "criadoEm" | "atualizadoEm">;

export function useSalvarFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: EntradaFornecedor }) =>
      id ? (await api.put<Fornecedor>(`/fornecedores/${id}`, dados)).data : (await api.post<Fornecedor>("/fornecedores", dados)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: fornecedorKeys.all }),
  });
}

export function useExcluirFornecedor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/fornecedores/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: fornecedorKeys.all }),
  });
}

/** Consulta por CNPJ ou código (cadastro -> histórico -> BrasilAPI). Sem
 * toast automático: a tela mostra o aviso inline. */
export async function consultarFornecedor(params: { cnpj?: string; codigo?: string }): Promise<ConsultaFornecedor> {
  return (await api.get<ConsultaFornecedor>("/fornecedores/consulta", { params, skipErroGlobal: true })).data;
}

// ---------- Cotações ----------

export const cotacaoKeys = {
  all: ["cotacoes"] as const,
  lista: (f: Filtros) => [...cotacaoKeys.all, "lista", f] as const,
  item: (id: string) => [...cotacaoKeys.all, "item", id] as const,
  custo: (codigos: string, excluir: string) => [...cotacaoKeys.all, "custo", codigos, excluir] as const,
};

export function useCotacoes(f: Filtros) {
  return useQuery({
    queryKey: cotacaoKeys.lista(f),
    queryFn: async () => (await api.get<Lista<Cotacao>>("/cotacoes", { params: limpar(f) })).data,
    placeholderData: keepPreviousData,
  });
}

export function useCotacao(id: string | undefined) {
  return useQuery({
    queryKey: cotacaoKeys.item(id ?? ""),
    queryFn: async () => (await api.get<Cotacao>(`/cotacoes/${id}`)).data,
    enabled: !!id,
  });
}

export async function buscarCotacao(id: string): Promise<Cotacao> {
  return (await api.get<Cotacao>(`/cotacoes/${id}`)).data;
}

export function useHistoricoCusto(codigos: string[], excluir: string) {
  const chave = [...new Set(codigos.map((c) => c.trim()).filter(Boolean))].sort().join(",");
  return useQuery({
    queryKey: cotacaoKeys.custo(chave, excluir),
    queryFn: async () =>
      (await api.get<HistoricoCusto[]>("/cotacoes/historico-custo", { params: { codigos: chave, excluir } })).data,
    enabled: chave.length > 0,
    staleTime: 60_000,
  });
}

export function useSalvarCotacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: EntradaCotacao }) =>
      id ? (await api.put<Cotacao>(`/cotacoes/${id}`, dados)).data : (await api.post<Cotacao>("/cotacoes", dados)).data,
    onSuccess: (c) => {
      qc.setQueryData(cotacaoKeys.item(c.id), c);
      void qc.invalidateQueries({ queryKey: cotacaoKeys.all });
      void qc.invalidateQueries({ queryKey: compraKeys.all });
      void qc.invalidateQueries({ queryKey: pedidoKeys.all });
    },
  });
}

export function useExcluirCotacao() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/cotacoes/${id}`);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: cotacaoKeys.all });
      void qc.invalidateQueries({ queryKey: compraKeys.all });
      void qc.invalidateQueries({ queryKey: pedidoKeys.all });
    },
  });
}

// ---------- Pedidos do restaurante ----------

export const pedidoKeys = {
  all: ["pedidos-restaurante"] as const,
  lista: (f: Filtros) => [...pedidoKeys.all, "lista", f] as const,
};

export function usePedidos(f: Filtros) {
  return useQuery({
    queryKey: pedidoKeys.lista(f),
    queryFn: async () => (await api.get<Lista<PedidoRestaurante>>("/pedidos-restaurante", { params: limpar(f) })).data,
    placeholderData: keepPreviousData,
  });
}

export type EntradaPedido = {
  categoria: string;
  periodo: string;
  observacao: string;
  itens: PedidoRestaurante["itens"];
  enviar: boolean;
  versao: number;
};

export function useSalvarPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: EntradaPedido }) =>
      id
        ? (await api.put<PedidoRestaurante>(`/pedidos-restaurante/${id}`, dados)).data
        : (await api.post<PedidoRestaurante>("/pedidos-restaurante", dados)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidoKeys.all }),
  });
}

export function useExcluirPedido() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pedidos-restaurante/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: pedidoKeys.all }),
  });
}

// ---------- Eventos ----------

export const eventoKeys = {
  all: ["eventos"] as const,
  lista: (f: Filtros) => [...eventoKeys.all, "lista", f] as const,
};

export function useEventos(f: Filtros) {
  return useQuery({
    queryKey: eventoKeys.lista(f),
    queryFn: () => buscarTodas<Evento>("/eventos", f),
    placeholderData: keepPreviousData,
  });
}

export function useSalvarEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, dados }: { id?: string; dados: EntradaEvento }) =>
      id ? (await api.put<Evento>(`/eventos/${id}`, dados)).data : (await api.post<Evento>("/eventos", dados)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: eventoKeys.all }),
  });
}

export function useExcluirEvento() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/eventos/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: eventoKeys.all }),
  });
}

// ---------- Usuários ----------

export const usuarioKeys = {
  all: ["usuarios"] as const,
};

export function useUsuarios() {
  return useQuery({
    queryKey: usuarioKeys.all,
    queryFn: async () => (await api.get<Lista<Usuario>>("/usuarios")).data.itens,
  });
}

export function useSalvarUsuario() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      dados,
    }: {
      id?: string;
      dados: { nome: string; email?: string; senha: string; papel: string; ativo?: boolean };
    }) =>
      id
        ? (await api.put<Usuario>(`/usuarios/${id}`, { nome: dados.nome, papel: dados.papel, ativo: dados.ativo ?? true, senha: dados.senha })).data
        : (await api.post<Usuario>("/usuarios", { nome: dados.nome, email: dados.email, senha: dados.senha, papel: dados.papel })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: usuarioKeys.all }),
  });
}

/** Texto de um PDF pesquisável (extraído no backend). */
export async function extrairTextoPDF(arquivo: File): Promise<string> {
  const form = new FormData();
  form.append("arquivo", arquivo);
  const { data } = await api.post<{ texto: string }>("/importacao/pdf", form, { timeout: 60_000 });
  return data.texto;
}
