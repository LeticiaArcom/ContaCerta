// Package cotacao cobre os dois módulos de cotação: "hortifruti" (carnes,
// frutas e verduras, com pedidos por fornecedor e acompanhamento de NF) e
// "consumo" (compras por departamento). A cotação é um documento: fornecedores,
// itens e preços ficam em `conteudo`; o cálculo da escolha (menor preço ou
// escolha manual) é feito aqui no backend — é ele que alimenta o Resumo.
package cotacao

import (
	"time"

	"github.com/google/uuid"

	"meu-projeto/internal/db"
)

const (
	ModuloHortifruti = "hortifruti"
	ModuloConsumo    = "consumo"

	FormatoLista        = "lista"
	FormatoAlternativas = "alternativas"
)

// Situações por módulo. Consumo é efetivada (vira compra no Resumo) a partir
// de APROVADO; hortifruti a partir de PEDIDOS ENVIADOS (ou quando algum
// fornecedor já tem OS).
var situacoes = map[string][]string{
	ModuloHortifruti: {"EM COTAÇÃO", "PEDIDOS ENVIADOS", "CONCLUÍDO"},
	ModuloConsumo:    {"EM COTAÇÃO", "EM NEGOCIAÇÃO", "APROVADO", "PEDIDO EMITIDO", "CONCLUÍDO"},
}

var categorias = map[string][]string{
	ModuloHortifruti: {"Carnes", "Frutas e verduras", "Mista"},
	ModuloConsumo: {"Marketing", "Informática", "Estoque", "Manutenção Patrimonial", "Almoxarifado",
		"Treinamentos", "Eventos", "Restaurante", "Administrativo", "Demais"},
}

type Cotacao struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Modulo         string     `json:"modulo"`
	Categoria      string     `json:"categoria"`
	Formato        string     `json:"formato"`
	Titulo         string     `json:"titulo"`
	OCS            string     `gorm:"column:ocs" json:"ocs"`
	Data           db.Data    `json:"data"`
	Periodo        string     `json:"periodo"`
	Solicitante    string     `json:"solicitante"`
	CentroCusto    string     `json:"centroCusto"`
	Situacao       string     `json:"situacao"`
	Provisionado   string     `json:"provisionado"`
	Descricao      string     `json:"descricao"`
	Conteudo       db.JSON    `gorm:"type:jsonb" json:"conteudo,omitempty"`
	TotalEscolhido float64    `json:"totalEscolhido"`
	PedidoID       *uuid.UUID `gorm:"type:uuid" json:"pedidoId"`
	Versao         int        `json:"versao"`
	CriadoPor      *uuid.UUID `gorm:"type:uuid" json:"-"`
	AtualizadoPor  *uuid.UUID `gorm:"type:uuid" json:"-"`
	CriadoEm       time.Time  `json:"criadoEm"`
	AtualizadoEm   time.Time  `json:"atualizadoEm"`
	ExcluidoEm     *time.Time `json:"-"`
}

func (Cotacao) TableName() string { return "cotacoes" }

// Conteudo é o documento editado pela tela.
type Conteudo struct {
	Fornecedores []FornecedorCotacao `json:"fornecedores" validate:"max=40,dive"`
	Itens        []Item              `json:"itens" validate:"max=500,dive"`
	// Pedidos por fornecedor (hortifruti): OS gerada, envio e entrada da NF.
	Pedidos map[string]*Pedido `json:"pedidos" validate:"max=40,dive"`
}

type FornecedorCotacao struct {
	ID           string `json:"id" validate:"required,max=60"`
	Nome         string `json:"nome" validate:"max=200"`
	FornecedorID string `json:"fornecedorId" validate:"max=60"`
	Codigo       string `json:"codigo" validate:"max=40"`
	CNPJ         string `json:"cnpj" validate:"max=20"`
	Contato      string `json:"contato" validate:"max=120"`
	Telefone     string `json:"telefone" validate:"max=40"`
	Email        string `json:"email" validate:"max=200"`
	Endereco     string `json:"endereco" validate:"max=300"`
	Pagamento    string `json:"pagamento" validate:"max=120"`
	Entrega      string `json:"entrega" validate:"max=120"`
	Frete        string `json:"frete" validate:"max=120"`
	Observacoes  string `json:"observacoes" validate:"max=1000"`
}

type Item struct {
	ID            string              `json:"id" validate:"required,max=60"`
	Nome          string              `json:"nome" validate:"max=300"`
	CodigoArcom   string              `json:"codigoArcom" validate:"max=40"`
	Qtd           *float64            `json:"qtd" validate:"omitempty,min=0,max=99999999"`
	Unidade       string              `json:"unidade" validate:"max=10"`
	Entrega       string              `json:"entrega" validate:"omitempty,datetime=2006-01-02"`
	ConsumoMensal *float64            `json:"consumoMensal" validate:"omitempty,min=0,max=99999999"`
	EstoqueAtual  *float64            `json:"estoqueAtual" validate:"omitempty,min=0,max=99999999"`
	Precos        map[string]*float64 `json:"precos" validate:"max=40"`
	// Selecionado é a escolha manual (por qualidade/prazo). Vazio = menor
	// preço automático. Em quantidades alternativas, a escolha manual de uma
	// linha vale pro grupo inteiro.
	Selecionado string `json:"selecionado" validate:"max=60"`
	Observacao  string `json:"observacao" validate:"max=500"`
}

type Pedido struct {
	OS         string `json:"os" validate:"max=40"`
	EnviadoEm  string `json:"enviadoEm" validate:"omitempty,datetime=2006-01-02"`
	NFNumero   string `json:"nfNumero" validate:"max=40"`
	NFData     string `json:"nfData" validate:"omitempty,datetime=2006-01-02"`
	NFLancada  bool   `json:"nfLancada"`
	Observacao string `json:"observacao" validate:"max=500"`
}

// Entrada é o corpo de POST/PUT /cotacoes.
type Entrada struct {
	Modulo       string   `json:"modulo" validate:"required,oneof=hortifruti consumo"`
	Categoria    string   `json:"categoria" validate:"required,max=60"`
	Formato      string   `json:"formato" validate:"required,oneof=lista alternativas"`
	Titulo       string   `json:"titulo" validate:"max=200"`
	OCS          string   `json:"ocs" validate:"max=40"`
	Data         string   `json:"data" validate:"required,datetime=2006-01-02"`
	Periodo      string   `json:"periodo" validate:"max=120"`
	Solicitante  string   `json:"solicitante" validate:"max=120"`
	CentroCusto  string   `json:"centroCusto" validate:"max=120"`
	Situacao     string   `json:"situacao" validate:"required,max=40"`
	Provisionado string   `json:"provisionado" validate:"required,oneof=PENDENTE SIM"`
	Descricao    string   `json:"descricao" validate:"max=4000"`
	Conteudo     Conteudo `json:"conteudo"`
	PedidoID     string   `json:"pedidoId" validate:"omitempty,uuid"`
	Versao       int      `json:"versao"`
}

type Filtro struct {
	Modulo       string
	Categoria    string
	Situacao     string
	Provisionado string
	Busca        string
	De           string
	Ate          string
}

// HistoricoCusto é um preço escolhido no passado para um código ARCOM.
type HistoricoCusto struct {
	CodigoArcom   string  `json:"codigoArcom"`
	Item          string  `json:"item"`
	Fornecedor    string  `json:"fornecedor"`
	PrecoUnitario float64 `json:"precoUnitario"`
	Quantidade    float64 `json:"quantidade"`
	Unidade       string  `json:"unidade"`
	Data          string  `json:"data"`
	CotacaoID     string  `json:"cotacaoId"`
	Titulo        string  `json:"titulo"`
}
