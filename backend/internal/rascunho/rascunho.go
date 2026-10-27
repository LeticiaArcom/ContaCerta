// Package rascunho guarda o rascunho automático dos formulários, por
// usuário e por chave (ex.: "resumo-lancar", "cotacao-carnes"). Cada usuário
// só lê e grava os próprios rascunhos — o dono vem sempre da sessão, nunca
// do corpo da requisição.
package rascunho

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/db"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

type Rascunho struct {
	UsuarioID    uuid.UUID `gorm:"type:uuid;primaryKey" json:"-"`
	Chave        string    `gorm:"primaryKey" json:"chave"`
	Conteudo     db.JSON   `gorm:"type:jsonb" json:"conteudo"`
	AtualizadoEm time.Time `json:"atualizadoEm"`
}

func (Rascunho) TableName() string { return "rascunhos" }

var chaveValida = regexp.MustCompile(`^[a-z0-9-]{1,60}$`)

type Handler struct{ db *gorm.DB }

func NovoHandler(gdb *gorm.DB) *Handler { return &Handler{db: gdb} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/rascunhos/{chave}", H(h.buscar))
	r.Put("/rascunhos/{chave}", H(h.salvar))
	r.Delete("/rascunhos/{chave}", H(h.excluir))
}

func lerChave(r *http.Request) (string, error) {
	c := chi.URLParam(r, "chave")
	if !chaveValida.MatchString(c) {
		return "", apierro.NaoEncontrado("Rascunho não encontrado.")
	}
	return c, nil
}

func (h *Handler) buscar(w http.ResponseWriter, r *http.Request) error {
	chave, err := lerChave(r)
	if err != nil {
		return err
	}
	var rs Rascunho
	err = h.db.WithContext(r.Context()).Where("usuario_id = ? AND chave = ?", usuario.IDDoContexto(r.Context()), chave).First(&rs).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return apierro.NaoEncontrado("Rascunho não encontrado.")
	}
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, rs)
}

func (h *Handler) salvar(w http.ResponseWriter, r *http.Request) error {
	chave, err := lerChave(r)
	if err != nil {
		return err
	}
	var corpo struct {
		Conteudo json.RawMessage `json:"conteudo"`
	}
	if err := requisicao.Decodificar(r, &corpo); err != nil {
		return err
	}
	if len(corpo.Conteudo) == 0 || !json.Valid(corpo.Conteudo) {
		return apierro.Validacao(map[string]string{"conteudo": "Conteúdo inválido."})
	}
	rs := Rascunho{UsuarioID: usuario.IDDoContexto(r.Context()), Chave: chave, Conteudo: db.JSON(corpo.Conteudo), AtualizadoEm: time.Now().UTC()}
	err = h.db.WithContext(r.Context()).Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "usuario_id"}, {Name: "chave"}},
		DoUpdates: clause.AssignmentColumns([]string{"conteudo", "atualizado_em"}),
	}).Create(&rs).Error
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, rs)
}

func (h *Handler) excluir(w http.ResponseWriter, r *http.Request) error {
	chave, err := lerChave(r)
	if err != nil {
		return err
	}
	if err := h.db.WithContext(r.Context()).Where("usuario_id = ? AND chave = ?", usuario.IDDoContexto(r.Context()), chave).Delete(&Rascunho{}).Error; err != nil {
		return err
	}
	return requisicao.SemConteudo(w)
}
