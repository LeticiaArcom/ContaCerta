package servidor

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/httprate"

	"meu-projeto/internal/compra"
	"meu-projeto/internal/cotacao"
	"meu-projeto/internal/evento"
	"meu-projeto/internal/fornecedor"
	"meu-projeto/internal/importacao"
	"meu-projeto/internal/pedido"
	"meu-projeto/internal/usuario"
)

// rotas monta toda a árvore de rotas num lugar só — mais fácil de auditar do
// que rota espalhada em vários arquivos. /api/health e /api/ready ficam fora
// da versão porque a infra depende deles; rotas de negócio entram sob
// /api/v1 (ver padroes/09-contrato-api.md).
//
// Acesso:
//   - público: login, logout e configuração inicial (primeira conta);
//   - qualquer sessão: quem sou eu, pedidos do restaurante, leitura de PDF;
//   - papel "compras": todo o resto.
func (s *Servidor) rotas() {
	usuarios := usuario.NovoHandler(s.usuarios, s.cfg.Env == "production")
	fornecedores := fornecedor.NovoHandler(fornecedor.NovoService(s.db))
	compras := compra.NovoHandler(compra.NovoService(s.db))
	cotacoesSvc := cotacao.NovoService(s.db)
	cotacoes := cotacao.NovoHandler(cotacoesSvc)
	pedidos := pedido.NovoHandler(s.db)
	eventos := evento.NovoHandler(evento.NovoService(s.db))
	importacoes := importacao.NovoHandler(s.db, cotacoesSvc)

	s.router.Route("/api", func(api chi.Router) {
		api.Get("/health", s.saude)
		api.Get("/ready", s.H(s.pronto))

		api.Route("/v1", func(v1 chi.Router) {
			// Upload de PDF tem limite próprio (maior); o resto, 1 MB.
			v1.Group(func(g chi.Router) {
				g.Use(limiteDeCorpo(importacao.LimitePDF + 1<<20))
				g.Use(s.exigirSessao)
				g.Post("/importacao/pdf", s.H(importacao.TextoDoPDF))
			})

			v1.Group(func(v chi.Router) {
				v.Use(limiteDeCorpo(1 << 20)) // 1 MB

				// Login com rate limit mais agressivo (força bruta).
				v.Group(func(pub chi.Router) {
					pub.Use(httprate.LimitBy(10, time.Minute, chaveDeCliente))
					usuarios.RotasPublicas(pub, s.H)
				})

				v.Group(func(priv chi.Router) {
					priv.Use(s.exigirSessao)
					usuarios.RotasSessao(priv, s.H)
					pedidos.Rotas(priv, s.H)

					priv.Group(func(adm chi.Router) {
						adm.Use(s.exigirPapel(usuario.PapelCompras))
						usuarios.RotasAdmin(adm, s.H)
						fornecedores.Rotas(adm, s.H)
						compras.Rotas(adm, s.H)
						cotacoes.Rotas(adm, s.H)
						eventos.Rotas(adm, s.H)
						importacoes.Rotas(adm, s.H)
					})
				})
			})
		})
	})

	// Rota inexistente/método errado também sai no formato do contrato — o
	// front nunca recebe um 404 de texto puro do chi.
	s.router.NotFound(func(w http.ResponseWriter, r *http.Request) {
		s.escreverProblema(w, r, http.StatusNotFound, "Não encontrado", "Rota não encontrada.", "nao_encontrado", nil)
	})
	s.router.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) {
		s.escreverProblema(w, r, http.StatusMethodNotAllowed, "Método não permitido", "Método não permitido para esta rota.", "metodo_nao_permitido", nil)
	})
}
