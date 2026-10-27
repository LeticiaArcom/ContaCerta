package evento

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

type Handler struct{ svc *Service }

func NovoHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/eventos", H(h.listar))
	r.Get("/eventos/{id}", H(h.buscar))
	r.Post("/eventos", H(h.criar))
	r.Put("/eventos/{id}", H(h.atualizar))
	r.Delete("/eventos/{id}", H(h.excluir))
}

func lerID(r *http.Request) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return uuid.Nil, apierro.NaoEncontrado("Evento não encontrado.")
	}
	return id, nil
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	p, err := requisicao.LerPaginacao(r)
	if err != nil {
		return err
	}
	es, total, err := h.svc.Listar(r.Context(), r.URL.Query().Get("busca"), r.URL.Query().Get("situacao"), p)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(es, p, total))
}

func (h *Handler) buscar(w http.ResponseWriter, r *http.Request) error {
	id, err := lerID(r)
	if err != nil {
		return err
	}
	e, err := h.svc.Buscar(r.Context(), id)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, e)
}

func (h *Handler) criar(w http.ResponseWriter, r *http.Request) error {
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	ev, err := h.svc.Criar(r.Context(), usuario.IDDoContexto(r.Context()), e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusCreated, ev)
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
	ev, err := h.svc.Atualizar(r.Context(), usuario.IDDoContexto(r.Context()), id, e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, ev)
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
