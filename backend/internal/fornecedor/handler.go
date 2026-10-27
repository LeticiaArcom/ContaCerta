package fornecedor

import (
	"context"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
	"meu-projeto/internal/usuario"
)

func usuarioDe(ctx context.Context) uuid.UUID { return usuario.IDDoContexto(ctx) }

type Handler struct{ svc *Service }

func NovoHandler(svc *Service) *Handler { return &Handler{svc: svc} }

func (h *Handler) Rotas(r chi.Router, H apierro.Adaptador) {
	r.Get("/fornecedores", H(h.listar))
	r.Get("/fornecedores/consulta", H(h.consultar))
	r.Post("/fornecedores", H(h.criar))
	r.Put("/fornecedores/{id}", H(h.atualizar))
	r.Delete("/fornecedores/{id}", H(h.excluir))
}

func (h *Handler) listar(w http.ResponseWriter, r *http.Request) error {
	p, err := requisicao.LerPaginacao(r)
	if err != nil {
		return err
	}
	fs, total, err := h.svc.Listar(r.Context(), r.URL.Query().Get("busca"), p)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, requisicao.NovaLista(fs, p, total))
}

func (h *Handler) consultar(w http.ResponseWriter, r *http.Request) error {
	q := r.URL.Query()
	var c *Consulta
	var err error
	switch {
	case q.Get("cnpj") != "":
		c, err = h.svc.ConsultarPorCNPJ(r.Context(), q.Get("cnpj"))
	case q.Get("codigo") != "":
		c, err = h.svc.ConsultarPorCodigo(r.Context(), q.Get("codigo"))
	default:
		return apierro.Validacao(map[string]string{"cnpj": "Informe o CNPJ ou o código."})
	}
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
	f, err := h.svc.Criar(r.Context(), e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusCreated, f)
}

func (h *Handler) atualizar(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return apierro.NaoEncontrado("Fornecedor não encontrado.")
	}
	var e Entrada
	if err := requisicao.Decodificar(r, &e); err != nil {
		return err
	}
	f, err := h.svc.Atualizar(r.Context(), id, e)
	if err != nil {
		return err
	}
	return requisicao.JSON(w, http.StatusOK, f)
}

func (h *Handler) excluir(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return apierro.NaoEncontrado("Fornecedor não encontrado.")
	}
	if err := h.svc.Excluir(r.Context(), id); err != nil {
		return err
	}
	return requisicao.SemConteudo(w)
}
