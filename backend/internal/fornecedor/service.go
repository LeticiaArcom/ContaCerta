package fornecedor

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
	"meu-projeto/internal/requisicao"
)

// urlBrasilAPI é fixa — o único pedaço variável é o CNPJ, já reduzido a 14
// dígitos validados (sem SSRF por input do cliente).
const urlBrasilAPI = "https://brasilapi.com.br/api/cnpj/v1/"

type Service struct {
	db   *gorm.DB
	http *http.Client
}

func NovoService(db *gorm.DB) *Service {
	return &Service{db: db, http: &http.Client{Timeout: 8 * time.Second}}
}

func (s *Service) Listar(ctx context.Context, busca string, p requisicao.Paginacao) ([]Fornecedor, int64, error) {
	q := s.db.WithContext(ctx).Model(&Fornecedor{})
	if b := strings.TrimSpace(busca); b != "" {
		like := "%" + strings.ToLower(b) + "%"
		q = q.Where("lower(nome) LIKE ? OR codigo LIKE ? OR cnpj LIKE ?", like, like, like)
	}
	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var fs []Fornecedor
	err := q.Order("nome").Limit(p.PorPagina).Offset(p.Offset()).Find(&fs).Error
	return fs, total, err
}

func normalizar(e *Entrada) error {
	e.Nome = strings.TrimSpace(e.Nome)
	e.Codigo = strings.TrimSpace(e.Codigo)
	if strings.TrimSpace(e.CNPJ) != "" {
		if !CNPJValido(e.CNPJ) {
			return apierro.Validacao(map[string]string{"cnpj": "CNPJ inválido."})
		}
		e.CNPJ = FormatarCNPJ(e.CNPJ)
	} else {
		e.CNPJ = ""
	}
	return nil
}

func (s *Service) Criar(ctx context.Context, e Entrada) (*Fornecedor, error) {
	if err := normalizar(&e); err != nil {
		return nil, err
	}
	agora := time.Now().UTC()
	f := &Fornecedor{ID: uuid.New(), Codigo: e.Codigo, CNPJ: e.CNPJ, Nome: e.Nome, Contato: e.Contato,
		Telefone: e.Telefone, Email: e.Email, Endereco: e.Endereco, Versao: 1, CriadoEm: agora, AtualizadoEm: agora}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(f).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return apierro.Conflito("Já existe um fornecedor com este CNPJ.")
			}
			return err
		}
		return auditoria.Registrar(ctx, tx, usuarioDe(ctx), "criar", "fornecedor", f.ID.String())
	})
	return f, err
}

func (s *Service) Atualizar(ctx context.Context, id uuid.UUID, e Entrada) (*Fornecedor, error) {
	if err := normalizar(&e); err != nil {
		return nil, err
	}
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Model(&Fornecedor{}).Where("id = ? AND versao = ?", id, e.Versao).
			Select("codigo", "cnpj", "nome", "contato", "telefone", "email", "endereco", "versao", "atualizado_em").
			Updates(map[string]any{"codigo": e.Codigo, "cnpj": e.CNPJ, "nome": e.Nome, "contato": e.Contato,
				"telefone": e.Telefone, "email": e.Email, "endereco": e.Endereco,
				"versao": gorm.Expr("versao + 1"), "atualizado_em": time.Now().UTC()})
		if res.Error != nil {
			if errors.Is(res.Error, gorm.ErrDuplicatedKey) {
				return apierro.Conflito("Já existe um fornecedor com este CNPJ.")
			}
			return res.Error
		}
		if res.RowsAffected == 0 {
			return s.erroDeVersao(tx, id)
		}
		return auditoria.Registrar(ctx, tx, usuarioDe(ctx), "atualizar", "fornecedor", id.String())
	})
	if err != nil {
		return nil, err
	}
	var f Fornecedor
	return &f, s.db.WithContext(ctx).First(&f, "id = ?", id).Error
}

func (s *Service) erroDeVersao(tx *gorm.DB, id uuid.UUID) error {
	var n int64
	if err := tx.Model(&Fornecedor{}).Where("id = ?", id).Count(&n).Error; err != nil {
		return err
	}
	if n == 0 {
		return apierro.NaoEncontrado("Fornecedor não encontrado.")
	}
	return apierro.VersaoDesatualizada()
}

func (s *Service) Excluir(ctx context.Context, id uuid.UUID) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		res := tx.Delete(&Fornecedor{}, "id = ?", id)
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return apierro.NaoEncontrado("Fornecedor não encontrado.")
		}
		return auditoria.Registrar(ctx, tx, usuarioDe(ctx), "excluir", "fornecedor", id.String())
	})
}

// Aprender grava (ou completa) o cadastro a partir de uma compra lançada:
// é assim que o CNPJ informado uma vez passa a preencher sozinho nas
// próximas. Nunca apaga um dado que já existe — só completa o que falta.
func Aprender(ctx context.Context, tx *gorm.DB, cnpj, codigo, nome string) error {
	nome, codigo = strings.TrimSpace(nome), strings.TrimSpace(codigo)
	if nome == "" || (cnpj == "" && codigo == "") {
		return nil
	}
	if cnpj != "" && !CNPJValido(cnpj) {
		cnpj = ""
	}
	cnpj = FormatarCNPJ(cnpj)
	if cnpj == "" && codigo == "" {
		return nil
	}
	var f Fornecedor
	q := tx.WithContext(ctx)
	var err error
	if cnpj != "" {
		err = q.Where("cnpj = ?", cnpj).First(&f).Error
	} else {
		err = q.Where("codigo = ?", codigo).First(&f).Error
	}
	agora := time.Now().UTC()
	if errors.Is(err, gorm.ErrRecordNotFound) {
		if cnpj == "" {
			// Só código, sem CNPJ: ainda assim vale guardar o par código/nome.
			err = q.Where("codigo = ? AND cnpj = ''", codigo).First(&f).Error
			if err == nil {
				return nil
			}
		}
		return q.Create(&Fornecedor{ID: uuid.New(), CNPJ: cnpj, Codigo: codigo, Nome: nome, Versao: 1, CriadoEm: agora, AtualizadoEm: agora}).Error
	}
	if err != nil {
		return err
	}
	campos := map[string]any{}
	if f.Codigo == "" && codigo != "" {
		campos["codigo"] = codigo
	}
	if f.CNPJ == "" && cnpj != "" {
		campos["cnpj"] = cnpj
	}
	if len(campos) == 0 {
		return nil
	}
	campos["atualizado_em"] = agora
	campos["versao"] = gorm.Expr("versao + 1")
	return q.Model(&f).Updates(campos).Error
}

type linhaHistorico struct {
	Fornecedor       string
	CNPJ             string `gorm:"column:cnpj"`
	CodigoFornecedor string
}

// ConsultarPorCNPJ: cadastro -> histórico de compras -> BrasilAPI.
func (s *Service) ConsultarPorCNPJ(ctx context.Context, cnpj string) (*Consulta, error) {
	if !CNPJValido(cnpj) {
		return nil, apierro.Validacao(map[string]string{"cnpj": "CNPJ inválido."})
	}
	formatado := FormatarCNPJ(cnpj)
	var f Fornecedor
	err := s.db.WithContext(ctx).Where("cnpj = ?", formatado).First(&f).Error
	if err == nil {
		return &Consulta{Encontrado: true, Origem: "cadastro", Nome: f.Nome, CNPJ: f.CNPJ, Codigo: f.Codigo}, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var h linhaHistorico
	err = s.db.WithContext(ctx).Table("compras").Select("fornecedor, cnpj, codigo_fornecedor").
		Where("cnpj = ? AND excluido_em IS NULL AND fornecedor <> ''", formatado).
		Order("data DESC").Limit(1).Scan(&h).Error
	if err != nil {
		return nil, err
	}
	if h.Fornecedor != "" {
		return &Consulta{Encontrado: true, Origem: "historico", Nome: h.Fornecedor, CNPJ: formatado, Codigo: h.CodigoFornecedor}, nil
	}

	nome, err := s.buscarBrasilAPI(ctx, SoDigitos(cnpj))
	if err != nil {
		return nil, err
	}
	c := &Consulta{Encontrado: true, Origem: "brasilapi", Nome: nome, CNPJ: formatado}
	c.Codigo = s.codigoPorNome(ctx, nome)
	if c.Codigo == "" {
		c.Aviso = "Código do fornecedor não encontrado no histórico. Informe uma vez e o sistema aprende."
	}
	return c, nil
}

// codigoPorNome procura o código no histórico pelo nome exato ou parecido.
func (s *Service) codigoPorNome(ctx context.Context, nome string) string {
	if nome == "" {
		return ""
	}
	var cod string
	s.db.WithContext(ctx).Table("compras").Select("codigo_fornecedor").
		Where("excluido_em IS NULL AND codigo_fornecedor <> '' AND (upper(fornecedor) = upper(?) OR upper(fornecedor) LIKE upper(?))", nome, primeiraPalavra(nome)+"%").
		Order("data DESC").Limit(1).Scan(&cod)
	return cod
}

func primeiraPalavra(s string) string {
	campos := strings.Fields(s)
	if len(campos) == 0 {
		return s
	}
	if len(campos) > 1 && len(campos[0]) < 4 {
		return campos[0] + " " + campos[1]
	}
	return campos[0]
}

func (s *Service) buscarBrasilAPI(ctx context.Context, digitos string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, urlBrasilAPI+digitos, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := s.http.Do(req)
	if err != nil {
		return "", apierro.Indisponivel("A consulta de CNPJ não respondeu. Preencha o fornecedor manualmente.")
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return "", apierro.NaoEncontrado("CNPJ não encontrado na Receita. Preencha o fornecedor manualmente.")
	}
	if resp.StatusCode != http.StatusOK {
		return "", apierro.Indisponivel("A consulta de CNPJ não respondeu. Preencha o fornecedor manualmente.")
	}
	var corpo struct {
		NomeFantasia string `json:"nome_fantasia"`
		RazaoSocial  string `json:"razao_social"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&corpo); err != nil {
		return "", fmt.Errorf("decodificar brasilapi: %w", err)
	}
	if n := strings.TrimSpace(corpo.NomeFantasia); n != "" {
		return strings.ToUpper(n), nil
	}
	return strings.ToUpper(strings.TrimSpace(corpo.RazaoSocial)), nil
}

// ConsultarPorCodigo: cadastro -> histórico de compras.
func (s *Service) ConsultarPorCodigo(ctx context.Context, codigo string) (*Consulta, error) {
	codigo = strings.TrimSpace(codigo)
	if codigo == "" || len(codigo) > 40 {
		return nil, apierro.Validacao(map[string]string{"codigo": "Código inválido."})
	}
	var f Fornecedor
	err := s.db.WithContext(ctx).Where("codigo = ?", codigo).Order("cnpj DESC").First(&f).Error
	if err == nil && f.CNPJ != "" {
		return &Consulta{Encontrado: true, Origem: "cadastro", Nome: f.Nome, CNPJ: f.CNPJ, Codigo: f.Codigo}, nil
	}
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var h linhaHistorico
	if err := s.db.WithContext(ctx).Table("compras").Select("fornecedor, cnpj, codigo_fornecedor").
		Where("codigo_fornecedor = ? AND excluido_em IS NULL AND fornecedor <> ''", codigo).
		Order("(cnpj <> '') DESC, data DESC").Limit(1).Scan(&h).Error; err != nil {
		return nil, err
	}
	c := &Consulta{Codigo: codigo}
	switch {
	case h.Fornecedor != "":
		c.Encontrado, c.Origem, c.Nome, c.CNPJ = true, "historico", h.Fornecedor, h.CNPJ
	case f.Nome != "":
		c.Encontrado, c.Origem, c.Nome = true, "cadastro", f.Nome
	}
	if c.Encontrado && c.CNPJ == "" {
		c.Aviso = "Fornecedor encontrado, mas sem CNPJ no histórico. Informe o CNPJ uma vez."
	}
	return c, nil
}
