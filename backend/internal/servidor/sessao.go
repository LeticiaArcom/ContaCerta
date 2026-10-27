package servidor

import (
	"net/http"

	"meu-projeto/internal/usuario"
)

// exigirSessao barra toda rota do grupo sem cookie de sessão válido e põe o
// usuário autenticado no contexto (ver .claude/skills/autenticacao).
func (s *Servidor) exigirSessao(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(usuario.NomeCookie)
		if err != nil || cookie.Value == "" {
			s.escreverProblema(w, r, http.StatusUnauthorized, "Não autenticado",
				"Faça login para continuar.", "token_ausente", nil)
			return
		}
		u, err := s.usuarios.Validar(r.Context(), cookie.Value)
		if err != nil {
			s.escreverProblema(w, r, http.StatusUnauthorized, "Sessão inválida",
				"Sua sessão expirou. Faça login novamente.", "token_expirado", nil)
			return
		}
		next.ServeHTTP(w, r.WithContext(usuario.ComUsuario(r.Context(), u)))
	})
}

// exigirPapel restringe o grupo a um papel. O time do restaurante só chega
// nos pedidos; o resto do sistema é da área de Compras.
func (s *Servidor) exigirPapel(papel string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			u := usuario.DoContexto(r.Context())
			if u == nil || u.Papel != papel {
				s.escreverProblema(w, r, http.StatusForbidden, "Sem permissão",
					"Você não tem acesso a este recurso.", "sem_permissao", nil)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
