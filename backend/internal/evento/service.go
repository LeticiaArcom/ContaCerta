package evento

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/db"
	"meu-projeto/internal/requisicao"
)

type Service struct{ db *gorm.DB }

func NovoService(gdb *gorm.DB) *Service { return &Service{db: gdb} }

func ptr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func centavos(v float64) float64 { return math.Round(v*100) / 100 }

func (s *Service) Listar(ctx context.Context, busca, situacao string, p requisicao.Paginacao) ([]Evento, int64, error) {
	q := s.db.WithContext(ctx).Model(&Evento{}).Where("excluido_em IS NULL")
	if situacao != "" {
		q = q.Where("situacao = ?", situacao)
	}
	if b := strings.TrimSpace(busca); b != "" {
		like := "%" + strings.ToLower(b) + "%"
		q = q.Where("(lower(nome) LIKE ? OR lower(cidade) LIKE ? OR lower(local) LIKE ? OR lower(ocs) LIKE ?)", like, like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var es []Evento
	err := q.Order("data DESC NULLS LAST, atualizado_em DESC").Limit(p.PorPagina).Offset(p.Offset()).Find(&es).Error
	return es, total, err
}

func (s *Service) Buscar(ctx context.Context, id uuid.UUID) (*Evento, error) {
	var e Evento
	err := s.db.WithContext(ctx).Where("id = ? AND excluido_em IS NULL", id).First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apierro.NaoEncontrado("Evento não encontrado.")
	}
	return &e, err
}

func preparar(e *Entrada) (map[string]any, error) {
	if e.Despesas == nil {
		e.Despesas = []Despesa{}
	}
	for i := range e.Despesas {
		d := &e.Despesas[i]
		if d.Total == nil && d.Qtd != nil && d.ValorUnitario != nil {
			t := centavos(*d.Qtd * *d.ValorUnitario)
			d.Total = &t
		}
	}
	despesas, err := json.Marshal(e.Despesas)
	if err != nil {
		return nil, err
	}
	var data any
	if e.Data != "" {
		data = e.Data
	}
	return map[string]any{
		"nome": strings.TrimSpace(e.Nome), "local": strings.TrimSpace(e.Local), "cidade": strings.TrimSpace(e.Cidade),
		"data": data, "participantes": e.Participantes, "estados": strings.TrimSpace(e.Estados),
		"ocs": strings.TrimSpace(e.OCS), "hospedados": e.Hospedados, "situacao": e.Situacao,
		"valor_orcado": centavos(e.ValorOrcado), "credito_fornecedor": centavos(e.CreditoFornecedor),
		"observacoes": strings.TrimSpace(e.Observacoes), "despesas": string(despesas),
	}, nil
}

func (s *Service) Criar(ctx context.Context, usuarioID uuid.UUID, e Entrada) (*Evento, error) {
	campos, err := preparar(&e)
	if err != nil {
		return nil, err
	}
	id := uuid.New()
	agora := time.Now().UTC()
	data, _ := db.ParseData(e.Data)
	ev := &Evento{ID: id, Nome: strings.TrimSpace(e.Nome), Situacao: e.Situacao, Data: data,
		Despesas: db.JSON("[]"), Versao: 1,
		CriadoPor: ptr(usuarioID), AtualizadoPor: ptr(usuarioID), CriadoEm: agora, AtualizadoEm: agora}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(ev).Error; err != nil {
			return err
		}
		if err := tx.Model(&Evento{}).Where("id = ?", id).Updates(campos).Error; err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "criar", "evento", id.String())
	})
	if err != nil {
		return nil, err
	}
	return s.Buscar(ctx, id)
}

func (s *Service) Atualizar(ctx context.Context, usuarioID, id uuid.UUID, e Entrada) (*Evento, error) {
	campos, err := preparar(&e)
	if err != nil {
		return nil, err
	}
	campos["versao"] = gorm.Expr("versao + 1")
	campos["atualizado_por"] = ptr(usuarioID)
	campos["atualizado_em"] = time.Now().UTC()
	sel := make([]string, 0, len(campos))
	for k := range campos {
		sel = append(sel, k)
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Evento{}).Where("id = ? AND versao = ? AND excluido_em IS NULL", id, e.Versao).Select(sel).Updates(campos)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			if _, err := s.Buscar(ctx, id); err != nil {
				return err
			}
			return apierro.VersaoDesatualizada()
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "atualizar", "evento", id.String())
	})
	if err != nil {
		return nil, err
	}
	return s.Buscar(ctx, id)
}

func (s *Service) Excluir(ctx context.Context, usuarioID, id uuid.UUID) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Evento{}).Where("id = ? AND excluido_em IS NULL", id).
			Updates(map[string]any{"excluido_em": time.Now().UTC(), "atualizado_por": ptr(usuarioID)})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.NaoEncontrado("Evento não encontrado.")
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "excluir", "evento", id.String())
	})
}
