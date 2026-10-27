// Tipos dos recursos do backend (formato em padroes/09-contrato-api.md).
// Datas de calendário vêm como "AAAA-MM-DD"; instantes como ISO em UTC.

export type Paginacao = {
  pagina: number;
  porPagina: number;
  total: number;
  totalPaginas: number;
};

export type Lista<T> = { itens: T[]; paginacao: Paginacao };

export type Papel = "compras" | "restaurante";

export type Usuario = {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  ativo: boolean;
  criadoEm: string;
  atualizadoEm: string;
};

export type Provisionado = "PENDENTE" | "SIM";

export type TipoLancamento = "compra" | "orcamento";

export type Compra = {
  id: string;
  tipo: TipoLancamento;
  data: string;
  solicitante: string;
  area: string;
  cnpj: string;
  codigoFornecedor: string;
  fornecedor: string;
  ocs: string;
  descricao: string;
  valor: number;
  prazoPagamento: string;
  /** PENDENTE/SIM; registros antigos podem trazer outro texto (preservado). */
  provisionado: string;
  autorizador: string;
  aprovador: string;
  situacao: string;
  origemCotacaoId: string | null;
  origemChave: string;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type EntradaCompra = Omit<
  Compra,
  "id" | "origemCotacaoId" | "origemChave" | "criadoEm" | "atualizadoEm" | "provisionado"
> & { provisionado: Provisionado };

export type TotaisCompras = { quantidade: number; valorTotal: number };

export type Sugestoes = {
  solicitantes: string[];
  autorizadores: string[];
  aprovadores: string[];
  fornecedores: string[];
  prazos: string[];
};

export type Fornecedor = {
  id: string;
  codigo: string;
  cnpj: string;
  nome: string;
  contato: string;
  telefone: string;
  email: string;
  endereco: string;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type ConsultaFornecedor = {
  encontrado: boolean;
  origem: "cadastro" | "historico" | "brasilapi" | "";
  nome: string;
  cnpj: string;
  codigo: string;
  aviso?: string;
};

export type Modulo = "hortifruti" | "consumo";
export type Formato = "lista" | "alternativas";

export type FornecedorCotacao = {
  id: string;
  nome: string;
  fornecedorId: string;
  codigo: string;
  cnpj: string;
  contato: string;
  telefone: string;
  email: string;
  endereco: string;
  pagamento: string;
  entrega: string;
  frete: string;
  observacoes: string;
};

export type ItemCotacao = {
  id: string;
  nome: string;
  codigoArcom: string;
  qtd: number | null;
  unidade: string;
  entrega: string;
  consumoMensal: number | null;
  estoqueAtual: number | null;
  precos: Record<string, number | null>;
  /** Escolha manual do fornecedor. Vazio = menor preço automático. */
  selecionado: string;
  observacao: string;
};

export type PedidoFornecedor = {
  os: string;
  enviadoEm: string;
  nfNumero: string;
  nfData: string;
  nfLancada: boolean;
  observacao: string;
};

export type ConteudoCotacao = {
  fornecedores: FornecedorCotacao[];
  itens: ItemCotacao[];
  pedidos: Record<string, PedidoFornecedor>;
};

export type Cotacao = {
  id: string;
  modulo: Modulo;
  categoria: string;
  formato: Formato;
  titulo: string;
  ocs: string;
  data: string;
  periodo: string;
  solicitante: string;
  centroCusto: string;
  situacao: string;
  provisionado: Provisionado;
  descricao: string;
  /** Só vem no GET /cotacoes/{id} (a listagem traz só o cabeçalho). */
  conteudo?: ConteudoCotacao;
  totalEscolhido: number;
  pedidoId: string | null;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type EntradaCotacao = Omit<
  Cotacao,
  "id" | "conteudo" | "totalEscolhido" | "criadoEm" | "atualizadoEm" | "pedidoId"
> & { conteudo: ConteudoCotacao; pedidoId: string };

export type HistoricoCusto = {
  codigoArcom: string;
  item: string;
  fornecedor: string;
  precoUnitario: number;
  quantidade: number;
  unidade: string;
  data: string;
  cotacaoId: string;
  titulo: string;
};

export type ItemPedido = {
  id: string;
  nome: string;
  qtd: number | null;
  unidade: string;
  entrega: string;
  observacao: string;
};

export type SituacaoPedido = "RASCUNHO" | "ENVIADO" | "EM COTAÇÃO";

export type PedidoRestaurante = {
  id: string;
  categoria: string;
  periodo: string;
  observacao: string;
  itens: ItemPedido[];
  situacao: SituacaoPedido;
  cotacaoId: string | null;
  versao: number;
  criadoPor: string;
  criadoPorNome: string;
  criadoEm: string;
  atualizadoEm: string;
};

export type Despesa = {
  id: string;
  categoria: string;
  nome: string;
  fornecedor: string;
  qtd: number | null;
  unidade: string;
  valorUnitario: number | null;
  total: number | null;
  situacao: "" | "A COTAR" | "EM NEGOCIAÇÃO" | "FECHADO" | "PAGO";
  ocs: string;
};

export type Evento = {
  id: string;
  nome: string;
  local: string;
  cidade: string;
  data: string | null;
  participantes: number;
  estados: string;
  ocs: string;
  hospedados: number;
  situacao: string;
  valorOrcado: number;
  creditoFornecedor: number;
  observacoes: string;
  despesas: Despesa[];
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type EntradaEvento = Omit<Evento, "id" | "criadoEm" | "atualizadoEm" | "data"> & {
  data: string;
};

export type ResultadoImportacao = { criados: number; atualizados: number };
