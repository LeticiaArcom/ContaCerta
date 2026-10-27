package usuario

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

const (
	PapelCompras     = "compras"
	PapelRestaurante = "restaurante"
)

// Usuario é a linha da tabela usuarios. senha_hash nunca sai no JSON.
type Usuario struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Nome         string    `json:"nome"`
	Email        string    `json:"email"`
	SenhaHash    string    `json:"-"`
	Papel        string    `json:"papel"`
	Ativo        bool      `json:"ativo"`
	CriadoEm     time.Time `json:"criadoEm"`
	AtualizadoEm time.Time `json:"atualizadoEm"`
}

// LogValue mascara o e-mail — PII nunca vai crua pro log (10-seguranca.md).
func (u Usuario) LogValue() slog.Value {
	return slog.GroupValue(slog.String("id", u.ID.String()), slog.String("papel", u.Papel))
}

type sessaoDB struct {
	TokenHash []byte `gorm:"primaryKey"`
	UsuarioID uuid.UUID
	ExpiraEm  time.Time
	CriadoEm  time.Time
}

func (sessaoDB) TableName() string { return "sessoes" }

// EntradaLogin é o corpo de POST /sessao.
type EntradaLogin struct {
	Email string `json:"email" validate:"required,email,max=200"`
	Senha string `json:"senha" validate:"required,max=200"`
}

// EntradaConfiguracaoInicial cria a primeira conta (só existe enquanto não
// há nenhum usuário cadastrado).
type EntradaConfiguracaoInicial struct {
	Nome  string `json:"nome" validate:"required,min=2,max=120"`
	Email string `json:"email" validate:"required,email,max=200"`
	Senha string `json:"senha" validate:"required,min=10,max=200"`
}

// EntradaUsuario cria um usuário (só papel compras pode).
type EntradaUsuario struct {
	Nome  string `json:"nome" validate:"required,min=2,max=120"`
	Email string `json:"email" validate:"required,email,max=200"`
	Senha string `json:"senha" validate:"required,min=10,max=200"`
	Papel string `json:"papel" validate:"required,oneof=compras restaurante"`
}

// EntradaAtualizarUsuario: senha vazia = mantém a atual.
type EntradaAtualizarUsuario struct {
	Nome  string `json:"nome" validate:"required,min=2,max=120"`
	Papel string `json:"papel" validate:"required,oneof=compras restaurante"`
	Ativo bool   `json:"ativo"`
	Senha string `json:"senha" validate:"omitempty,min=10,max=200"`
}

type chaveContexto struct{}

// ComUsuario guarda o usuário autenticado no contexto da requisição.
func ComUsuario(ctx context.Context, u *Usuario) context.Context {
	return context.WithValue(ctx, chaveContexto{}, u)
}

// DoContexto devolve o usuário autenticado. Só é nil fora do grupo de rotas
// protegidas — os handlers de feature sempre rodam dentro dele.
func DoContexto(ctx context.Context) *Usuario {
	u, _ := ctx.Value(chaveContexto{}).(*Usuario)
	return u
}

// IDDoContexto é o atalho pra auditoria/criado_por.
func IDDoContexto(ctx context.Context) uuid.UUID {
	if u := DoContexto(ctx); u != nil {
		return u.ID
	}
	return uuid.Nil
}
