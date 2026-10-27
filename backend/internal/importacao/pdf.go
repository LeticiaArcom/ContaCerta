package importacao

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"os/exec"
	"time"

	"meu-projeto/internal/apierro"
	"meu-projeto/internal/requisicao"
)

// LimitePDF é o tamanho máximo de PDF aceito no importador de pedidos.
const LimitePDF = 8 << 20

// TextoDoPDF extrai o texto de um PDF pesquisável com o pdftotext
// (poppler-utils, já instalado na imagem do backend — ver
// padroes/01-stack-permitida.md, seção PDF). PDF só de imagem (digitalizado)
// volta sem texto: aí a tela orienta colar o conteúdo.
func TextoDoPDF(w http.ResponseWriter, r *http.Request) error {
	if err := r.ParseMultipartForm(LimitePDF); err != nil {
		var maxBytes *http.MaxBytesError
		if errors.As(err, &maxBytes) {
			return &apierro.ErroDominio{Status: http.StatusRequestEntityTooLarge, Titulo: "Arquivo grande demais",
				Detail: "O PDF passa de 8 MB.", Codigo: "corpo_grande_demais"}
		}
		return apierro.EntradaInvalida("Envie o PDF no campo \"arquivo\".")
	}
	defer func() { _ = r.MultipartForm.RemoveAll() }()
	arquivo, _, err := r.FormFile("arquivo")
	if err != nil {
		return apierro.EntradaInvalida("Envie o PDF no campo \"arquivo\".")
	}
	defer arquivo.Close()

	cabecalho := make([]byte, 5)
	if _, err := io.ReadFull(arquivo, cabecalho); err != nil || !bytes.Equal(cabecalho, []byte("%PDF-")) {
		return apierro.Validacao(map[string]string{"arquivo": "O arquivo não é um PDF."})
	}
	if _, err := arquivo.Seek(0, io.SeekStart); err != nil {
		return err
	}

	tmp, err := os.CreateTemp("", "pedido-*.pdf")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name())
	if _, err := io.Copy(tmp, arquivo); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	var saida bytes.Buffer
	// Binário fixo; o único argumento variável é o caminho do arquivo
	// temporário que nós mesmos criamos (nada vindo do cliente).
	cmd := exec.CommandContext(ctx, "pdftotext", "-layout", "-enc", "UTF-8", tmp.Name(), "-") // #nosec G204
	cmd.Stdout = &saida
	if err := cmd.Run(); err != nil {
		return apierro.Validacao(map[string]string{"arquivo": "Não foi possível ler este PDF. Peça o arquivo original ou cole o conteúdo no campo de texto."})
	}
	return requisicao.JSON(w, http.StatusOK, map[string]string{"texto": saida.String()})
}
