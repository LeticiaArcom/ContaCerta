package usuario

import (
	"net"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
)

// NomeCookie é o cookie HttpOnly da sessão — o frontend nunca lê.
const NomeCookie = "sessao"

type Handler struct {
	svc      *Service
	producao bool
}

func NovoHandler(svc *Service, producao bool) *Handler {
	return &Handler{svc: svc, producao: producao}
}

// ehLocal diz se a requisição chegou por localhost (desenvolvimento).
func ehLocal(host string) bool {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func (h *Handler) definirCookie(w http.ResponseWriter, r *http.Request, token string, duracao time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     NomeCookie,
		Value:    token,
		HttpOnly: true,
		// Secure sempre, menos em localhost (dev em http puro). Não depende
		// de APP_ENV: a produção pode subir sem essa variável e o cookie
		// continua protegido.
		Secure:   h.producao || !ehLocal(r.Host),
		SameSite: http.SameSiteLaxMode,
		Path:     "/api",
		MaxAge:   int(duracao.Seconds()),
	})
}

// RotasPublicas: login e configuração inicial (sem sessão).
func (h *Handler) RotasPublicas(r chi.Router, H apierro.Adaptador) {
	r.Post("/sessao", H(h.login))
	r.Get("/sessao/configuracao-inicial", H(h.statusConfiguracao))
	r.Post("/sessao/configuracao-inicial", H(h.configuracaoInicial))
	r.Post("/sessao/logout", H(h.logout))
}

// RotasSessao: quem está logado (qualquer papel).
func (h *Handler) RotasSessao(r chi.Router, H apierro.Adaptador) {
	r.Get("/sessao", H(h.eu))
}

// RotasAdmin: cadastro de usuários (só papel compras).
func (h *Handler) RotasAdmin(r chi.Router, H apierro.Adaptador) {
	r.Get("/usuarios", H(h.listar))
	r.Post("/usuarios", H(h.criar))
	r.Put("/usuarios/{id}", H(h.atualizar))
}

func (h *Handler) login(w http.ResponseWriter, r *http.Request) error {
	var e EntradaLogin
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	token, u, err := h.svc.Login(r.Context(), e)
	if err != nil {
		return err
	}
	h.definirCookie(w, r, token, DuracaoSessao)
	return requisicao.JSON(w, http.StatusOK, u)
}

func (h *Handler) statusConfiguracao(w http.ResponseWriter, r *http.Request) error {
	precisa, err := h.svc.PrecisaConfiguracaoInicial(r.Context())
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, map[string]bool{"necessaria": precisa})
}

func (h *Handler) configuracaoInicial(w http.ResponseWriter, r *http.Request) error {
	var e EntradaConfiguracaoInicial
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	token, u, err := h.svc.ConfiguracaoInicial(r.Context(), e)
	if err != nil {
		return err
	}
	h.definirCookie(w, r, token, DuracaoSessao)
	return requisicao.JSON(w, http.StatusCreated, u)
}

func (h *Handler) logout(w http.ResponseWriter, r *http.Request) error {
	if c, err := r.Cookie(NomeCookie); err == nil {
		if err := h.svc.Logout(r.Context(), c.Value); err != nil {
			return err
		}
	}
	h.definirCookie(w, r, "", -time.Second)
	return requisicao.SemConteudo(w)
}

func (h *Handler) eu(w http.ResponseWriter, r *http.Request) error {
	return requisicao.JSON(w, http.StatusOK, DoContexto(r.Context()))
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	us, err := h.svc.Listar(r.Context())
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(us, requisicao.Paginacao{Pagina: 1, PorPagina: max(len(us), 1)}, int64(len(us))))
}

func (h *Handler) criar(w http.ResponseWriter, r *http.Request) error {
	var e EntradaUsuario
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	u, err := h.svc.Criar(r.Context(), e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusCreated, u)
}

func (h *Handler) atualizar(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return apierro.NaoEncontrado("Usuário não encontrado.")
	}
	var e EntradaAtualizarUsuario
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	u, err := h.svc.Atualizar(r.Context(), id, e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, u)
}
