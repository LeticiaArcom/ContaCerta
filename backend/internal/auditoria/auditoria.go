// Package auditoria grava quem fez o quê em qual registro (criação, edição,
// exclusão, importação). Só escrita — a leitura é por SQL quando precisar
// investigar.
package auditoria

import (
	"context"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type registro struct {
	UsuarioID  *uuid.UUID
	Acao       string
	Entidade   string
	EntidadeID string
}

func (registro) TableName() string { return "auditoria" }

// Registrar grava a ação dentro da mesma transação da alteração (tx), pra
// nunca existir alteração sem rastro nem rastro sem alteração.
func Registrar(ctx context.Context, tx *gorm.DB, usuarioID uuid.UUID, acao, entidade, entidadeID string) error {
	var u *uuid.UUID
	if usuarioID != uuid.Nil {
		u = &usuarioID
	}
	return tx.WithContext(ctx).Create(&registro{UsuarioID: u, Acao: acao, Entidade: entidade, EntidadeID: entidadeID}).Error
}
