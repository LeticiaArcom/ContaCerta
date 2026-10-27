package cotacao

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/db"
)

// Importar grava uma cotação vinda do sistema anterior (ou de um backup)
// com id fixo: se já existe, atualiza; se não, cria — nunca duplica. Não
// mexe no Resumo: os lançamentos do Resumo vêm importados à parte e ficam
// ligados a esta cotação pelo mesmo id.
func (s *Service) Importar(ctx context.Context, usuarioID, id uuid.UUID, e Entrada) (criada bool, err error) {
	if err := validarEntrada(&e); err != nil {
		return false, err
	}
	conteudo, err := json.Marshal(e.Conteudo)
	if err != nil {
		return false, err
	}
	data, _ := db.ParseData(e.Data)
	total := TotalEscolhido(Escolher(e.Modulo, e.Conteudo))
	agora := time.Now().UTC()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existente Cotacao
		erro := tx.Select("id").Where("id = ?", id).First(&existente).Error
		if erro != nil && !errors.Is(erro, gorm.ErrRecordNotFound) {
			return erro
		}
		c := Cotacao{ID: id, Modulo: e.Modulo, Categoria: e.Categoria, Formato: e.Formato,
			Titulo: strings.TrimSpace(e.Titulo), OCS: strings.TrimSpace(e.OCS), Data: data,
			Periodo: strings.TrimSpace(e.Periodo), Solicitante: strings.TrimSpace(e.Solicitante),
			CentroCusto: strings.TrimSpace(e.CentroCusto), Situacao: e.Situacao, Provisionado: e.Provisionado,
			Descricao: strings.TrimSpace(e.Descricao), Conteudo: conteudo, TotalEscolhido: total, Versao: 1,
			CriadoPor: ptr(usuarioID), AtualizadoPor: ptr(usuarioID), CriadoEm: agora, AtualizadoEm: agora}
		if errors.Is(erro, gorm.ErrRecordNotFound) {
			criada = true
			if err := tx.Create(&c).Error; err != nil {
				return err
			}
		} else {
			err := tx.Model(&Cotacao{}).Where("id = ?", id).
				Select("modulo", "categoria", "formato", "titulo", "ocs", "data", "periodo", "solicitante", "centro_custo",
					"situacao", "provisionado", "descricao", "conteudo", "total_escolhido", "versao", "atualizado_por",
					"atualizado_em", "excluido_em").
				Updates(map[string]any{"modulo": c.Modulo, "categoria": c.Categoria, "formato": c.Formato, "titulo": c.Titulo,
					"ocs": c.OCS, "data": e.Data, "periodo": c.Periodo, "solicitante": c.Solicitante,
					"centro_custo": c.CentroCusto, "situacao": c.Situacao, "provisionado": c.Provisionado,
					"descricao": c.Descricao, "conteudo": string(conteudo), "total_escolhido": total,
					"versao": gorm.Expr("versao + 1"), "atualizado_por": ptr(usuarioID), "atualizado_em": agora,
					"excluido_em": nil}).Error
			if err != nil {
				return err
			}
		}
		if err := s.aprenderFornecedores(ctx, tx, e.Conteudo); err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "importar", "cotacao", id.String())
	})
	return criada, err
}
