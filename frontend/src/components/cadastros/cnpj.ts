// Máscara e validação de CNPJ (mesma regra do backend: dígitos verificadores).

export function soDigitos(s: string): string {
  return s.replace(/\D/g, "");
}

/** Aplica 00.000.000/0000-00 conforme a pessoa digita. */
export function mascaraCNPJ(s: string): string {
  const d = soDigitos(s).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

export function cnpjValido(s: string): boolean {
  const d = soDigitos(s);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (n: number) => {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - n);
    const soma = pesos.reduce((s2, p, i) => s2 + Number(d[i]) * p, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return Number(d[12]) === calc(12) && Number(d[13]) === calc(13);
}
