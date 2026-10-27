package cotacao

import "testing"

func f(v float64) *float64 { return &v }

func TestEscolher(t *testing.T) {
	forn := []FornecedorCotacao{{ID: "a", Nome: "A"}, {ID: "b", Nome: "B"}}
	casos := []struct {
		nome     string
		modulo   string
		itens    []Item
		quer     float64
		querForn []string
	}{
		{
			nome:   "menor preço automático por item",
			modulo: ModuloHortifruti,
			itens: []Item{
				{ID: "1", Nome: "Alcatra", Qtd: f(10), Precos: map[string]*float64{"a": f(40), "b": f(38)}},
				{ID: "2", Nome: "Frango", Qtd: f(5), Precos: map[string]*float64{"a": f(12), "b": f(13)}},
			},
			quer: 380 + 60, querForn: []string{"b", "a"},
		},
		{
			nome:   "seleção manual prevalece sobre o menor preço",
			modulo: ModuloHortifruti,
			itens: []Item{
				{ID: "1", Nome: "Alcatra", Qtd: f(10), Precos: map[string]*float64{"a": f(40), "b": f(38)}, Selecionado: "a"},
			},
			quer: 400, querForn: []string{"a"},
		},
		{
			nome:   "quantidades alternativas não somam as faixas e escolhem o menor unitário",
			modulo: ModuloConsumo,
			itens: []Item{
				{ID: "1", Nome: "Caneta", Qtd: f(500), Precos: map[string]*float64{"a": f(2.5), "b": f(2.4)}},
				{ID: "2", Nome: "Caneta", Qtd: f(1000), Precos: map[string]*float64{"a": f(2.0), "b": f(2.1)}},
				{ID: "3", Nome: "caneta ", Qtd: f(3000), Precos: map[string]*float64{"a": f(1.9)}},
			},
			quer: 5700, querForn: []string{"a"},
		},
		{
			nome:   "escolha manual de uma faixa vale pro grupo",
			modulo: ModuloConsumo,
			itens: []Item{
				{ID: "1", Nome: "Caneta", Qtd: f(500), Precos: map[string]*float64{"a": f(2.5), "b": f(2.4)}, Selecionado: "b"},
				{ID: "2", Nome: "Caneta", Qtd: f(1000), Precos: map[string]*float64{"a": f(2.0)}},
			},
			quer: 1200, querForn: []string{"b"},
		},
		{
			nome:   "em hortifruti o mesmo produto em duas linhas são dois itens",
			modulo: ModuloHortifruti,
			itens: []Item{
				{ID: "1", Nome: "Alface", Qtd: f(2), Unidade: "cx", Precos: map[string]*float64{"a": f(30)}},
				{ID: "2", Nome: "Alface", Qtd: f(3), Unidade: "cx", Precos: map[string]*float64{"a": f(30)}},
			},
			quer: 150, querForn: []string{"a", "a"},
		},
		{
			nome:   "item sem quantidade ou sem preço fica fora",
			modulo: ModuloHortifruti,
			itens: []Item{
				{ID: "1", Nome: "Picanha", Precos: map[string]*float64{"a": f(80)}},
				{ID: "2", Nome: "Cupim", Qtd: f(4), Precos: map[string]*float64{}},
			},
			quer: 0, querForn: nil,
		},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			es := Escolher(c.modulo, Conteudo{Fornecedores: forn, Itens: c.itens})
			if got := TotalEscolhido(es); got != c.quer {
				t.Fatalf("total = %v, quer %v", got, c.quer)
			}
			if len(es) != len(c.querForn) {
				t.Fatalf("escolhas = %d, quer %d", len(es), len(c.querForn))
			}
			for i, e := range es {
				if e.FornecedorID != c.querForn[i] {
					t.Errorf("escolha %d = %s, quer %s", i, e.FornecedorID, c.querForn[i])
				}
			}
		})
	}
}

func TestDescricaoResumoNaoRepeteONome(t *testing.T) {
	casos := map[[2]string]string{
		{"Canetas", "Canetas personalizadas"}: "Canetas personalizadas",
		{"Canetas", ""}:                       "Canetas",
		{"Canetas", "Logo em 2 cores"}:        "Canetas - Logo em 2 cores",
		{"", "Só descrição"}:                  "Só descrição",
	}
	for entrada, quer := range casos {
		if got := DescricaoResumo(entrada[0], entrada[1]); got != quer {
			t.Errorf("DescricaoResumo(%q, %q) = %q, quer %q", entrada[0], entrada[1], got, quer)
		}
	}
}

func TestEfetivada(t *testing.T) {
	if Efetivada(ModuloConsumo, "EM NEGOCIAÇÃO", Conteudo{}) {
		t.Error("consumo em negociação não é compra")
	}
	if !Efetivada(ModuloConsumo, "APROVADO", Conteudo{}) {
		t.Error("consumo aprovado é compra")
	}
	comOS := Conteudo{Pedidos: map[string]*Pedido{"a": {OS: "123"}}}
	if !Efetivada(ModuloHortifruti, "EM COTAÇÃO", comOS) {
		t.Error("hortifruti com OS gerada já é compra")
	}
	if Efetivada(ModuloHortifruti, "EM COTAÇÃO", Conteudo{}) {
		t.Error("hortifruti sem pedido é orçamento")
	}
}
