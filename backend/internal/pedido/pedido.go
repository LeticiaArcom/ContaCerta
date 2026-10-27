// Package pedido é o pedido semanal que o time do restaurante preenche
// (itens, quantidades, unidade e data de entrega). A compradora recebe o
// pedido e transforma em cotação de carnes e verduras (ver cotacao).
//
// Regra de acesso: o papel "restaurante" só vê e edita os próprios pedidos,
// e só enquanto não viraram cotação. O papel "compras" vê todos.
package pedido

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/db"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

const (
	SituacaoRascunho  = "RASCUNHO"
	SituacaoEnviado   = "ENVIADO"
	SituacaoEmCotacao = "EM COTAÇÃO"
)

type Pedido struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	Categoria     string     `json:"categoria"`
	Periodo       string     `json:"periodo"`
	Observacao    string     `json:"observacao"`
	Itens         db.JSON    `gorm:"type:jsonb" json:"itens"`
	Situacao      string     `json:"situacao"`
	CotacaoID     *uuid.UUID `gorm:"type:uuid" json:"cotacaoId"`
	Versao        int        `json:"versao"`
	CriadoPor     uuid.UUID  `gorm:"type:uuid" json:"criadoPor"`
	CriadoPorNome string     `gorm:"->;-:migration" json:"criadoPorNome"`
	CriadoEm      time.Time  `json:"criadoEm"`
	AtualizadoEm  time.Time  `json:"atualizadoEm"`
	ExcluidoEm    *time.Time `json:"-"`
}

func (Pedido) TableName() string { return "pedidos_restaurante" }

type ItemPedido struct {
	ID         string   `json:"id" validate:"required,max=60"`
	Nome       string   `json:"nome" validate:"required,max=300"`
	Qtd        *float64 `json:"qtd" validate:"omitempty,min=0,max=99999999"`
	Unidade    string   `json:"unidade" validate:"max=10"`
	Entrega    string   `json:"entrega" validate:"omitempty,datetime=2006-01-02"`
	Observacao string   `json:"observacao" validate:"max=500"`
}

type Entrada struct {
	Categoria  string       `json:"categoria" validate:"required,oneof='Carnes' 'Frutas e verduras' 'Mista'"`
	Periodo    string       `json:"periodo" validate:"max=120"`
	Observacao string       `json:"observacao" validate:"max=2000"`
	Itens      []ItemPedido `json:"itens" validate:"required,min=1,max=300,dive"`
	Enviar     bool         `json:"enviar"`
	Versao     int          `json:"versao"`
}

type Handler struct{ db *gorm.DB }

func NovoHandler(gdb *gorm.DB) *Handler { return &Handler{db: gdb} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/pedidos-restaurante", H(h.listar))
	r.Get("/pedidos-restaurante/{id}", H(h.buscar))
	r.Post("/pedidos-restaurante", H(h.criar))
	r.Put("/pedidos-restaurante/{id}", H(h.atualizar))
	r.Delete("/pedidos-restaurante/{id}", H(h.excluir))
}

func (h *Handler) base(ctx context.Context) *gorm.DB {
	return h.db.WithContext(ctx).Model(&Pedido{}).
		Select("pedidos_restaurante.*, usuarios.nome AS criado_por_nome").
		Joins("JOIN usuarios ON usuarios.id = pedidos_restaurante.criado_por").
		Where("pedidos_restaurante.excluido_em IS NULL")
}

// carregar busca o pedido e confere posse: restaurante só enxerga o que criou.
func (h *Handler) carregar(ctx context.Context, idTexto string) (*Pedido, error) {
	id, err := uuid.Parse(idTexto)
	if err != nil {
		return nil, apierro.NaoEncontrado("Pedido não encontrado.")
	}
	var p Pedido
	err = h.base(ctx).Where("pedidos_restaurante.id = ?", id).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apierro.NaoEncontrado("Pedido não encontrado.")
	}
	if err != nil {
		return nil, err
	}
	u := usuario.DoContexto(ctx)
	if u.Papel != usuario.PapelCompras && p.CriadoPor != u.ID {
		return nil, apierro.NaoEncontrado("Pedido não encontrado.")
	}
	return &p, nil
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	p, err := requisicao.LerPaginacao(r)
	if err != nil {
		return err
	}
	u := usuario.DoContexto(r.Context())
	q := h.base(r.Context())
	if u.Papel != usuario.PapelCompras {
		q = q.Where("pedidos_restaurante.criado_por = ?", u.ID)
	} else {
		// Rascunho é da pessoa do restaurante até ela enviar.
		q = q.Where("pedidos_restaurante.situacao <> ?", SituacaoRascunho)
	}
	if s := r.URL.Query().Get("situacao"); s != "" {
		q = q.Where("pedidos_restaurante.situacao = ?", s)
	}
	var total int64
	if err := q.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return err
	}
	var ps []Pedido
	if err := q.Order("pedidos_restaurante.criado_em DESC").Limit(p.PorPagina).Offset(p.Offset()).Find(&ps).Error; err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(ps, p, total))
}

func (h *Handler) buscar(w http.ResponseWriter, r *http.Request) error {
	p, err := h.carregar(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, p)
}

func normalizar(e *Entrada) ([]byte, string) {
	for i := range e.Itens {
		e.Itens[i].Nome = strings.TrimSpace(e.Itens[i].Nome)
	}
	itens, _ := json.Marshal(e.Itens)
	situacao := SituacaoRascunho
	if e.Enviar {
		situacao = SituacaoEnviado
	}
	return itens, situacao
}

func (h *Handler) criar(w http.ResponseWriter, r *http.Request) error {
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	ctx := r.Context()
	itens, situacao := normalizar(&e)
	agora := time.Now().UTC()
	p := &Pedido{ID: uuid.New(), Categoria: e.Categoria, Periodo: strings.TrimSpace(e.Periodo),
		Observacao: strings.TrimSpace(e.Observacao), Itens: itens, Situacao: situacao, Versao: 1,
		CriadoPor: usuario.IDDoContexto(ctx), CriadoEm: agora, AtualizadoEm: agora}
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Omit("CriadoPorNome").Create(p).Error; err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, p.CriadoPor, "criar", "pedido_restaurante", p.ID.String())
	})
	if err != nil {
		return err
	}
	criado, err := h.carregar(ctx, p.ID.String())
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusCreated, criado)
}

func (h *Handler) atualizar(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	atual, err := h.carregar(ctx, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	if atual.CotacaoID != nil {
		return apierro.Regra("Este pedido já virou cotação e não pode mais ser alterado.")
	}
	itens, situacao := normalizar(&e)
	// Pedido já enviado continua enviado mesmo se salvarem sem "enviar".
	if atual.Situacao == SituacaoEnviado {
		situacao = SituacaoEnviado
	}
	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Pedido{}).Where("id = ? AND versao = ? AND cotacao_id IS NULL", atual.ID, e.Versao).
			Select("categoria", "periodo", "observacao", "itens", "situacao", "versao", "atualizado_em").
			Updates(map[string]any{"categoria": e.Categoria, "periodo": strings.TrimSpace(e.Periodo),
				"observacao": strings.TrimSpace(e.Observacao), "itens": string(itens), "situacao": situacao,
				"versao": gorm.Expr("versao + 1"), "atualizado_em": time.Now().UTC()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.VersaoDesatualizada()
		}
		return auditoria.Registrar(ctx, tx, usuario.IDDoContexto(ctx), "atualizar", "pedido_restaurante", atual.ID.String())
	})
	if err != nil {
		return err
	}
	p, err := h.carregar(ctx, atual.ID.String())
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, p)
}

func (h *Handler) excluir(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	atual, err := h.carregar(ctx, chi.URLParam(r, "id"))
	if err != nil {
		return err
	}
	if atual.CotacaoID != nil {
		return apierro.Regra("Este pedido já virou cotação. Exclua a cotação antes.")
	}
	err = h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&Pedido{}).Where("id = ?", atual.ID).Update("excluido_em", time.Now().UTC()).Error; err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuario.IDDoContexto(ctx), "excluir", "pedido_restaurante", atual.ID.String())
	})
	if err != nil {
		return err
	}
	return requisicao.SemConteudo(w)
}
