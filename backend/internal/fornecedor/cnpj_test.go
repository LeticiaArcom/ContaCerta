package fornecedor

import "testing"

func TestCNPJ(t *testing.T) {
	casos := []struct {
		entrada string
		valido  bool
		fmt     string
	}{
		{"11.222.333/0001-81", true, "11.222.333/0001-81"},
		{"11222333000181", true, "11.222.333/0001-81"},
		{"11.222.333/0001-80", false, ""},
		{"00.000.000/0000-00", false, ""},
		{"123", false, ""},
	}
	for _, c := range casos {
		if got := CNPJValido(c.entrada); got != c.valido {
			t.Errorf("CNPJValido(%q) = %v, quer %v", c.entrada, got, c.valido)
		}
		if c.valido {
			if got := FormatarCNPJ(c.entrada); got != c.fmt {
				t.Errorf("FormatarCNPJ(%q) = %q, quer %q", c.entrada, got, c.fmt)
			}
		}
	}
}
