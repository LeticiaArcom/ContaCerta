import { novoFornecedor } from "@/core/cotacao";
import { baixarBlob, copiarTexto, nomeArquivo } from "@/core/exportar";
import { copiarImagem, gerarImagem, type Relatorio } from "@/core/imagem";
import { useEstadoUI } from "@/core/estadoUI";
import { pedirTexto } from "@/core/janelas";
import { notificar } from "@/core/toast";
import type { ConteudoCotacao } from "@/tipos/api";

/** Copia o relatório como imagem pra área de transferência. */
export async function copiarRelatorio(rel: Relatorio) {
  const { iniciarOcupado, terminarOcupado } = useEstadoUI.getState();
  iniciarOcupado();
  try {
    await copiarImagem(gerarImagem(rel));
    notificar.sucesso("Imagem copiada. É só colar no WhatsApp ou no e-mail.");
  } catch {
    notificar.erro("O navegador não permitiu copiar a imagem. Use \"Baixar PNG\".");
  } finally {
    terminarOcupado();
  }
}

export async function baixarRelatorio(rel: Relatorio, nome: string) {
  const { iniciarOcupado, terminarOcupado } = useEstadoUI.getState();
  iniciarOcupado();
  try {
    baixarBlob(await gerarImagem(rel), nomeArquivo(nome, "png"));
  } catch {
    notificar.erro("Não foi possível gerar a imagem.");
  } finally {
    terminarOcupado();
  }
}

export async function copiarTextoComAviso(texto: string, aviso: string) {
  try {
    await copiarTexto(texto);
    notificar.sucesso(aviso);
  } catch {
    notificar.erro("O navegador não permitiu copiar o texto.");
  }
}

/** Pede o nome e cria uma nova coluna de fornecedor (itens e preços ficam como estão). */
export async function adicionarFornecedor(aoMudar: (fn: (c: ConteudoCotacao) => ConteudoCotacao) => void) {
  const nome = await pedirTexto({ titulo: "Adicionar fornecedor", rotulo: "Nome do fornecedor", confirmar: "Adicionar" });
  if (!nome) return;
  aoMudar((c) => ({ ...c, fornecedores: [...c.fornecedores, novoFornecedor(nome.toUpperCase())] }));
}
