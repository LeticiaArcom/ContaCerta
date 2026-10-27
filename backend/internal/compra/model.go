// Package compra é o Resumo Inteligente: lançamentos de compras realizadas e
// de orçamentos (cotações em andamento), resumo diário e histórico com
// controle de provisionamento.
package compra

import (
	"time"

	"github.com/google/uuid"

	"meu-projeto/internal/db"
)

const (
	TipoCompra    = "compra"
	TipoOrcamento = "orcamento"
)

type Compra struct {
	ID               string     `gorm:"primaryKey" json:"id"`
	Tipo             string     `json:"tipo"`
	Data             db.Data    `json:"data"`
	Solicitante      string     `json:"solicitante"`
	Area             string     `json:"area"`
	CNPJ             string     `gorm:"column:cnpj" json:"cnpj"`
	CodigoFornecedor string     `json:"codigoFornecedor"`
	Fornecedor       string     `json:"fornecedor"`
	OCS              string     `gorm:"column:ocs" json:"ocs"`
	Descricao        string     `json:"descricao"`
	Valor            float64    `json:"valor"`
	PrazoPagamento   string     `json:"prazoPagamento"`
	Provisionado     string     `json:"provisionado"`
	Autorizador      string     `json:"autorizador"`
	Aprovador        string     `json:"aprovador"`
	Situacao         string     `json:"situacao"`
	OrigemCotacaoID  *uuid.UUID `gorm:"type:uuid" json:"origemCotacaoId"`
	OrigemChave      string     `json:"origemChave"`
	Versao           int        `json:"versao"`
	CriadoPor        *uuid.UUID `gorm:"type:uuid" json:"-"`
	AtualizadoPor    *uuid.UUID `gorm:"type:uuid" json:"-"`
	CriadoEm         time.Time  `json:"criadoEm"`
	AtualizadoEm     time.Time  `json:"atualizadoEm"`
	ExcluidoEm       *time.Time `json:"-"`
}

func (Compra) TableName() string { return "compras" }

// Entrada é o formulário "Lançar compra". Provisionado na interface
// operacional só aceita PENDENTE ou SIM (valores antigos, como "NÃO SE
// APLICA", são preservados na importação, mas não são criados de novo).
type Entrada struct {
	Tipo             string  `json:"tipo" validate:"required,oneof=compra orcamento"`
	Data             string  `json:"data" validate:"required,datetime=2006-01-02"`
	Solicitante      string  `json:"solicitante" validate:"max=120"`
	Area             string  `json:"area" validate:"required,max=80"`
	CNPJ             string  `json:"cnpj" validate:"max=20"`
	CodigoFornecedor string  `json:"codigoFornecedor" validate:"max=40"`
	Fornecedor       string  `json:"fornecedor" validate:"max=200"`
	OCS              string  `json:"ocs" validate:"max=40"`
	Descricao        string  `json:"descricao" validate:"max=2000"`
	Valor            float64 `json:"valor" validate:"min=0,max=999999999"`
	PrazoPagamento   string  `json:"prazoPagamento" validate:"max=120"`
	Provisionado     string  `json:"provisionado" validate:"required,oneof=PENDENTE SIM"`
	Autorizador      string  `json:"autorizador" validate:"max=120"`
	Aprovador        string  `json:"aprovador" validate:"max=120"`
	Situacao         string  `json:"situacao" validate:"max=40"`
	Versao           int     `json:"versao"`
}

type EntradaProvisionado struct {
	Provisionado string `json:"provisionado" validate:"required,oneof=PENDENTE SIM"`
}

// Filtro de listagem/histórico.
type Filtro struct {
	Data         string
	De           string
	Ate          string
	Busca        string
	Provisionado string
	Area         string
	Tipo         string
}

type Totais struct {
	Quantidade int64   `json:"quantidade"`
	ValorTotal float64 `json:"valorTotal"`
}

type Sugestoes struct {
	Solicitantes  []string `json:"solicitantes"`
	Autorizadores []string `json:"autorizadores"`
	Aprovadores   []string `json:"aprovadores"`
	Fornecedores  []string `json:"fornecedores"`
	Prazos        []string `json:"prazos"`
}

// LinhaOrigem é um lançamento gerado por uma cotação (ver Sincronizar).
type LinhaOrigem struct {
	Chave            string
	Tipo             string
	Data             db.Data
	Solicitante      string
	Area             string
	CNPJ             string
	CodigoFornecedor string
	Fornecedor       string
	OCS              string
	Descricao        string
	Valor            float64
	PrazoPagamento   string
	Provisionado     string
	Situacao         string
}
