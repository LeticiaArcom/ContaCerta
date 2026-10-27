package cotacao

import (
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

type Handler struct{ svc *Service }

func NovoHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/cotacoes", H(h.listar))
	r.Get("/cotacoes/historico-custo", H(h.historicoCusto))
	r.Get("/cotacoes/{id}", H(h.buscar))
	r.Post("/cotacoes", H(h.criar))
	r.Put("/cotacoes/{id}", H(h.atualizar))
	r.Delete("/cotacoes/{id}", H(h.excluir))
}

func lerID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return uuid.Nil, apierro.NaoEncontrado("Cotação não encontrada.")
	}
	return id, nil
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	p, err := requisicao.LerPaginacao(r)
	if err != nil {
		return err
	}
	q := r.URL.Query()
	f := Filtro{Modulo: q.Get("modulo"), Categoria: q.Get("categoria"), Situacao: q.Get("situacao"),
		Provisionado: q.Get("provisionado"), Busca: q.Get("busca"), De: q.Get("de"), Ate: q.Get("ate")}
	cs, total, err := h.svc.Listar(r.Context(), f, p)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(cs, p, total))
}

func (h *Handler) historicoCusto(w http.ResponseWriter, r *http.Request) error {
	codigos := strings.Split(r.URL.Query().Get("codigos"), ",")
	excluir, _ := uuid.Parse(r.URL.Query().Get("excluir"))
	hs, err := h.svc.HistoricoDeCusto(r.Context(), codigos, excluir)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, hs)
}

func (h *Handler) buscar(w http.ResponseWriter, r *http.Request) error {
	id, err := lerID(r)
	if err != nil {
		return err
	}
	c, err := h.svc.Buscar(r.Context(), id)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, c)
}

func (h *Handler) criar(w http.ResponseWriter, r *http.Request) error {
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	c, err := h.svc.Criar(r.Context(), usuario.IDDoContexto(r.Context()), e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusCreated, c)
}

func (h *Handler) atualizar(w http.ResponseWriter, r *http.Request) error {
	id, err := lerID(r)
	if err != nil {
		return err
	}
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	c, err := h.svc.Atualizar(r.Context(), usuario.IDDoContexto(r.Context()), id, e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, c)
}

func (h *Handler) excluir(w http.ResponseWriter, r *http.Request) error {
	id, err := lerID(r)
	if err != nil {
		return err
	}
	if err := h.svc.Excluir(r.Context(), usuario.IDDoContexto(r.Context()), id); err != nil {
		return err
	}
	return requisicao.SemConteudo(w)
}
