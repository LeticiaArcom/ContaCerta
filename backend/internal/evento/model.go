// Package evento é o Acompanhamento de Eventos: dados do evento (nome, data,
// cidade, local, participantes, hospedagens) e o lançamento de todas as
// despesas (equipamentos, palestrante, deslocamentos, happy hour, coffee
// break...), com orçado x efetivo.
package evento

import (
	"time"

	"github.com/google/uuid"

	"meu-projeto/internal/db"
)

type Evento struct {
	ID                uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Nome              string     `json:"nome"`
	Local             string     `json:"local"`
	Cidade            string     `json:"cidade"`
	Data              db.Data    `json:"data"`
	Participantes     int        `json:"participantes"`
	Estados           string     `json:"estados"`
	OCS               string     `gorm:"column:ocs" json:"ocs"`
	Hospedados        int        `json:"hospedados"`
	Situacao          string     `json:"situacao"`
	ValorOrcado       float64    `json:"valorOrcado"`
	CreditoFornecedor float64    `json:"creditoFornecedor"`
	Observacoes       string     `json:"observacoes"`
	Despesas          db.JSON    `gorm:"type:jsonb" json:"despesas"`
	Versao            int        `json:"versao"`
	CriadoPor         *uuid.UUID `gorm:"type:uuid" json:"-"`
	AtualizadoPor     *uuid.UUID `gorm:"type:uuid" json:"-"`
	CriadoEm          time.Time  `json:"criadoEm"`
	AtualizadoEm      time.Time  `json:"atualizadoEm"`
	ExcluidoEm        *time.Time `json:"-"`
}

func (Evento) TableName() string { return "eventos" }

type Despesa struct {
	ID            string   `json:"id" validate:"required,max=60"`
	Categoria     string   `json:"categoria" validate:"max=60"`
	Nome          string   `json:"nome" validate:"max=200"`
	Fornecedor    string   `json:"fornecedor" validate:"max=200"`
	Qtd           *float64 `json:"qtd" validate:"omitempty,min=0,max=99999999"`
	Unidade       string   `json:"unidade" validate:"max=20"`
	ValorUnitario *float64 `json:"valorUnitario" validate:"omitempty,min=0,max=999999999"`
	// Total é qtd x valor unitário, mas pode ser ajustado à mão.
	Total    *float64 `json:"total" validate:"omitempty,min=0,max=999999999"`
	Situacao string   `json:"situacao" validate:"omitempty,oneof='A COTAR' 'EM NEGOCIAÇÃO' 'FECHADO' 'PAGO'"`
	OCS      string   `json:"ocs" validate:"max=40"`
}

type Entrada struct {
	Nome              string    `json:"nome" validate:"required,max=200"`
	Local             string    `json:"local" validate:"max=200"`
	Cidade            string    `json:"cidade" validate:"max=120"`
	Data              string    `json:"data" validate:"omitempty,datetime=2006-01-02"`
	Participantes     int       `json:"participantes" validate:"min=0,max=1000000"`
	Estados           string    `json:"estados" validate:"max=200"`
	OCS               string    `json:"ocs" validate:"max=40"`
	Hospedados        int       `json:"hospedados" validate:"min=0,max=1000000"`
	Situacao          string    `json:"situacao" validate:"required,oneof='PLANEJAMENTO' 'EM COTAÇÃO' 'EM NEGOCIAÇÃO' 'APROVADO' 'CONCLUÍDO'"`
	ValorOrcado       float64   `json:"valorOrcado" validate:"min=0,max=999999999"`
	CreditoFornecedor float64   `json:"creditoFornecedor" validate:"min=0,max=999999999"`
	Observacoes       string    `json:"observacoes" validate:"max=4000"`
	Despesas          []Despesa `json:"despesas" validate:"max=500,dive"`
	Versao            int       `json:"versao"`
}
