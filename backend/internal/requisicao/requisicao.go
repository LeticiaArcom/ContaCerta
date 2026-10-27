// Package requisicao concentra o que todo handler repete: decodificar e
// validar o corpo JSON, ler paginação e responder JSON no formato do
// contrato (padroes/09-contrato-api.md).
package requisicao

import (
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"github.com/go-playground/validator/v10"

	"meu-projeto/internal/apierro"
)

var validar = validator.New(validator.WithRequiredStructEnabled())

func init() {
	// Mensagens de campo usam o nome do JSON, não o da struct Go.
	validar.RegisterTagNameFunc(func(f reflect.StructField) string {
		nome := strings.SplitN(f.Tag.Get("json"), ",", 2)[0]
		if nome == "-" {
			return ""
		}
		return nome
	})
}

// Decodificar lê o corpo JSON em destino (campos desconhecidos são recusados)
// e roda o validator. Erro já sai como 400/422 do contrato.
func Decodificar(r *http.Request, destino any) error {
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	if err := dec.Decode(destino); err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return &apierro.ErroDominio{Status: http.StatusRequestEntityTooLarge, Titulo: "Corpo grande demais", Detail: "O conteúdo enviado é grande demais.", Codigo: "corpo_grande_demais"}
		}
		if errors.Is(err, io.EOF) {
			return apierro.EntradaInvalida("Corpo da requisição vazio.")
		}
		return apierro.EntradaInvalida("Formato de dados inválido.")
	}
	return Validar(destino)
}

// Validar roda o validator numa struct já preenchida.
func Validar(v any) error {
	if err := validar.Struct(v); err != nil {
		var erros validator.ValidationErrors
		if errors.As(err, &erros) {
			campos := make(map[string]string, len(erros))
			for _, e := range erros {
				campos[e.Field()] = mensagem(e)
			}
			return apierro.Validacao(campos)
		}
		return apierro.EntradaInvalida("Formato de dados inválido.")
	}
	return nil
}

func mensagem(e validator.FieldError) string {
	switch e.Tag() {
	case "required":
		return "Campo obrigatório."
	case "email":
		return "E-mail inválido."
	case "min":
		return "Valor abaixo do mínimo (" + e.Param() + ")."
	case "max":
		return "Valor acima do máximo (" + e.Param() + ")."
	case "oneof":
		return "Opção inválida."
	case "datetime":
		return "Data inválida."
	default:
		return "Valor inválido."
	}
}

// JSON responde o recurso sem envelope (contrato: a resposta É o recurso).
func JSON(w http.ResponseWriter, status int, v any) error {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	return json.NewEncoder(w).Encode(v)
}

// SemConteudo é o 204 de um DELETE bem-sucedido.
func SemConteudo(w http.ResponseWriter) error {
	w.WriteHeader(http.StatusNoContent)
	return nil
}

// Paginacao vem de ?pagina= e ?porPagina= (default 1/20, máximo 100 — valor
// maior é recusado, não truncado).
type Paginacao struct {
	Pagina    int   `json:"pagina"`
	PorPagina int   `json:"porPagina"`
	Total     int64 `json:"total"`
	TotalPag  int   `json:"totalPaginas"`
}

// Lista é o envelope de lista do contrato.
type Lista[T any] struct {
	Itens     []T       `json:"itens"`
	Paginacao Paginacao `json:"paginacao"`
}

func LerPaginacao(r *http.Request) (Paginacao, error) {
	p := Paginacao{Pagina: 1, PorPagina: 20}
	if v := r.URL.Query().Get("pagina"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			return p, apierro.Validacao(map[string]string{"pagina": "Página inválida."})
		}
		p.Pagina = n
	}
	if v := r.URL.Query().Get("porPagina"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 100 {
			return p, apierro.Validacao(map[string]string{"porPagina": "Use um valor entre 1 e 100."})
		}
		p.PorPagina = n
	}
	return p, nil
}

func (p Paginacao) Offset() int { return (p.Pagina - 1) * p.PorPagina }

// NovaLista monta o envelope com o total já contado.
func NovaLista[T any](itens []T, p Paginacao, total int64) Lista[T] {
	if itens == nil {
		itens = []T{}
	}
	p.Total = total
	p.TotalPag = int(math.Ceil(float64(total) / float64(p.PorPagina)))
	return Lista[T]{Itens: itens, Paginacao: p}
}
