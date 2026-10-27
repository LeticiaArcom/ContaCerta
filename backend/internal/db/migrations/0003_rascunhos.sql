-- Rascunho automático de formulário (lançamento de compra, cotação em
-- preenchimento...). Fica no servidor, por usuário: protege contra fechar a
-- aba ou faltar energia e vale em qualquer computador.
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE rascunhos (
    usuario_id    UUID        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    chave         TEXT        NOT NULL,
    conteudo      JSONB       NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, chave)
);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS rascunhos;
-- +goose StatementEnd
