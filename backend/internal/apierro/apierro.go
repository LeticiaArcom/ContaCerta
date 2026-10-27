// Package apierro define os erros de domínio que as features devolvem. A
// conversão erro -> HTTP (application/problem+json) continua num único
// ponto: internal/servidor/problema.go. Este pacote existe separado só pra
// as features não importarem o pacote servidor (que importa as features pra
// montar as rotas — seria ciclo).
package apierro

import "net/http"

// ErroDominio é o erro que uma feature retorna quando já sabe o status e o
// codigo HTTP corretos (não encontrado, conflito, validação...).
type ErroDominio struct {
	Status int
	Titulo string
	Detail string
	Codigo string
	Campos map[string]string
}

func (e *ErroDominio) Error() string { return e.Detail }

// Handler é um handler HTTP que devolve erro — o servidor converte.
type Handler func(w http.ResponseWriter, r *http.Request) error

// Adaptador transforma Handler em http.HandlerFunc (é o servidor.H).
type Adaptador func(Handler) http.HandlerFunc

func NaoEncontrado(detalhe string) error {
	return &ErroDominio{Status: http.StatusNotFound, Titulo: "Não encontrado", Detail: detalhe, Codigo: "nao_encontrado"}
}

func Conflito(detalhe string) error {
	return &ErroDominio{Status: http.StatusConflict, Titulo: "Conflito", Detail: detalhe, Codigo: "conflito"}
}

// VersaoDesatualizada é o 409 do controle otimista: alguém salvou o mesmo
// registro antes. O front recarrega em vez de sobrescrever em silêncio.
func VersaoDesatualizada() error {
	return &ErroDominio{
		Status: http.StatusConflict,
		Titulo: "Conflito",
		Detail: "Este registro foi alterado por outra pessoa. Recarregue a tela antes de salvar de novo.",
		Codigo: "versao_desatualizada",
	}
}

func SemPermissao() error {
	return &ErroDominio{Status: http.StatusForbidden, Titulo: "Sem permissão", Detail: "Você não tem acesso a este recurso.", Codigo: "sem_permissao"}
}

func NaoAutenticado(detalhe string) error {
	return &ErroDominio{Status: http.StatusUnauthorized, Titulo: "Não autenticado", Detail: detalhe, Codigo: "token_ausente"}
}

// EntradaInvalida é o 400 (JSON malformado, tipo errado).
func EntradaInvalida(detalhe string) error {
	return &ErroDominio{Status: http.StatusBadRequest, Titulo: "Requisição inválida", Detail: detalhe, Codigo: "entrada_invalida"}
}

// Validacao recebe um campo -> mensagem. Sempre 422.
func Validacao(campos map[string]string) error {
	return &ErroDominio{
		Status: http.StatusUnprocessableEntity,
		Titulo: "Dados inválidos",
		Detail: "Um ou mais campos estão inválidos.",
		Codigo: "validacao",
		Campos: campos,
	}
}

// Regra é um 422 de regra de negócio, sem campo específico.
func Regra(detalhe string) error {
	return &ErroDominio{Status: http.StatusUnprocessableEntity, Titulo: "Operação não permitida", Detail: detalhe, Codigo: "regra_de_negocio"}
}

// Indisponivel é o 503 de uma dependência externa (ex.: consulta de CNPJ).
func Indisponivel(detalhe string) error {
	return &ErroDominio{Status: http.StatusServiceUnavailable, Titulo: "Indisponível", Detail: detalhe, Codigo: "indisponivel"}
}
