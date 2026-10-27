package fornecedor

import "strings"

// SoDigitos tira pontuação ("12.345.678/0001-90" -> "12345678000190").
func SoDigitos(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// FormatarCNPJ devolve 00.000.000/0000-00 (ou o texto original se não tiver
// 14 dígitos).
func FormatarCNPJ(s string) string {
	d := SoDigitos(s)
	if len(d) != 14 {
		return strings.TrimSpace(s)
	}
	return d[0:2] + "." + d[2:5] + "." + d[5:8] + "/" + d[8:12] + "-" + d[12:14]
}

// CNPJValido confere os dois dígitos verificadores.
func CNPJValido(s string) bool {
	d := SoDigitos(s)
	if len(d) != 14 {
		return false
	}
	iguais := true
	for i := 1; i < 14; i++ {
		if d[i] != d[0] {
			iguais = false
			break
		}
	}
	if iguais {
		return false
	}
	calc := func(n int) byte {
		pesos := []int{6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2}
		soma := 0
		for i := 0; i < n; i++ {
			soma += int(d[i]-'0') * pesos[len(pesos)-n+i]
		}
		r := soma % 11
		if r < 2 {
			return '0'
		}
		return byte('0' + 11 - r)
	}
	return d[12] == calc(12) && d[13] == calc(13)
}
