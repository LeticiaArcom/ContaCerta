package cotacao

import (
	"math"
	"strings"
)

// Escolha é a decisão de compra de um item (ou de um grupo de quantidades
// alternativas): qual fornecedor, a que preço, quanto dá.
type Escolha struct {
	ItemID        string
	FornecedorID  string
	PrecoUnitario float64
	Quantidade    float64
	Total         float64
	Manual        bool
}

func valor(p *float64) float64 {
	if p == nil || math.IsNaN(*p) || *p <= 0 {
		return 0
	}
	return *p
}

func centavos(v float64) float64 { return math.Round(v*100) / 100 }

// chaveProduto normaliza o nome pra reconhecer o mesmo produto em linhas
// diferentes (sem acento, sem caixa, espaços colapsados).
func chaveProduto(nome string) string {
	return strings.Join(strings.Fields(semAcento.Replace(strings.ToLower(nome))), " ")
}

var semAcento = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c", "ñ", "n",
)

// grupos separa os itens em grupos de decisão. Em hortifruti cada linha é
// independente. Em consumo, linhas com o mesmo produto viram quantidades
// alternativas (uma única opção escolhida por grupo) — no formato
// "alternativas" isso é o normal; no formato "lista" é reconhecido sozinho
// quando o mesmo produto aparece com quantidades diferentes.
func grupos(modulo string, itens []Item) [][]Item {
	if modulo != ModuloConsumo {
		gs := make([][]Item, 0, len(itens))
		for _, it := range itens {
			gs = append(gs, []Item{it})
		}
		return gs
	}
	ordem := []string{}
	porChave := map[string][]Item{}
	for i, it := range itens {
		k := chaveProduto(it.Nome)
		if k == "" {
			k = "\x00" + it.ID + string(rune(i)) // linha sem nome nunca agrupa
		}
		if _, ok := porChave[k]; !ok {
			ordem = append(ordem, k)
		}
		porChave[k] = append(porChave[k], it)
	}
	gs := make([][]Item, 0, len(ordem))
	for _, k := range ordem {
		gs = append(gs, porChave[k])
	}
	return gs
}

// Escolher aplica a regra: o menor preço é escolhido automaticamente, mas a
// seleção manual sempre prevalece. Em quantidades alternativas o menor
// preço é o menor valor UNITÁRIO entre todas as opções (independente da
// quantidade) e as linhas nunca são somadas entre si.
func Escolher(modulo string, c Conteudo) []Escolha {
	fornecedores := map[string]bool{}
	for _, f := range c.Fornecedores {
		fornecedores[f.ID] = true
	}
	var escolhas []Escolha
	for _, g := range grupos(modulo, c.Itens) {
		var melhor, manual *Escolha
		for _, it := range g {
			qtd := valor(it.Qtd)
			if qtd == 0 {
				continue
			}
			for _, f := range c.Fornecedores {
				p := valor(it.Precos[f.ID])
				if p == 0 {
					continue
				}
				e := Escolha{ItemID: it.ID, FornecedorID: f.ID, PrecoUnitario: p, Quantidade: qtd, Total: centavos(qtd * p)}
				if melhor == nil || p < melhor.PrecoUnitario {
					m := e
					melhor = &m
				}
				if it.Selecionado == f.ID && fornecedores[f.ID] && manual == nil {
					m := e
					m.Manual = true
					manual = &m
				}
			}
		}
		switch {
		case manual != nil:
			escolhas = append(escolhas, *manual)
		case melhor != nil:
			escolhas = append(escolhas, *melhor)
		}
	}
	return escolhas
}

// TotalEscolhido soma as escolhas (uma por grupo — nunca soma faixas
// alternativas como se fossem produtos distintos).
func TotalEscolhido(es []Escolha) float64 {
	t := 0.0
	for _, e := range es {
		t += e.Total
	}
	return centavos(t)
}

// PorFornecedor agrupa o total escolhido por fornecedor, na ordem das colunas.
func PorFornecedor(c Conteudo, es []Escolha) []struct {
	Fornecedor FornecedorCotacao
	Total      float64
	Itens      int
} {
	soma := map[string]float64{}
	qtd := map[string]int{}
	for _, e := range es {
		soma[e.FornecedorID] += e.Total
		qtd[e.FornecedorID]++
	}
	var out []struct {
		Fornecedor FornecedorCotacao
		Total      float64
		Itens      int
	}
	for _, f := range c.Fornecedores {
		if qtd[f.ID] == 0 {
			continue
		}
		out = append(out, struct {
			Fornecedor FornecedorCotacao
			Total      float64
			Itens      int
		}{f, centavos(soma[f.ID]), qtd[f.ID]})
	}
	return out
}
