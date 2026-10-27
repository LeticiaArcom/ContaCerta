package compra

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/db"
	"meu-projeto/internal/fornecedor"
	"meu-projeto/internal/requisicao"
)

type Service struct{ db *gorm.DB }

func NovoService(gdb *gorm.DB) *Service { return &Service{db: gdb} }

func centavos(v float64) float64 { return math.Round(v*100) / 100 }

func ptr(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func (s *Service) filtrar(ctx context.Context, f Filtro) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&Compra{}).Where("excluido_em IS NULL")
	if f.Data != "" {
		q = q.Where("data = ?", f.Data)
	}
	if f.De != "" {
		q = q.Where("data >= ?", f.De)
	}
	if f.Ate != "" {
		q = q.Where("data <= ?", f.Ate)
	}
	if f.Provisionado != "" {
		q = q.Where("provisionado = ?", f.Provisionado)
	}
	if f.Area != "" {
		q = q.Where("area = ?", f.Area)
	}
	if f.Tipo != "" {
		q = q.Where("tipo = ?", f.Tipo)
	}
	if b := strings.TrimSpace(f.Busca); b != "" {
		like := "%" + strings.ToLower(b) + "%"
		q = q.Where("(lower(fornecedor) LIKE ? OR lower(ocs) LIKE ? OR lower(descricao) LIKE ? OR lower(area) LIKE ? OR lower(solicitante) LIKE ? OR codigo_fornecedor LIKE ?)",
			like, like, like, like, like, like)
	}
	return q
}

func validarFiltro(f Filtro) error {
	for campo, v := range map[string]string{"data": f.Data, "de": f.De, "ate": f.Ate} {
		if v == "" {
			continue
		}
		if _, err := db.ParseData(v); err != nil {
			return apierro.Validacao(map[string]string{campo: "Data inválida."})
		}
	}
	if f.Tipo != "" && f.Tipo != TipoCompra && f.Tipo != TipoOrcamento {
		return apierro.Validacao(map[string]string{"tipo": "Opção inválida."})
	}
	return nil
}

func (s *Service) Listar(ctx context.Context, f Filtro, p requisicao.Paginacao) ([]Compra, int64, error) {
	if err := validarFiltro(f); err != nil {
		return nil, 0, err
	}
	var total int64
	if err := s.filtrar(ctx, f).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var cs []Compra
	err := s.filtrar(ctx, f).Order("data DESC, area, valor DESC, criado_em DESC").
		Limit(p.PorPagina).Offset(p.Offset()).Find(&cs).Error
	return cs, total, err
}

// Totais soma só compras realizadas — orçamento não entra no valor.
func (s *Service) Totais(ctx context.Context, f Filtro) (*Totais, error) {
	if err := validarFiltro(f); err != nil {
		return nil, err
	}
	var t Totais
	err := s.filtrar(ctx, f).Where("tipo = ?", TipoCompra).
		Select("count(*) AS quantidade, coalesce(sum(valor), 0) AS valor_total").Scan(&t).Error
	return &t, err
}

func (s *Service) Sugestoes(ctx context.Context) (*Sugestoes, error) {
	distintos := func(coluna string) ([]string, error) {
		var vs []string
		// coluna vem só da lista fixa abaixo (allowlist), nunca do cliente;
		// o gorm cita o identificador com clause.Column.
		err := s.db.WithContext(ctx).Model(&Compra{}).
			Select("upper(trim(?)) AS v", clause.Column{Name: coluna}).
			Where("excluido_em IS NULL AND trim(?) NOT IN ('', '-')", clause.Column{Name: coluna}).
			Group("v").Order("count(*) DESC, v").Limit(200).Pluck("v", &vs).Error
		if vs == nil {
			vs = []string{}
		}
		return vs, err
	}
	var sg Sugestoes
	var err error
	if sg.Solicitantes, err = distintos("solicitante"); err != nil {
		return nil, err
	}
	if sg.Autorizadores, err = distintos("autorizador"); err != nil {
		return nil, err
	}
	if sg.Aprovadores, err = distintos("aprovador"); err != nil {
		return nil, err
	}
	if sg.Fornecedores, err = distintos("fornecedor"); err != nil {
		return nil, err
	}
	if sg.Prazos, err = distintos("prazo_pagamento"); err != nil {
		return nil, err
	}
	return &sg, nil
}

func (s *Service) Buscar(ctx context.Context, id string) (*Compra, error) {
	var c Compra
	err := s.db.WithContext(ctx).Where("id = ? AND excluido_em IS NULL", id).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apierro.NaoEncontrado("Lançamento não encontrado.")
	}
	return &c, err
}

func normalizar(e *Entrada) error {
	if strings.TrimSpace(e.CNPJ) != "" {
		if !fornecedor.CNPJValido(e.CNPJ) {
			return apierro.Validacao(map[string]string{"cnpj": "CNPJ inválido."})
		}
		e.CNPJ = fornecedor.FormatarCNPJ(e.CNPJ)
	} else {
		e.CNPJ = ""
	}
	e.Valor = centavos(e.Valor)
	for _, p := range []*string{&e.Solicitante, &e.Area, &e.Fornecedor, &e.OCS, &e.PrazoPagamento, &e.Autorizador, &e.Aprovador, &e.CodigoFornecedor} {
		*p = strings.TrimSpace(*p)
	}
	e.Descricao = strings.TrimSpace(e.Descricao)
	return nil
}

func (s *Service) Criar(ctx context.Context, usuarioID uuid.UUID, e Entrada) (*Compra, error) {
	if err := normalizar(&e); err != nil {
		return nil, err
	}
	data, _ := db.ParseData(e.Data)
	agora := time.Now().UTC()
	c := &Compra{
		ID: uuid.NewString(), Tipo: e.Tipo, Data: data, Solicitante: e.Solicitante, Area: e.Area, CNPJ: e.CNPJ,
		CodigoFornecedor: e.CodigoFornecedor, Fornecedor: e.Fornecedor, OCS: e.OCS, Descricao: e.Descricao,
		Valor: e.Valor, PrazoPagamento: e.PrazoPagamento, Provisionado: e.Provisionado, Autorizador: e.Autorizador,
		Aprovador: e.Aprovador, Situacao: e.Situacao, Versao: 1, CriadoPor: ptr(usuarioID), AtualizadoPor: ptr(usuarioID),
		CriadoEm: agora, AtualizadoEm: agora,
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(c).Error; err != nil {
			return err
		}
		if err := fornecedor.Aprender(ctx, tx, c.CNPJ, c.CodigoFornecedor, c.Fornecedor); err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "criar", "compra", c.ID)
	})
	return c, err
}

var camposEditaveis = []string{"tipo", "data", "solicitante", "area", "cnpj", "codigo_fornecedor", "fornecedor", "ocs",
	"descricao", "valor", "prazo_pagamento", "provisionado", "autorizador", "aprovador", "situacao",
	"versao", "atualizado_por", "atualizado_em"}

// Atualizar edita o mesmo registro (mesmo id — nunca cria duplicidade) com
// controle otimista pela versão.
func (s *Service) Atualizar(ctx context.Context, usuarioID uuid.UUID, id string, e Entrada) (*Compra, error) {
	if err := normalizar(&e); err != nil {
		return nil, err
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Compra{}).Where("id = ? AND versao = ? AND excluido_em IS NULL", id, e.Versao).
			Select(camposEditaveis).
			Updates(map[string]any{
				"tipo": e.Tipo, "data": e.Data, "solicitante": e.Solicitante, "area": e.Area, "cnpj": e.CNPJ,
				"codigo_fornecedor": e.CodigoFornecedor, "fornecedor": e.Fornecedor, "ocs": e.OCS,
				"descricao": e.Descricao, "valor": e.Valor, "prazo_pagamento": e.PrazoPagamento,
				"provisionado": e.Provisionado, "autorizador": e.Autorizador, "aprovador": e.Aprovador,
				"situacao": e.Situacao, "versao": gorm.Expr("versao + 1"), "atualizado_por": ptr(usuarioID),
				"atualizado_em": time.Now().UTC(),
			})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			if _, err := s.Buscar(ctx, id); err != nil {
				return err
			}
			return apierro.VersaoDesatualizada()
		}
		if err := fornecedor.Aprender(ctx, tx, e.CNPJ, e.CodigoFornecedor, e.Fornecedor); err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "atualizar", "compra", id)
	})
	if err != nil {
		return nil, err
	}
	return s.Buscar(ctx, id)
}

// AlterarProvisionado é a troca rápida direto na tabela do histórico.
func (s *Service) AlterarProvisionado(ctx context.Context, usuarioID uuid.UUID, id, valor string) (*Compra, error) {
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Compra{}).Where("id = ? AND excluido_em IS NULL", id).
			Select("provisionado", "versao", "atualizado_por", "atualizado_em").
			Updates(map[string]any{"provisionado": valor, "versao": gorm.Expr("versao + 1"),
				"atualizado_por": ptr(usuarioID), "atualizado_em": time.Now().UTC()})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.NaoEncontrado("Lançamento não encontrado.")
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "provisionado:"+valor, "compra", id)
	})
	if err != nil {
		return nil, err
	}
	return s.Buscar(ctx, id)
}

// Excluir é lógico (excluido_em) — o registro continua no banco pra
// auditoria e recuperação.
func (s *Service) Excluir(ctx context.Context, usuarioID uuid.UUID, id string) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Compra{}).Where("id = ? AND excluido_em IS NULL", id).
			Select("excluido_em", "atualizado_por").
			Updates(map[string]any{"excluido_em": time.Now().UTC(), "atualizado_por": ptr(usuarioID)})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.NaoEncontrado("Lançamento não encontrado.")
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "excluir", "compra", id)
	})
}

// Sincronizar mantém os lançamentos gerados por uma cotação iguais ao que a
// cotação diz hoje: cria os novos, atualiza os existentes (pela mesma
// chave — sem duplicar ao editar) e exclui os que deixaram de existir.
// Provisionado, autorizador e aprovador editados no Resumo são preservados.
func Sincronizar(ctx context.Context, tx *gorm.DB, usuarioID, cotacaoID uuid.UUID, linhas []LinhaOrigem) error {
	var atuais []Compra
	if err := tx.WithContext(ctx).Where("origem_cotacao_id = ? AND excluido_em IS NULL", cotacaoID).Find(&atuais).Error; err != nil {
		return err
	}
	porChave := make(map[string]Compra, len(atuais))
	for _, c := range atuais {
		porChave[c.OrigemChave] = c
	}
	// Lançamentos importados do sistema anterior ("legado:") são adotados
	// pela linha equivalente (mesmo fornecedor, ou o único que sobrou), em vez
	// de excluídos e recriados — assim o id e o provisionado, autorizador e
	// aprovador lançados lá continuam.
	adotar(porChave, linhas)
	agora := time.Now().UTC()
	manter := make(map[string]bool, len(linhas))
	for _, l := range linhas {
		manter[l.Chave] = true
		l.Valor = centavos(l.Valor)
		if atual, ok := porChave[l.Chave]; ok {
			err := tx.Model(&Compra{}).Where("id = ?", atual.ID).
				Select("tipo", "data", "solicitante", "area", "cnpj", "codigo_fornecedor", "fornecedor", "ocs",
					"descricao", "valor", "prazo_pagamento", "situacao", "origem_chave", "versao", "atualizado_por", "atualizado_em").
				Updates(map[string]any{
					"tipo": l.Tipo, "data": l.Data, "solicitante": l.Solicitante, "area": l.Area, "cnpj": l.CNPJ,
					"codigo_fornecedor": l.CodigoFornecedor, "fornecedor": l.Fornecedor, "ocs": l.OCS,
					"descricao": l.Descricao, "valor": l.Valor, "prazo_pagamento": l.PrazoPagamento,
					"situacao": l.Situacao, "origem_chave": l.Chave, "versao": gorm.Expr("versao + 1"),
					"atualizado_por": ptr(usuarioID), "atualizado_em": agora,
				}).Error
			if err != nil {
				return err
			}
			continue
		}
		prov := l.Provisionado
		if prov == "" {
			prov = "PENDENTE"
		}
		id := cotacaoID
		nova := &Compra{
			ID: uuid.NewString(), Tipo: l.Tipo, Data: l.Data, Solicitante: l.Solicitante, Area: l.Area, CNPJ: l.CNPJ,
			CodigoFornecedor: l.CodigoFornecedor, Fornecedor: l.Fornecedor, OCS: l.OCS, Descricao: l.Descricao,
			Valor: l.Valor, PrazoPagamento: l.PrazoPagamento, Provisionado: prov, Situacao: l.Situacao,
			OrigemCotacaoID: &id, OrigemChave: l.Chave, Versao: 1, CriadoPor: ptr(usuarioID), AtualizadoPor: ptr(usuarioID),
			CriadoEm: agora, AtualizadoEm: agora,
		}
		if err := tx.Create(nova).Error; err != nil {
			return err
		}
	}
	for chave, c := range porChave {
		if manter[chave] {
			continue
		}
		if err := tx.Model(&Compra{}).Where("id = ?", c.ID).Update("excluido_em", agora).Error; err != nil {
			return err
		}
	}
	return nil
}

// ExcluirDaOrigem apaga (logicamente) os lançamentos de uma cotação excluída.
func ExcluirDaOrigem(ctx context.Context, tx *gorm.DB, cotacaoID uuid.UUID) error {
	return tx.WithContext(ctx).Model(&Compra{}).Where("origem_cotacao_id = ? AND excluido_em IS NULL", cotacaoID).
		Update("excluido_em", time.Now().UTC()).Error
}

// adotar liga linhas novas da cotação a lançamentos "legado:" ainda sem
// par: primeiro pelo mesmo fornecedor; se sobrar exatamente um lançamento
// legado e uma linha sem par, liga os dois. Altera porChave no lugar.
func adotar(porChave map[string]Compra, linhas []LinhaOrigem) {
	var legados []string
	for chave := range porChave {
		if strings.HasPrefix(chave, "legado:") {
			legados = append(legados, chave)
		}
	}
	if len(legados) == 0 {
		return
	}
	sort.Strings(legados)
	usado := map[string]bool{}
	var semPar []LinhaOrigem
	for _, l := range linhas {
		if _, ok := porChave[l.Chave]; ok {
			continue
		}
		achou := false
		for _, k := range legados {
			if !usado[k] && l.Fornecedor != "" && strings.EqualFold(strings.TrimSpace(porChave[k].Fornecedor), strings.TrimSpace(l.Fornecedor)) {
				porChave[l.Chave] = porChave[k]
				delete(porChave, k)
				usado[k] = true
				achou = true
				break
			}
		}
		if !achou {
			semPar = append(semPar, l)
		}
	}
	var restantes []string
	for _, k := range legados {
		if !usado[k] {
			restantes = append(restantes, k)
		}
	}
	if len(restantes) == 1 && len(semPar) == 1 {
		porChave[semPar[0].Chave] = porChave[restantes[0]]
		delete(porChave, restantes[0])
	}
}
