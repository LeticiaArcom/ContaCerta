package servidor

import (
	"encoding/json"
	"errors"
	"net/http"

	"meu-projeto/internal/apierro"
)

// Problema é a resposta de erro única do backend — ver padroes/09-contrato-api.md.
// Content-Type: application/problem+json em toda resposta de erro.
type Problema struct {
	Type   string            `json:"type"`
	Title  string            `json:"title"`
	Status int               `json:"status"`
	Detail string            `json:"detail"`
	Codigo string            `json:"codigo"`
	Campos map[string]string `json:"campos,omitempty"`
}

// ErroDominio vive em internal/apierro (as features importam de lá — elas
// não podem importar este pacote, que importa as features pra montar as
// rotas). Os construtores abaixo são atalhos pro código deste pacote.
type ErroDominio = apierro.ErroDominio

func NaoEncontrado(detalhe string) error  { return apierro.NaoEncontrado(detalhe) }
func Conflito(detalhe string) error       { return apierro.Conflito(detalhe) }
func SemPermissao() error                 { return apierro.SemPermissao() }
func NaoAutenticado(detalhe string) error { return apierro.NaoAutenticado(detalhe) }
func Validacao(campos map[string]string) error {
	return apierro.Validacao(campos)
}

// apiHandler é um handler que pode devolver erro — elimina o
// `if err != nil { w.WriteHeader(500); return }` repetido em cada handler,
// que é onde é fácil vazar detalhe interno sem querer.
type apiHandler = apierro.Handler

// H adapta um apiHandler para http.HandlerFunc, convertendo erro em Problema
// pelo único ponto de conversão do backend. Nenhum handler escreve JSON de
// erro na mão.
func (s *Servidor) H(fn apiHandler) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			s.tratarErro(w, r, err)
		}
	}
}

func (s *Servidor) tratarErro(w http.ResponseWriter, r *http.Request, err error) {
	var ed *ErroDominio
	if errors.As(err, &ed) {
		s.escreverProblema(w, r, ed.Status, ed.Titulo, ed.Detail, ed.Codigo, ed.Campos)
		return
	}

	// Erro não mapeado: loga tudo no servidor, devolve só o genérico pro
	// cliente. Nunca err.Error() no corpo — pode conter nome de tabela,
	// driver do banco ou caminho de arquivo.
	s.log.ErrorContext(r.Context(), "erro interno não tratado", "erro", err, "caminho", r.URL.Path, "metodo", r.Method)
	s.escreverProblema(w, r, http.StatusInternalServerError, "Erro interno", "Erro interno. Tente novamente.", "erro_interno", nil)
}

func (s *Servidor) escreverProblema(w http.ResponseWriter, r *http.Request, status int, titulo, detalhe, codigo string, campos map[string]string) {
	p := Problema{
		Type:   "about:blank",
		Title:  titulo,
		Status: status,
		Detail: detalhe,
		Codigo: codigo,
		Campos: campos,
	}
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(p); err != nil {
		s.log.ErrorContext(r.Context(), "falha ao codificar problema", "erro", err)
	}
}
