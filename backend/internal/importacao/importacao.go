// Package importacao traz os dados do sistema anterior (Backup Geral do
// Conta Certa, versão 1) e restaura/exporta o backup deste sistema. Tudo é
// upsert pelo identificador permanente de cada registro: importar o mesmo
// arquivo duas vezes não duplica nada.
//
// O frontend lê o arquivo, normaliza e manda em lotes pequenos (o corpo da
// requisição tem limite) — por isso cada rota recebe um lote de um tipo só.
package importacao

import (
	"context"
	"errors"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/compra"
	"meu-projeto/internal/cotacao"
	"meu-projeto/internal/db"
	"meu-projeto/internal/evento"
	"meu-projeto/internal/fornecedor"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

// IDEstavel converte o id do sistema anterior (texto livre) num UUID fixo:
// o mesmo id antigo gera sempre o mesmo UUID, então reimportar atualiza em
// vez de duplicar. Se já for UUID, usa como está.
func IDEstavel(tipo, legado string) uuid.UUID {
	if id, err := uuid.Parse(legado); err == nil {
		return id
	}
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("contacerta:"+tipo+":"+legado))
}

type Resultado struct {
	Criados     int `json:"criados"`
	Atualizados int `json:"atualizados"`
}

type CompraImportada struct {
	ID               string  `json:"id" validate:"required,max=120"`
	Tipo             string  `json:"tipo" validate:"required,oneof=compra orcamento"`
	Data             string  `json:"data" validate:"required,datetime=2006-01-02"`
	Solicitante      string  `json:"solicitante" validate:"max=200"`
	Area             string  `json:"area" validate:"max=120"`
	CNPJ             string  `json:"cnpj" validate:"max=40"`
	CodigoFornecedor string  `json:"codigoFornecedor" validate:"max=60"`
	Fornecedor       string  `json:"fornecedor" validate:"max=300"`
	OCS              string  `json:"ocs" validate:"max=60"`
	Descricao        string  `json:"descricao" validate:"max=4000"`
	Valor            float64 `json:"valor" validate:"min=0,max=999999999"`
	PrazoPagamento   string  `json:"prazoPagamento" validate:"max=200"`
	Provisionado     string  `json:"provisionado" validate:"max=40"`
	Autorizador      string  `json:"autorizador" validate:"max=200"`
	Aprovador        string  `json:"aprovador" validate:"max=200"`
	Situacao         string  `json:"situacao" validate:"max=60"`
	OrigemCotacao    string  `json:"origemCotacao" validate:"max=120"`
}

type LoteCompras struct {
	Itens []CompraImportada `json:"itens" validate:"required,max=300,dive"`
}

type EventoImportado struct {
	ID string `json:"id" validate:"required,max=120"`
	evento.Entrada
}

type LoteEventos struct {
	Itens []EventoImportado `json:"itens" validate:"required,max=100,dive"`
}

type FornecedorImportado struct {
	CNPJ   string `json:"cnpj" validate:"max=40"`
	Codigo string `json:"codigo" validate:"max=60"`
	Nome   string `json:"nome" validate:"required,max=300"`
}

type LoteFornecedores struct {
	Itens []FornecedorImportado `json:"itens" validate:"required,max=1000,dive"`
}

type CotacaoImportada struct {
	ID string `json:"id" validate:"required,max=120"`
	cotacao.Entrada
}

type LoteCotacoes struct {
	Itens []CotacaoImportada `json:"itens" validate:"required,max=40,dive"`
}

type Handler struct {
	db       *gorm.DB
	cotacoes *cotacao.Service
}

func NovoHandler(gdb *gorm.DB, cotacoes *cotacao.Service) *Handler {
	return &Handler{db: gdb, cotacoes: cotacoes}
}

// Rotas de administração (papel compras).
func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Post("/importacao/compras", H(h.compras))
	r.Post("/importacao/eventos", H(h.eventos))
	r.Post("/importacao/fornecedores", H(h.fornecedores))
	r.Post("/importacao/cotacoes", H(h.cotacoesLote))
	r.Get("/backup", H(h.backup))
}

func (h *Handler) compras(w http.ResponseWriter, r *http.Request) error {
	var lote LoteCompras
	if err := requisicao.Decodificar(r, &lote); err != nil {
		return err
	}
	ctx := r.Context()
	uid := usuario.IDDoContexto(ctx)
	var res Resultado
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, c := range lote.Itens {
			criado, err := upsertCompra(ctx, tx, uid, c)
			if err != nil {
				return err
			}
			if criado {
				res.Criados++
			} else {
				res.Atualizados++
			}
		}
		return auditoria.Registrar(ctx, tx, uid, "importar_lote", "compra", time.Now().UTC().Format(time.RFC3339))
	})
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, res)
}

func limpar(s string) string { return strings.TrimSpace(s) }

func upsertCompra(ctx context.Context, tx *gorm.DB, uid uuid.UUID, c CompraImportada) (bool, error) {
	data, _ := db.ParseData(c.Data)
	cnpj := limpar(c.CNPJ)
	if cnpj != "" && fornecedor.CNPJValido(cnpj) {
		cnpj = fornecedor.FormatarCNPJ(cnpj)
	}
	var origem *uuid.UUID
	if c.OrigemCotacao != "" {
		id := IDEstavel("cotacao", c.OrigemCotacao)
		var n int64
		if err := tx.Table("cotacoes").Where("id = ?", id).Count(&n).Error; err != nil {
			return false, err
		}
		if n > 0 {
			origem = &id
		}
	}
	prov := limpar(c.Provisionado)
	if prov == "" {
		prov = "-"
	}
	agora := time.Now().UTC()
	var uidPtr *uuid.UUID
	if uid != uuid.Nil {
		uidPtr = &uid
	}
	linha := compra.Compra{
		ID: limpar(c.ID), Tipo: c.Tipo, Data: data, Solicitante: limpar(c.Solicitante), Area: limpar(c.Area),
		CNPJ: cnpj, CodigoFornecedor: limpar(c.CodigoFornecedor), Fornecedor: limpar(c.Fornecedor), OCS: limpar(c.OCS),
		Descricao: limpar(c.Descricao), Valor: math.Round(c.Valor*100) / 100, PrazoPagamento: limpar(c.PrazoPagamento),
		Provisionado: prov, Autorizador: limpar(c.Autorizador), Aprovador: limpar(c.Aprovador), Situacao: limpar(c.Situacao),
		OrigemCotacaoID: origem, Versao: 1, CriadoPor: uidPtr, AtualizadoPor: uidPtr, CriadoEm: agora, AtualizadoEm: agora,
	}
	if origem != nil {
		// Chave "legado": na próxima edição da cotação, a sincronização do
		// Resumo substitui este lançamento pelos atuais — sem duplicar.
		linha.OrigemChave = "legado:" + linha.ID
	}
	var existente int64
	if err := tx.Model(&compra.Compra{}).Where("id = ?", linha.ID).Count(&existente).Error; err != nil {
		return false, err
	}
	err := tx.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "id"}},
		DoUpdates: clause.AssignmentColumns([]string{"tipo", "data", "solicitante", "area", "cnpj", "codigo_fornecedor",
			"fornecedor", "ocs", "descricao", "valor", "prazo_pagamento", "provisionado", "autorizador", "aprovador",
			"situacao", "origem_cotacao_id", "origem_chave", "atualizado_por", "atualizado_em"}),
	}).Create(&linha).Error
	if err != nil {
		return false, err
	}
	if err := fornecedor.Aprender(ctx, tx, linha.CNPJ, linha.CodigoFornecedor, linha.Fornecedor); err != nil {
		return false, err
	}
	return existente == 0, nil
}

func (h *Handler) eventos(w http.ResponseWriter, r *http.Request) error {
	var lote LoteEventos
	if err := requisicao.Decodificar(r, &lote); err != nil {
		return err
	}
	ctx := r.Context()
	uid := usuario.IDDoContexto(ctx)
	svc := evento.NovoService(h.db)
	var res Resultado
	for _, ev := range lote.Itens {
		id := IDEstavel("evento", ev.ID)
		atual, err := svc.Buscar(ctx, id)
		var ed *apierro.ErroDominio
		switch {
		case err == nil:
			ev.Versao = atual.Versao
			if _, err := svc.Atualizar(ctx, uid, id, ev.Entrada); err != nil {
				return err
			}
			res.Atualizados++
		case errors.As(err, &ed) && ed.Status == http.StatusNotFound:
			if err := criarEventoComID(ctx, h.db, uid, id, ev.Entrada); err != nil {
				return err
			}
			res.Criados++
		default:
			return err
		}
	}
	return requisicao.JSON(w, http.StatusOK, res)
}

func criarEventoComID(ctx context.Context, gdb *gorm.DB, uid, id uuid.UUID, e evento.Entrada) error {
	agora := time.Now().UTC()
	// Pode existir como excluído: reativa em vez de colidir na chave.
	if err := gdb.WithContext(ctx).Where("id = ? AND excluido_em IS NOT NULL", id).Delete(&evento.Evento{}).Error; err != nil {
		return err
	}
	ev := &evento.Evento{ID: id, Nome: e.Nome, Situacao: e.Situacao, Despesas: db.JSON("[]"), Versao: 1, CriadoEm: agora, AtualizadoEm: agora}
	if err := gdb.WithContext(ctx).Create(ev).Error; err != nil {
		return err
	}
	e.Versao = 1
	_, err := evento.NovoService(gdb).Atualizar(ctx, uid, id, e)
	return err
}

func (h *Handler) fornecedores(w http.ResponseWriter, r *http.Request) error {
	var lote LoteFornecedores
	if err := requisicao.Decodificar(r, &lote); err != nil {
		return err
	}
	ctx := r.Context()
	err := h.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, f := range lote.Itens {
			if err := fornecedor.Aprender(ctx, tx, f.CNPJ, f.Codigo, f.Nome); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, Resultado{Atualizados: len(lote.Itens)})
}

func (h *Handler) cotacoesLote(w http.ResponseWriter, r *http.Request) error {
	var lote LoteCotacoes
	if err := requisicao.Decodificar(r, &lote); err != nil {
		return err
	}
	ctx := r.Context()
	uid := usuario.IDDoContexto(ctx)
	var res Resultado
	for _, c := range lote.Itens {
		criada, err := h.cotacoes.Importar(ctx, uid, IDEstavel("cotacao", c.ID), c.Entrada)
		if err != nil {
			return err
		}
		if criada {
			res.Criados++
		} else {
			res.Atualizados++
		}
	}
	return requisicao.JSON(w, http.StatusOK, res)
}

// Backup é o arquivo completo deste sistema (formato conta-certa-backup,
// versão 2). Pode ser restaurado pela mesma tela de importação.
type Backup struct {
	Formato      string                  `json:"formato"`
	Versao       int                     `json:"versao"`
	GeradoEm     time.Time               `json:"geradoEm"`
	Compras      []compra.Compra         `json:"compras"`
	Cotacoes     []cotacao.Cotacao       `json:"cotacoes"`
	Eventos      []evento.Evento         `json:"eventos"`
	Fornecedores []fornecedor.Fornecedor `json:"fornecedores"`
}

func (h *Handler) backup(w http.ResponseWriter, r *http.Request) error {
	ctx := r.Context()
	b := Backup{Formato: "conta-certa-backup", Versao: 2, GeradoEm: time.Now().UTC()}
	q := h.db.WithContext(ctx)
	if err := q.Where("excluido_em IS NULL").Order("data, criado_em").Find(&b.Compras).Error; err != nil {
		return err
	}
	if err := q.Where("excluido_em IS NULL").Order("data, criado_em").Find(&b.Cotacoes).Error; err != nil {
		return err
	}
	if err := q.Where("excluido_em IS NULL").Order("criado_em").Find(&b.Eventos).Error; err != nil {
		return err
	}
	if err := q.Order("nome").Find(&b.Fornecedores).Error; err != nil {
		return err
	}
	if err := auditoria.Registrar(ctx, h.db, usuario.IDDoContexto(ctx), "exportar", "backup", b.GeradoEm.Format(time.RFC3339)); err != nil {
		return err
	}
	w.Header().Set("Content-Disposition", `attachment; filename="conta-certa-backup-`+b.GeradoEm.Format("2006-01-02")+`.json"`)
	return requisicao.JSON(w, http.StatusOK, b)
}
