package cotacao

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/compra"
	"meu-projeto/internal/db"
	"meu-projeto/internal/fornecedor"
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

func validarEntrada(e *Entrada) error {
	campos := map[string]string{}
	if !slices.Contains(situacoes[e.Modulo], e.Situacao) {
		campos["situacao"] = "Situação inválida."
	}
	if !slices.Contains(categorias[e.Modulo], e.Categoria) {
		campos["categoria"] = "Opção inválida."
	}
	if err := requisicao.Validar(&e.Conteudo); err != nil {
		var ed *apierro.ErroDominio
		if errors.As(err, &ed) {
			for k, v := range ed.Campos {
				campos["conteudo."+k] = v
			}
		}
		if len(campos) == 0 {
			campos["conteudo"] = "Conteúdo inválido."
		}
	}
	vistos := map[string]bool{}
	for _, f := range e.Conteudo.Fornecedores {
		if vistos[f.ID] {
			campos["conteudo.fornecedores"] = "Fornecedor repetido."
		}
		vistos[f.ID] = true
	}
	if len(campos) > 0 {
		return apierro.Validacao(campos)
	}
	for i := range e.Conteudo.Fornecedores {
		f := &e.Conteudo.Fornecedores[i]
		f.Nome = strings.TrimSpace(f.Nome)
		if f.CNPJ != "" && fornecedor.CNPJValido(f.CNPJ) {
			f.CNPJ = fornecedor.FormatarCNPJ(f.CNPJ)
		}
	}
	// Preço de fornecedor removido não fica órfão no documento.
	for i := range e.Conteudo.Itens {
		it := &e.Conteudo.Itens[i]
		for fid := range it.Precos {
			if !vistos[fid] {
				delete(it.Precos, fid)
			}
		}
		if it.Selecionado != "" && !vistos[it.Selecionado] {
			it.Selecionado = ""
		}
	}
	for fid := range e.Conteudo.Pedidos {
		if !vistos[fid] || e.Conteudo.Pedidos[fid] == nil {
			delete(e.Conteudo.Pedidos, fid)
		}
	}
	if e.Conteudo.Fornecedores == nil {
		e.Conteudo.Fornecedores = []FornecedorCotacao{}
	}
	if e.Conteudo.Itens == nil {
		e.Conteudo.Itens = []Item{}
	}
	if e.Conteudo.Pedidos == nil {
		e.Conteudo.Pedidos = map[string]*Pedido{}
	}
	return nil
}

func (s *Service) filtrar(ctx context.Context, f Filtro) *gorm.DB {
	q := s.db.WithContext(ctx).Model(&Cotacao{}).Where("excluido_em IS NULL")
	if f.Modulo != "" {
		q = q.Where("modulo = ?", f.Modulo)
	}
	if f.Categoria != "" {
		q = q.Where("categoria = ?", f.Categoria)
	}
	if f.Situacao != "" {
		q = q.Where("situacao = ?", f.Situacao)
	}
	if f.Provisionado != "" {
		q = q.Where("provisionado = ?", f.Provisionado)
	}
	if f.De != "" {
		q = q.Where("data >= ?", f.De)
	}
	if f.Ate != "" {
		q = q.Where("data <= ?", f.Ate)
	}
	if b := strings.TrimSpace(f.Busca); b != "" {
		like := "%" + strings.ToLower(b) + "%"
		q = q.Where("(lower(titulo) LIKE ? OR lower(ocs) LIKE ? OR lower(descricao) LIKE ? OR lower(solicitante) LIKE ? OR lower(conteudo::text) LIKE ?)",
			like, like, like, like, like)
	}
	return q
}

// Listar devolve as cotações sem o documento (conteúdo) — a tela de
// histórico só precisa do cabeçalho; o documento vem em Buscar.
func (s *Service) Listar(ctx context.Context, f Filtro, p requisicao.Paginacao) ([]Cotacao, int64, error) {
	for campo, v := range map[string]string{"de": f.De, "ate": f.Ate} {
		if v == "" {
			continue
		}
		if _, err := db.ParseData(v); err != nil {
			return nil, 0, apierro.Validacao(map[string]string{campo: "Data inválida."})
		}
	}
	var total int64
	if err := s.filtrar(ctx, f).Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var cs []Cotacao
	err := s.filtrar(ctx, f).Omit("conteudo").Order("data DESC, atualizado_em DESC").
		Limit(p.PorPagina).Offset(p.Offset()).Find(&cs).Error
	return cs, total, err
}

func (s *Service) Buscar(ctx context.Context, id uuid.UUID) (*Cotacao, error) {
	var c Cotacao
	err := s.db.WithContext(ctx).Where("id = ? AND excluido_em IS NULL", id).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, apierro.NaoEncontrado("Cotação não encontrada.")
	}
	return &c, err
}

func (s *Service) Criar(ctx context.Context, usuarioID uuid.UUID, e Entrada) (*Cotacao, error) {
	return s.salvar(ctx, usuarioID, uuid.New(), e, true)
}

func (s *Service) Atualizar(ctx context.Context, usuarioID, id uuid.UUID, e Entrada) (*Cotacao, error) {
	return s.salvar(ctx, usuarioID, id, e, false)
}

func (s *Service) salvar(ctx context.Context, usuarioID, id uuid.UUID, e Entrada, nova bool) (*Cotacao, error) {
	if err := validarEntrada(&e); err != nil {
		return nil, err
	}
	conteudo, err := json.Marshal(e.Conteudo)
	if err != nil {
		return nil, err
	}
	data, _ := db.ParseData(e.Data)
	escolhas := Escolher(e.Modulo, e.Conteudo)
	total := TotalEscolhido(escolhas)
	var pedidoID *uuid.UUID
	if e.PedidoID != "" {
		p := uuid.MustParse(e.PedidoID)
		pedidoID = &p
	}
	agora := time.Now().UTC()

	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		campos := map[string]any{
			"modulo": e.Modulo, "categoria": e.Categoria, "formato": e.Formato, "titulo": strings.TrimSpace(e.Titulo),
			"ocs": strings.TrimSpace(e.OCS), "data": e.Data, "periodo": strings.TrimSpace(e.Periodo),
			"solicitante": strings.TrimSpace(e.Solicitante), "centro_custo": strings.TrimSpace(e.CentroCusto),
			"situacao": e.Situacao, "provisionado": e.Provisionado, "descricao": strings.TrimSpace(e.Descricao),
			"conteudo": string(conteudo), "total_escolhido": total, "atualizado_por": ptr(usuarioID), "atualizado_em": agora,
		}
		if nova {
			c := &Cotacao{ID: id, Modulo: e.Modulo, Categoria: e.Categoria, Formato: e.Formato,
				Titulo: strings.TrimSpace(e.Titulo), OCS: strings.TrimSpace(e.OCS), Data: data, Periodo: strings.TrimSpace(e.Periodo),
				Solicitante: strings.TrimSpace(e.Solicitante), CentroCusto: strings.TrimSpace(e.CentroCusto),
				Situacao: e.Situacao, Provisionado: e.Provisionado, Descricao: strings.TrimSpace(e.Descricao),
				Conteudo: conteudo, TotalEscolhido: total, PedidoID: pedidoID, Versao: 1,
				CriadoPor: ptr(usuarioID), AtualizadoPor: ptr(usuarioID), CriadoEm: agora, AtualizadoEm: agora}
			if err := tx.Create(c).Error; err != nil {
				return err
			}
			if pedidoID != nil {
				res := tx.Table("pedidos_restaurante").Where("id = ? AND excluido_em IS NULL AND cotacao_id IS NULL", *pedidoID).
					Updates(map[string]any{"cotacao_id": id, "situacao": "EM COTAÇÃO", "versao": gorm.Expr("versao + 1"), "atualizado_em": agora})
				if res.Error != nil {
					return res.Error
				}
				if res.RowsAffected == 0 {
					return apierro.Conflito("Este pedido do restaurante já foi transformado em cotação.")
				}
			}
		} else {
			campos["versao"] = gorm.Expr("versao + 1")
			res := tx.Model(&Cotacao{}).Where("id = ? AND versao = ? AND excluido_em IS NULL", id, e.Versao).
				Select(keys(campos)).Updates(campos)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				if _, err := s.Buscar(ctx, id); err != nil {
					return err
				}
				return apierro.VersaoDesatualizada()
			}
		}
		if err := s.sincronizarResumo(ctx, tx, usuarioID, id, e, escolhas, total); err != nil {
			return err
		}
		if err := s.aprenderFornecedores(ctx, tx, e.Conteudo); err != nil {
			return err
		}
		acao := "atualizar"
		if nova {
			acao = "criar"
		}
		return auditoria.Registrar(ctx, tx, usuarioID, acao, "cotacao", id.String())
	})
	if err != nil {
		return nil, err
	}
	return s.Buscar(ctx, id)
}

func keys(m map[string]any) []string {
	ks := make([]string, 0, len(m))
	for k := range m {
		ks = append(ks, k)
	}
	sort.Strings(ks)
	return ks
}

func (s *Service) aprenderFornecedores(ctx context.Context, tx *gorm.DB, c Conteudo) error {
	for _, f := range c.Fornecedores {
		if err := fornecedor.Aprender(ctx, tx, f.CNPJ, f.Codigo, f.Nome); err != nil {
			return err
		}
	}
	return nil
}

// Efetivada diz se a cotação já virou compra (sai de "orçamento" no Resumo).
func Efetivada(modulo, situacao string, c Conteudo) bool {
	switch modulo {
	case ModuloConsumo:
		return situacao == "APROVADO" || situacao == "PEDIDO EMITIDO" || situacao == "CONCLUÍDO"
	default:
		if situacao != "EM COTAÇÃO" {
			return true
		}
		for _, p := range c.Pedidos {
			if p != nil && strings.TrimSpace(p.OS) != "" {
				return true
			}
		}
		return false
	}
}

// DescricaoResumo monta a descrição do lançamento sem repetir o nome do
// orçamento no começo da descrição.
func DescricaoResumo(titulo, descricao string) string {
	titulo, descricao = strings.TrimSpace(titulo), strings.TrimSpace(descricao)
	if titulo == "" {
		return descricao
	}
	if descricao == "" || strings.EqualFold(titulo, descricao) {
		return titulo
	}
	if strings.HasPrefix(strings.ToLower(descricao), strings.ToLower(titulo)) {
		return descricao
	}
	return titulo + " - " + descricao
}

func tituloHortifruti(e Entrada) string {
	t := "Cotação de " + strings.ToLower(e.Categoria)
	if e.Categoria == "Mista" {
		t = "Cotação mista de carnes, frutas e verduras"
	}
	if e.Periodo != "" {
		t += " - " + e.Periodo
	}
	return t
}

// sincronizarResumo: toda cotação aparece no Resumo Inteligente. Enquanto
// não é efetivada, é um único lançamento de "orçamento" (não soma no total
// do dia). Efetivada, vira um lançamento de compra por fornecedor escolhido,
// com o prazo de pagamento desse fornecedor (nunca a palavra APROVADO).
func (s *Service) sincronizarResumo(ctx context.Context, tx *gorm.DB, usuarioID, id uuid.UUID, e Entrada, escolhas []Escolha, total float64) error {
	data, _ := db.ParseData(e.Data)
	area, titulo := e.Categoria, e.Titulo
	if e.Modulo == ModuloHortifruti {
		area = "Restaurante"
		if titulo == "" {
			titulo = tituloHortifruti(e)
		}
	}
	descricao := DescricaoResumo(titulo, e.Descricao)
	var linhas []compra.LinhaOrigem
	if !Efetivada(e.Modulo, e.Situacao, e.Conteudo) {
		linhas = append(linhas, compra.LinhaOrigem{
			Chave: "orcamento", Tipo: compra.TipoOrcamento, Data: data, Solicitante: e.Solicitante, Area: area,
			OCS: e.OCS, Descricao: descricao, Valor: total, Provisionado: e.Provisionado, Situacao: e.Situacao,
		})
	} else {
		for _, pf := range PorFornecedor(e.Conteudo, escolhas) {
			ocs := e.OCS
			if p := e.Conteudo.Pedidos[pf.Fornecedor.ID]; p != nil && strings.TrimSpace(p.OS) != "" && e.Modulo == ModuloHortifruti {
				ocs = strings.TrimSpace(p.OS)
			}
			linhas = append(linhas, compra.LinhaOrigem{
				Chave: "forn:" + pf.Fornecedor.ID, Tipo: compra.TipoCompra, Data: data, Solicitante: e.Solicitante,
				Area: area, CNPJ: pf.Fornecedor.CNPJ, CodigoFornecedor: pf.Fornecedor.Codigo, Fornecedor: pf.Fornecedor.Nome,
				OCS: ocs, Descricao: descricao, Valor: pf.Total, PrazoPagamento: pf.Fornecedor.Pagamento,
				Provisionado: e.Provisionado, Situacao: e.Situacao,
			})
		}
	}
	return compra.Sincronizar(ctx, tx, usuarioID, id, linhas)
}

// Excluir é lógico e leva junto os lançamentos que a cotação gerou no Resumo.
func (s *Service) Excluir(ctx context.Context, usuarioID, id uuid.UUID) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Cotacao{}).Where("id = ? AND excluido_em IS NULL", id).
			Updates(map[string]any{"excluido_em": time.Now().UTC(), "atualizado_por": ptr(usuarioID)})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.NaoEncontrado("Cotação não encontrada.")
		}
		if err := compra.ExcluirDaOrigem(ctx, tx, id); err != nil {
			return err
		}
		// Pedido do restaurante volta a ficar disponível pra nova cotação.
		if err := tx.Table("pedidos_restaurante").Where("cotacao_id = ?", id).
			Updates(map[string]any{"cotacao_id": nil, "situacao": "ENVIADO", "versao": gorm.Expr("versao + 1")}).Error; err != nil {
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioID, "excluir", "cotacao", id.String())
	})
}

// HistoricoDeCusto devolve os preços escolhidos no passado para os códigos
// ARCOM pedidos (mais recente primeiro, até 10 por código).
func (s *Service) HistoricoDeCusto(ctx context.Context, codigos []string, excluir uuid.UUID) ([]HistoricoCusto, error) {
	procurados := map[string]bool{}
	for _, c := range codigos {
		if c = strings.TrimSpace(c); c != "" && len(c) <= 40 {
			procurados[c] = true
		}
	}
	if len(procurados) == 0 || len(procurados) > 500 {
		return []HistoricoCusto{}, nil
	}
	var cs []Cotacao
	if err := s.db.WithContext(ctx).Where("modulo = ? AND excluido_em IS NULL AND id <> ?", ModuloConsumo, excluir).
		Order("data DESC, atualizado_em DESC").Limit(1000).Find(&cs).Error; err != nil {
		return nil, err
	}
	out := []HistoricoCusto{}
	porCodigo := map[string]int{}
	nomeDoCodigo := map[string]HistoricoCusto{}
	for _, c := range cs {
		var doc Conteudo
		if err := json.Unmarshal(c.Conteudo, &doc); err != nil {
			continue
		}
		nomes := map[string]string{}
		for _, f := range doc.Fornecedores {
			nomes[f.ID] = f.Nome
		}
		itens := map[string]Item{}
		for _, it := range doc.Itens {
			itens[it.ID] = it
			cod := strings.TrimSpace(it.CodigoArcom)
			if _, ok := nomeDoCodigo[cod]; procurados[cod] && !ok && it.Nome != "" {
				nomeDoCodigo[cod] = HistoricoCusto{CodigoArcom: cod, Item: it.Nome, Unidade: it.Unidade,
					Data: c.Data.String(), CotacaoID: c.ID.String(), Titulo: c.Titulo}
			}
		}
		for _, e := range Escolher(c.Modulo, doc) {
			it := itens[e.ItemID]
			cod := strings.TrimSpace(it.CodigoArcom)
			if !procurados[cod] || porCodigo[cod] >= 10 {
				continue
			}
			porCodigo[cod]++
			out = append(out, HistoricoCusto{CodigoArcom: cod, Item: it.Nome, Fornecedor: nomes[e.FornecedorID],
				PrecoUnitario: e.PrecoUnitario, Quantidade: e.Quantidade, Unidade: it.Unidade, Data: c.Data.String(),
				CotacaoID: c.ID.String(), Titulo: c.Titulo})
		}
	}
	// Código que nunca teve preço escolhido ainda ajuda a preencher a descrição.
	for cod, h := range nomeDoCodigo {
		if porCodigo[cod] == 0 {
			out = append(out, h)
		}
	}
	return out, nil
}
