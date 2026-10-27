// Package fornecedor é o cadastro de fornecedores (código, CNPJ, nome e dados
// comerciais) e a consulta que preenche o fornecedor a partir do CNPJ ou do
// código — primeiro no cadastro aprendido, depois no histórico de compras e,
// por fim, na BrasilAPI.
package fornecedor

import (
	"time"

	"github.com/google/uuid"
)

type Fornecedor struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Codigo       string    `json:"codigo"`
	CNPJ         string    `gorm:"column:cnpj" json:"cnpj"`
	Nome         string    `json:"nome"`
	Contato      string    `json:"contato"`
	Telefone     string    `json:"telefone"`
	Email        string    `json:"email"`
	Endereco     string    `json:"endereco"`
	Versao       int       `json:"versao"`
	CriadoEm     time.Time `json:"criadoEm"`
	AtualizadoEm time.Time `json:"atualizadoEm"`
}

func (Fornecedor) TableName() string { return "fornecedores" }

type Entrada struct {
	Codigo   string `json:"codigo" validate:"max=40"`
	CNPJ     string `json:"cnpj" validate:"max=20"`
	Nome     string `json:"nome" validate:"required,max=200"`
	Contato  string `json:"contato" validate:"max=120"`
	Telefone string `json:"telefone" validate:"max=40"`
	Email    string `json:"email" validate:"omitempty,email,max=200"`
	Endereco string `json:"endereco" validate:"max=300"`
	Versao   int    `json:"versao"`
}

// Consulta é a resposta de GET /fornecedores/consulta.
type Consulta struct {
	Encontrado bool   `json:"encontrado"`
	Origem     string `json:"origem"` // cadastro | historico | brasilapi
	Nome       string `json:"nome"`
	CNPJ       string `json:"cnpj"`
	Codigo     string `json:"codigo"`
	Aviso      string `json:"aviso,omitempty"`
}
