package servidor_test

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
	"github.com/pressly/goose/v3"

	"meu-projeto/internal/config"
	"meu-projeto/internal/db"
	"meu-projeto/internal/servidor"
)

// Teste de ponta a ponta com Postgres de verdade. Só roda com
// TEST_DATABASE_URL apontando pra um banco DESCARTÁVEL (o teste apaga tudo):
//
//	TEST_DATABASE_URL=postgresql://app@localhost:5432/app_teste go test ./internal/servidor/
func novoServidorComBanco(t *testing.T) *httptest.Server {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definida — pulando teste com banco")
	}
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	// Banco descartável: recomeça do zero a cada execução (texto fixo, sem
	// nenhum dado de fora).
	if _, err := sqlDB.ExecContext(t.Context(), "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"); err != nil {
		t.Fatal(err)
	}
	goose.SetBaseFS(db.Migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		t.Fatal(err)
	}
	goose.SetLogger(goose.NopLogger())
	if err := goose.Up(sqlDB, "migrations"); err != nil {
		t.Fatal(err)
	}
	gdb, err := db.AbrirPostgres(url)
	if err != nil {
		t.Fatal(err)
	}
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	srv := httptest.NewServer(servidor.Novo(&config.Config{Env: "development", Port: "3000"}, log, gdb, nil))
	t.Cleanup(srv.Close)
	return srv
}

type cliente struct {
	t    *testing.T
	base string
	http *http.Client
}

func novoCliente(t *testing.T, base string) *cliente {
	jar, _ := cookiejar.New(nil)
	return &cliente{t: t, base: base, http: &http.Client{Jar: jar}}
}

func (c *cliente) req(metodo, caminho string, corpo any, destino any) int {
	c.t.Helper()
	var r io.Reader
	if corpo != nil {
		b, _ := json.Marshal(corpo)
		r = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(metodo, strings.Join([]string{c.base, "/api/v1", caminho}, ""), r)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		c.t.Fatal(err)
	}
	defer resp.Body.Close()
	if destino != nil {
		_ = json.NewDecoder(resp.Body).Decode(destino)
	}
	return resp.StatusCode
}

func TestFluxoCompleto(t *testing.T) {
	srv := novoServidorComBanco(t)
	compras := novoCliente(t, srv.URL)

	if s := compras.req("GET", "/compras", nil, nil); s != http.StatusUnauthorized {
		t.Fatalf("sem sessão: status %d, quer 401", s)
	}
	conta := map[string]string{"nome": "Compras", "email": "compras@teste.com", "senha": "senha-de-teste-1"}
	if s := compras.req("POST", "/sessao/configuracao-inicial", conta, nil); s != http.StatusCreated {
		t.Fatalf("configuração inicial: %d", s)
	}
	if s := novoCliente(t, srv.URL).req("POST", "/sessao/configuracao-inicial", conta, nil); s != http.StatusConflict {
		t.Fatalf("segunda configuração inicial deveria ser recusada: %d", s)
	}

	// Lançamento e edição pelo mesmo id, com controle de versão.
	entrada := map[string]any{"tipo": "compra", "data": "2026-10-27", "solicitante": "ROSSI", "area": "Marketing",
		"cnpj": "", "codigoFornecedor": "77", "fornecedor": "GALLATA", "ocs": "1", "descricao": "x", "valor": 10.0,
		"prazoPagamento": "28 DIAS", "provisionado": "PENDENTE", "autorizador": "", "aprovador": "", "situacao": "", "versao": 0}
	var criada struct {
		ID     string `json:"id"`
		Versao int    `json:"versao"`
	}
	if s := compras.req("POST", "/compras", entrada, &criada); s != http.StatusCreated {
		t.Fatalf("criar compra: %d", s)
	}
	entrada["valor"] = 20.0
	entrada["versao"] = criada.Versao
	if s := compras.req("PUT", "/compras/"+criada.ID, entrada, nil); s != http.StatusOK {
		t.Fatalf("editar compra: %d", s)
	}
	if s := compras.req("PUT", "/compras/"+criada.ID, entrada, nil); s != http.StatusConflict {
		t.Fatalf("editar com versão velha deveria dar 409: %d", s)
	}
	var lista struct {
		Paginacao struct {
			Total int `json:"total"`
		} `json:"paginacao"`
	}
	compras.req("GET", "/compras?data=2026-10-27", nil, &lista)
	if lista.Paginacao.Total != 1 {
		t.Fatalf("editar não pode duplicar: %d lançamentos", lista.Paginacao.Total)
	}

	// Campo desconhecido é recusado (mass assignment).
	entrada["criadoPor"] = "alguém"
	if s := compras.req("POST", "/compras", entrada, nil); s != http.StatusBadRequest {
		t.Fatalf("campo desconhecido: %d, quer 400", s)
	}

	// Papel restaurante: só pedidos, e só os próprios.
	rest := map[string]string{"nome": "Restaurante", "email": "rest@teste.com", "senha": "senha-de-teste-2", "papel": "restaurante"}
	if s := compras.req("POST", "/usuarios", rest, nil); s != http.StatusCreated {
		t.Fatalf("criar usuário restaurante: %d", s)
	}
	restaurante := novoCliente(t, srv.URL)
	if s := restaurante.req("POST", "/sessao", map[string]string{"email": "rest@teste.com", "senha": "senha-de-teste-2"}, nil); s != http.StatusOK {
		t.Fatalf("login restaurante: %d", s)
	}
	if s := restaurante.req("GET", "/compras", nil, nil); s != http.StatusForbidden {
		t.Fatalf("restaurante vendo compras: %d, quer 403", s)
	}
	pedido := map[string]any{"categoria": "Carnes", "periodo": "", "observacao": "", "enviar": true, "versao": 0,
		"itens": []map[string]any{{"id": "a", "nome": "Alcatra", "qtd": 10, "unidade": "kg", "entrega": "", "observacao": ""}}}
	var p struct {
		ID string `json:"id"`
	}
	if s := restaurante.req("POST", "/pedidos-restaurante", pedido, &p); s != http.StatusCreated {
		t.Fatalf("criar pedido: %d", s)
	}
	if s := compras.req("GET", "/pedidos-restaurante/"+p.ID, nil, nil); s != http.StatusOK {
		t.Fatalf("compras vê pedido enviado: %d", s)
	}

	// Login com senha errada: mensagem genérica, 401.
	var problema struct {
		Codigo string `json:"codigo"`
	}
	if s := novoCliente(t, srv.URL).req("POST", "/sessao", map[string]string{"email": "rest@teste.com", "senha": "errada-errada"}, &problema); s != http.StatusUnauthorized || problema.Codigo != "credenciais_invalidas" {
		t.Fatalf("senha errada: %d %s", s, problema.Codigo)
	}

	// Logout derruba a sessão no servidor.
	restaurante.req("POST", "/sessao/logout", nil, nil)
	if s := restaurante.req("GET", "/sessao", nil, nil); s != http.StatusUnauthorized {
		t.Fatalf("depois do logout: %d, quer 401", s)
	}
}
