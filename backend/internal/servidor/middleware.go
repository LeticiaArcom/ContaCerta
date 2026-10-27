package servidor

import (
	"net/http"
	"net/url"
	"strings"
)

// headersSeguros aplica um piso de defesas em toda resposta da API. Não
// substitui as regras da skill `seguranca`, mas garante que nenhuma rota saia
// sem o básico.
func headersSeguros(producao bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff") // não "adivinhe" o content-type
			h.Set("X-Frame-Options", "DENY")           // não deixa embutir em iframe (clickjacking)
			h.Set("Referrer-Policy", "no-referrer")    // não vaza a URL interna no Referer
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
			if producao {
				// só faz sentido atrás de HTTPS de verdade (reverse proxy da infra)
				h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

// limiteDeCorpo recusa corpo de requisição maior que limite bytes. Sem isso,
// um cliente mal-intencionado pode mandar um corpo gigante e esgotar memória
// antes mesmo da validação rodar.
func limiteDeCorpo(limite int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, limite)
			next.ServeHTTP(w, r)
		})
	}
}

var metodosQueMudamEstado = map[string]bool{
	http.MethodPost:   true,
	http.MethodPut:    true,
	http.MethodPatch:  true,
	http.MethodDelete: true,
}

// origemPermitida é o guard de CSRF. A sessão vive em cookie
// (HttpOnly; SameSite=Lax), então o navegador manda o cookie automaticamente
// em qualquer requisição de qualquer origem — SameSite=Lax barra a maioria,
// mas isso aqui é a segunda camada: em todo método que muda estado, se o
// header Origin vier preenchido, ele tem que apontar pro mesmo host da
// requisição. Um site de terceiro tentando forjar um POST não bate.
//
// O proxy do Vite (dev) troca o Host pelo do backend (changeOrigin) e guarda
// o original em X-Forwarded-Host — por isso ele também vale. Um site de
// terceiro não consegue mandar esse header: header customizado de outra
// origem exige preflight de CORS, que este backend nunca libera.
func (s *Servidor) origemPermitida(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if metodosQueMudamEstado[r.Method] {
			origem := r.Header.Get("Origin")
			if origem != "" {
				u, err := url.Parse(origem)
				encaminhado := strings.TrimSpace(strings.SplitN(r.Header.Get("X-Forwarded-Host"), ",", 2)[0])
				mesmoHost := err == nil && (strings.EqualFold(u.Host, r.Host) || (encaminhado != "" && strings.EqualFold(u.Host, encaminhado)))
				if !mesmoHost {
					s.escreverProblema(w, r, http.StatusForbidden,
						"Origem não permitida", "Requisição de origem não confiável.", "origem_invalida", nil)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
