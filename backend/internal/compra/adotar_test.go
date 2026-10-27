package compra

import "testing"

func TestAdotarLegado(t *testing.T) {
	casos := []struct {
		nome      string
		atuais    map[string]Compra
		linhas    []LinhaOrigem
		querIDs   map[string]string // chave da linha -> id do lançamento adotado
		querSobra []string          // chaves que continuam sem par
	}{
		{
			nome:    "mesmo fornecedor adota",
			atuais:  map[string]Compra{"legado:x": {ID: "x", Fornecedor: "GRAFICA X"}, "legado:y": {ID: "y", Fornecedor: "LOJA Y"}},
			linhas:  []LinhaOrigem{{Chave: "forn:2", Fornecedor: "loja y"}, {Chave: "forn:1", Fornecedor: "Grafica X "}},
			querIDs: map[string]string{"forn:1": "x", "forn:2": "y"},
		},
		{
			nome:    "um legado e uma linha sem par se ligam",
			atuais:  map[string]Compra{"legado:a": {ID: "a", Fornecedor: "Seleção da cotação"}},
			linhas:  []LinhaOrigem{{Chave: "orcamento"}},
			querIDs: map[string]string{"orcamento": "a"},
		},
		{
			nome:      "dois legados sem fornecedor igual não chuta",
			atuais:    map[string]Compra{"legado:a": {ID: "a", Fornecedor: "A"}, "legado:b": {ID: "b", Fornecedor: "B"}},
			linhas:    []LinhaOrigem{{Chave: "forn:1", Fornecedor: "C"}},
			querIDs:   map[string]string{},
			querSobra: []string{"legado:a", "legado:b"},
		},
		{
			nome:      "linha que já tem par não adota",
			atuais:    map[string]Compra{"forn:1": {ID: "atual", Fornecedor: "A"}, "legado:a": {ID: "a", Fornecedor: "A"}},
			linhas:    []LinhaOrigem{{Chave: "forn:1", Fornecedor: "A"}},
			querIDs:   map[string]string{"forn:1": "atual"},
			querSobra: []string{"legado:a"},
		},
	}
	for _, c := range casos {
		t.Run(c.nome, func(t *testing.T) {
			adotar(c.atuais, c.linhas)
			for chave, id := range c.querIDs {
				if got := c.atuais[chave].ID; got != id {
					t.Errorf("linha %s adotou %q, quer %q", chave, got, id)
				}
			}
			for _, k := range c.querSobra {
				if _, ok := c.atuais[k]; !ok {
					t.Errorf("%s deveria continuar sem par", k)
				}
			}
		})
	}
}
