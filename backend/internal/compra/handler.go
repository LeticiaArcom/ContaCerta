package compra

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

type Handler struct{ svc *Service }

func NovoHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/compras", H(h.listar))
	r.Get("/compras/totais", H(h.totais))
	r.Get("/compras/sugestoes", H(h.sugestoes))
	r.Post("/compras", H(h.criar))
	r.Put("/compras/{id}", H(h.atualizar))
	r.Patch("/compras/{id}/provisionado", H(h.provisionado))
	r.Delete("/compras/{id}", H(h.excluir))
}

func lerFiltro(r *http.Request) Filtro {
	q := r.URL.Query()
	return Filtro{Data: q.Get("data"), De: q.Get("de"), Ate: q.Get("ate"), Busca: q.Get("busca"),
		Provisionado: q.Get("provisionado"), Area: q.Get("area"), Tipo: q.Get("tipo")}
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	p, err := requisicao.LerPaginacao(r)
	if err != nil {
		return err
	}
	cs, total, err := h.svc.Listar(r.Context(), lerFiltro(r), p)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(cs, p, total))
}

func (h *Handler) totais(w http.ResponseWriter, r *http.Request) error {
	t, err := h.svc.Totais(r.Context(), lerFiltro(r))
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, t)
}

func (h *Handler) sugestoes(w http.ResponseWriter, r *http.Request) error {
	s, err := h.svc.Sugestoes(r.Context())
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, s)
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
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	c, err := h.svc.Atualizar(r.Context(), usuario.IDDoContexto(r.Context()), chi.URLParam(r, "id"), e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, c)
}

func (h *Handler) provisionado(w http.ResponseWriter, r *http.Request) error {
	var e EntradaProvisionado
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	c, err := h.svc.AlterarProvisionado(r.Context(), usuario.IDDoContexto(r.Context()), chi.URLParam(r, "id"), e.Provisionado)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, c)
}

func (h *Handler) excluir(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.Excluir(r.Context(), usuario.IDDoContexto(r.Context()), chi.URLParam(r, "id")); err != nil {
		return err
	}
	return requisicao.SemConteudo(w)
}
