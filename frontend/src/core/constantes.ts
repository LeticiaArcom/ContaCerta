// Listas fixas do negócio (mesmas do sistema anterior).

export const AREAS_RESUMO = [
  "Compras",
  "Restaurante",
  "Marketing",
  "Transporte",
  "Comercial - Vendas",
  "Consumo",
  "Eventos",
  "Treinamentos",
  "Almoxarifado",
  "Estoque",
  "Informática",
  "Manutenção Patrimonial",
  "Segurança do Trabalho",
  "Jurídico",
  "DP",
  "Secretarias",
  "Outros",
] as const;

export const DEPARTAMENTOS_CONSUMO = [
  "Marketing",
  "Informática",
  "Estoque",
  "Manutenção Patrimonial",
  "Almoxarifado",
  "Treinamentos",
  "Eventos",
  "Restaurante",
  "Administrativo",
  "Demais",
] as const;

/** Departamentos com controle de estoque: Código ARCOM, consumo mensal,
 * estoque atual e histórico de custo. */
export const DEPARTAMENTOS_COM_ESTOQUE = ["Estoque", "Almoxarifado"];

export const CATEGORIAS_HORTIFRUTI = ["Carnes", "Frutas e verduras", "Mista"] as const;

export const UNIDADES = ["kg", "g", "un", "cx", "pct", "lt", "m", "fd", "bdj", "pç"] as const;

export const SITUACOES_CONSUMO = [
  "EM COTAÇÃO",
  "EM NEGOCIAÇÃO",
  "APROVADO",
  "PEDIDO EMITIDO",
  "CONCLUÍDO",
] as const;

export const SITUACOES_HORTIFRUTI = ["EM COTAÇÃO", "PEDIDOS ENVIADOS", "CONCLUÍDO"] as const;

export const SITUACOES_EVENTO = [
  "PLANEJAMENTO",
  "EM COTAÇÃO",
  "EM NEGOCIAÇÃO",
  "APROVADO",
  "CONCLUÍDO",
] as const;

export const SITUACOES_DESPESA = ["A COTAR", "EM NEGOCIAÇÃO", "FECHADO", "PAGO"] as const;

export const UNIDADES_DESPESA = [
  "un",
  "pessoa",
  "diária",
  "quarto",
  "serviço",
  "kit",
  "passagem",
  "mb",
  "outro",
] as const;

export const CATEGORIAS_DESPESA = [
  "Palestrante",
  "Equipamentos",
  "Espaço",
  "Alimentação",
  "Coffee break",
  "Happy hour",
  "Hospedagem",
  "Deslocamentos",
  "Brindes e materiais",
  "Transmissão",
  "Outros",
] as const;

/** Modelo de treinamento: itens acrescentados sem repetir os existentes. */
export const MODELO_TREINAMENTO: { nome: string; categoria: string; unidade: string }[] = [
  { nome: "Palestrante", categoria: "Palestrante", unidade: "serviço" },
  { nome: "Camiseta", categoria: "Brindes e materiais", unidade: "un" },
  { nome: "Espaço", categoria: "Espaço", unidade: "diária" },
  { nome: "Welcome coffee", categoria: "Coffee break", unidade: "pessoa" },
  { nome: "Coffee break", categoria: "Coffee break", unidade: "pessoa" },
  { nome: "Água", categoria: "Alimentação", unidade: "un" },
  { nome: "Café", categoria: "Alimentação", unidade: "un" },
  { nome: "Link dedicado", categoria: "Equipamentos", unidade: "mb" },
  { nome: "Frigobar", categoria: "Alimentação", unidade: "un" },
  { nome: "Happy hour", categoria: "Happy hour", unidade: "pessoa" },
  { nome: "Bebida à parte", categoria: "Happy hour", unidade: "un" },
  { nome: "Hospedagem quarto duplo", categoria: "Hospedagem", unidade: "quarto" },
  { nome: "Hospedagem quarto single", categoria: "Hospedagem", unidade: "quarto" },
  { nome: "Hospedagem quarto triplo", categoria: "Hospedagem", unidade: "quarto" },
  { nome: "Estacionamento", categoria: "Deslocamentos", unidade: "diária" },
  { nome: "Cantor", categoria: "Happy hour", unidade: "serviço" },
  { nome: "Equipamentos", categoria: "Equipamentos", unidade: "serviço" },
  { nome: "Transmissão", categoria: "Transmissão", unidade: "serviço" },
  { nome: "Aéreo", categoria: "Deslocamentos", unidade: "passagem" },
  { nome: "Rodoviários", categoria: "Deslocamentos", unidade: "passagem" },
  { nome: "Transfer", categoria: "Deslocamentos", unidade: "serviço" },
];

/** Fornecedores sugeridos ao iniciar uma cotação vazia de frutas e verduras. */
export const FORNECEDORES_SUGERIDOS_HORTIFRUTI = ["Cássio", "Carlos", "Dudu Ovos"];
