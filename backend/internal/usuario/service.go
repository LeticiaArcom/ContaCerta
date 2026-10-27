package usuario

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/auditoria"
)

// DuracaoSessao é quanto tempo um login vale. É uma ferramenta interna de
// trabalho diário — 12h cobre o expediente sem pedir login toda hora.
const DuracaoSessao = 12 * time.Hour

const custoBcrypt = 12

// hashFalso é comparado quando o e-mail não existe, pra resposta levar o
// mesmo tempo nos dois casos (não revela se o e-mail está cadastrado).
var hashFalso, _ = bcrypt.GenerateFromPassword([]byte("senha-que-nunca-confere"), custoBcrypt)

var errCredenciais = &apierro.ErroDominio{
	Status: 401, Titulo: "Não autenticado",
	Detail: "E-mail ou senha inválidos.", Codigo: "credenciais_invalidas",
}

// Service reúne login, sessão e cadastro de usuários.
type Service struct{ db *gorm.DB }

func NovoService(db *gorm.DB) *Service { return &Service{db: db} }

func normalizarEmail(e string) string { return strings.ToLower(strings.TrimSpace(e)) }

// Login confere a senha e devolve o token opaco da nova sessão.
func (s *Service) Login(ctx context.Context, e EntradaLogin) (string, *Usuario, error) {
	var u Usuario
	err := s.db.WithContext(ctx).Where("lower(email) = ?", normalizarEmail(e.Email)).First(&u).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		_ = bcrypt.CompareHashAndPassword(hashFalso, []byte(e.Senha))
		return "", nil, errCredenciais
	}
	if err != nil {
		return "", nil, err
	}
	if bcrypt.CompareHashAndPassword([]byte(u.SenhaHash), []byte(e.Senha)) != nil || !u.Ativo {
		return "", nil, errCredenciais
	}
	token, err := s.criarSessao(ctx, u.ID)
	if err != nil {
		return "", nil, err
	}
	return token, &u, nil
}

func hashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

func (s *Service) criarSessao(ctx context.Context, usuarioID uuid.UUID) (string, error) {
	bruto := make([]byte, 32) // 256 bits
	if _, err := rand.Read(bruto); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(bruto)
	agora := time.Now().UTC()
	sessao := sessaoDB{TokenHash: hashToken(token), UsuarioID: usuarioID, ExpiraEm: agora.Add(DuracaoSessao), CriadoEm: agora}
	if err := s.db.WithContext(ctx).Create(&sessao).Error; err != nil {
		return "", err
	}
	// Limpeza oportunista das sessões vencidas desse usuário.
	s.db.WithContext(ctx).Where("usuario_id = ? AND expira_em < ?", usuarioID, agora).Delete(&sessaoDB{})
	return token, nil
}

// Validar devolve o usuário dono do token, se a sessão existir, não tiver
// vencido e o usuário continuar ativo. Guardamos só o hash do token: quem
// lê o banco não consegue se passar por ninguém.
func (s *Service) Validar(ctx context.Context, token string) (*Usuario, error) {
	if token == "" || len(token) > 100 {
		return nil, errors.New("token inválido")
	}
	var u Usuario
	err := s.db.WithContext(ctx).
		Table("usuarios").
		Joins("JOIN sessoes ON sessoes.usuario_id = usuarios.id").
		Where("sessoes.token_hash = ? AND sessoes.expira_em > ? AND usuarios.ativo", hashToken(token), time.Now().UTC()).
		Select("usuarios.*").
		First(&u).Error
	if err != nil {
		return nil, err
	}
	return &u, nil
}

// Logout apaga a sessão — o token morre na hora.
func (s *Service) Logout(ctx context.Context, token string) error {
	return s.db.WithContext(ctx).Where("token_hash = ?", hashToken(token)).Delete(&sessaoDB{}).Error
}

// PrecisaConfiguracaoInicial é true enquanto não existe nenhum usuário.
func (s *Service) PrecisaConfiguracaoInicial(ctx context.Context) (bool, error) {
	var n int64
	if err := s.db.WithContext(ctx).Model(&Usuario{}).Count(&n).Error; err != nil {
		return false, err
	}
	return n == 0, nil
}

// ConfiguracaoInicial cria a primeira conta (papel compras) e já devolve a
// sessão. Trava a tabela pra duas pessoas não criarem a "primeira" conta ao
// mesmo tempo.
func (s *Service) ConfiguracaoInicial(ctx context.Context, e EntradaConfiguracaoInicial) (string, *Usuario, error) {
	var criado *Usuario
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("LOCK TABLE usuarios IN EXCLUSIVE MODE").Error; err != nil {
			return err
		}
		var n int64
		if err := tx.Model(&Usuario{}).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return apierro.Conflito("A configuração inicial já foi feita. Entre com sua conta.")
		}
		u, err := novoUsuario(e.Nome, e.Email, e.Senha, PapelCompras)
		if err != nil {
			return err
		}
		if err := tx.Create(u).Error; err != nil {
			return err
		}
		criado = u
		return auditoria.Registrar(ctx, tx, u.ID, "configuracao_inicial", "usuario", u.ID.String())
	})
	if err != nil {
		return "", nil, err
	}
	token, err := s.criarSessao(ctx, criado.ID)
	return token, criado, err
}

func novoUsuario(nome, email, senha, papel string) (*Usuario, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(senha), custoBcrypt)
	if err != nil {
		return nil, err
	}
	agora := time.Now().UTC()
	return &Usuario{
		ID: uuid.New(), Nome: strings.TrimSpace(nome), Email: normalizarEmail(email),
		SenhaHash: string(hash), Papel: papel, Ativo: true, CriadoEm: agora, AtualizadoEm: agora,
	}, nil
}

func (s *Service) Listar(ctx context.Context) ([]Usuario, error) {
	var us []Usuario
	err := s.db.WithContext(ctx).Order("nome").Find(&us).Error
	return us, err
}

func (s *Service) Criar(ctx context.Context, e EntradaUsuario) (*Usuario, error) {
	u, err := novoUsuario(e.Nome, e.Email, e.Senha, e.Papel)
	if err != nil {
		return nil, err
	}
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(u).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return apierro.Conflito("Já existe um usuário com este e-mail.")
			}
			return err
		}
		return auditoria.Registrar(ctx, tx, IDDoContexto(ctx), "criar", "usuario", u.ID.String())
	})
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *Service) Atualizar(ctx context.Context, id uuid.UUID, e EntradaAtualizarUsuario) (*Usuario, error) {
	var u Usuario
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.First(&u, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return apierro.NaoEncontrado("Usuário não encontrado.")
			}
			return err
		}
		// Quem está logado não pode se desativar nem tirar o próprio
		// acesso de compras (evita ficar sem nenhuma administradora).
		if u.ID == IDDoContexto(ctx) && (!e.Ativo || e.Papel != PapelCompras) {
			return apierro.Regra("Você não pode desativar nem rebaixar a sua própria conta.")
		}
		campos := map[string]any{"nome": strings.TrimSpace(e.Nome), "papel": e.Papel, "ativo": e.Ativo, "atualizado_em": time.Now().UTC()}
		permitidos := []string{"nome", "papel", "ativo", "atualizado_em"}
		if e.Senha != "" {
			hash, err := bcrypt.GenerateFromPassword([]byte(e.Senha), custoBcrypt)
			if err != nil {
				return err
			}
			campos["senha_hash"] = string(hash)
			permitidos = append(permitidos, "senha_hash")
		}
		if err := tx.Model(&u).Select(permitidos).Updates(campos).Error; err != nil {
			return err
		}
		if !e.Ativo || e.Senha != "" {
			// Desativou ou trocou a senha: derruba as sessões abertas.
			if err := tx.Where("usuario_id = ?", u.ID).Delete(&sessaoDB{}).Error; err != nil {
				return err
			}
		}
		return auditoria.Registrar(ctx, tx, IDDoContexto(ctx), "atualizar", "usuario", u.ID.String())
	})
	if err != nil {
		return nil, err
	}
	if err := s.db.WithContext(ctx).First(&u, "id = ?", id).Error; err != nil {
		return nil, err
	}
	return &u, nil
}
