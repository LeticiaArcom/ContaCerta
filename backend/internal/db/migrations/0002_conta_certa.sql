-- Estrutura do Conta Certa: usuários/sessões, fornecedores, lançamentos do
-- Resumo Inteligente, cotações (carnes e verduras + compras de consumo),
-- pedidos do restaurante, eventos e trilha de auditoria.
--
-- Exclusão é lógica (excluido_em) nos registros operacionais, e toda tabela
-- editável tem `versao` pra controle otimista (ninguém sobrescreve a edição
-- de outra pessoa em silêncio).
--
-- +goose Up
-- +goose StatementBegin
CREATE TABLE usuarios (
    id            UUID PRIMARY KEY,
    nome          TEXT        NOT NULL,
    email         TEXT        NOT NULL,
    senha_hash    TEXT        NOT NULL,
    papel         TEXT        NOT NULL CHECK (papel IN ('compras', 'restaurante')),
    ativo         BOOLEAN     NOT NULL DEFAULT TRUE,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX usuarios_email_unico ON usuarios (lower(email));

CREATE TABLE sessoes (
    token_hash BYTEA       PRIMARY KEY,
    usuario_id UUID        NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    expira_em  TIMESTAMPTZ NOT NULL,
    criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_usuario ON sessoes (usuario_id);

CREATE TABLE fornecedores (
    id            UUID PRIMARY KEY,
    codigo        TEXT        NOT NULL DEFAULT '',
    cnpj          TEXT        NOT NULL DEFAULT '',
    nome          TEXT        NOT NULL,
    contato       TEXT        NOT NULL DEFAULT '',
    telefone      TEXT        NOT NULL DEFAULT '',
    email         TEXT        NOT NULL DEFAULT '',
    endereco      TEXT        NOT NULL DEFAULT '',
    versao        INTEGER     NOT NULL DEFAULT 1,
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX fornecedores_cnpj_unico ON fornecedores (cnpj) WHERE cnpj <> '';
CREATE INDEX fornecedores_codigo ON fornecedores (codigo) WHERE codigo <> '';

-- Cotações: módulo "hortifruti" (carnes, frutas e verduras) e "consumo"
-- (compras por departamento). Fornecedores, itens, preços, seleções e
-- pedidos ficam em `conteudo` (JSONB) — é um documento editado inteiro pela
-- tela; os campos usados em filtro/listagem ficam em coluna própria.
CREATE TABLE cotacoes (
    id              UUID PRIMARY KEY,
    modulo          TEXT          NOT NULL CHECK (modulo IN ('hortifruti', 'consumo')),
    categoria       TEXT          NOT NULL DEFAULT '',
    formato         TEXT          NOT NULL DEFAULT 'lista' CHECK (formato IN ('lista', 'alternativas')),
    titulo          TEXT          NOT NULL DEFAULT '',
    ocs             TEXT          NOT NULL DEFAULT '',
    data            DATE          NOT NULL,
    periodo         TEXT          NOT NULL DEFAULT '',
    solicitante     TEXT          NOT NULL DEFAULT '',
    centro_custo    TEXT          NOT NULL DEFAULT '',
    situacao        TEXT          NOT NULL,
    provisionado    TEXT          NOT NULL DEFAULT 'PENDENTE',
    descricao       TEXT          NOT NULL DEFAULT '',
    conteudo        JSONB         NOT NULL DEFAULT '{}'::jsonb,
    total_escolhido NUMERIC(14,2) NOT NULL DEFAULT 0,
    pedido_id       UUID,
    versao          INTEGER       NOT NULL DEFAULT 1,
    criado_por      UUID REFERENCES usuarios (id),
    atualizado_por  UUID REFERENCES usuarios (id),
    criado_em       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    excluido_em     TIMESTAMPTZ
);
CREATE INDEX cotacoes_modulo_data ON cotacoes (modulo, data DESC) WHERE excluido_em IS NULL;

-- Lançamentos do Resumo Inteligente. `tipo` separa compra realizada de
-- orçamento (que aparece no resumo, mas não soma no total do dia).
-- O id é texto pra preservar os identificadores do sistema anterior na
-- migração (upsert pelo mesmo id, sem duplicar).
CREATE TABLE compras (
    id                TEXT PRIMARY KEY,
    tipo              TEXT          NOT NULL DEFAULT 'compra' CHECK (tipo IN ('compra', 'orcamento')),
    data              DATE          NOT NULL,
    solicitante       TEXT          NOT NULL DEFAULT '',
    area              TEXT          NOT NULL DEFAULT '',
    cnpj              TEXT          NOT NULL DEFAULT '',
    codigo_fornecedor TEXT          NOT NULL DEFAULT '',
    fornecedor        TEXT          NOT NULL DEFAULT '',
    ocs               TEXT          NOT NULL DEFAULT '',
    descricao         TEXT          NOT NULL DEFAULT '',
    valor             NUMERIC(14,2) NOT NULL DEFAULT 0,
    prazo_pagamento   TEXT          NOT NULL DEFAULT '',
    provisionado      TEXT          NOT NULL DEFAULT 'PENDENTE',
    autorizador       TEXT          NOT NULL DEFAULT '',
    aprovador         TEXT          NOT NULL DEFAULT '',
    situacao          TEXT          NOT NULL DEFAULT '',
    origem_cotacao_id UUID REFERENCES cotacoes (id),
    origem_chave      TEXT          NOT NULL DEFAULT '',
    versao            INTEGER       NOT NULL DEFAULT 1,
    criado_por        UUID REFERENCES usuarios (id),
    atualizado_por    UUID REFERENCES usuarios (id),
    criado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    excluido_em       TIMESTAMPTZ
);
CREATE INDEX compras_data ON compras (data DESC) WHERE excluido_em IS NULL;
CREATE UNIQUE INDEX compras_origem_unica ON compras (origem_cotacao_id, origem_chave)
    WHERE origem_cotacao_id IS NOT NULL AND excluido_em IS NULL;

-- Pedidos que o time do restaurante preenche (itens, quantidades, entrega).
-- A compradora transforma o pedido numa cotação de carnes e verduras.
CREATE TABLE pedidos_restaurante (
    id            UUID PRIMARY KEY,
    categoria     TEXT        NOT NULL,
    periodo       TEXT        NOT NULL DEFAULT '',
    observacao    TEXT        NOT NULL DEFAULT '',
    itens         JSONB       NOT NULL DEFAULT '[]'::jsonb,
    situacao      TEXT        NOT NULL DEFAULT 'RASCUNHO',
    cotacao_id    UUID REFERENCES cotacoes (id),
    versao        INTEGER     NOT NULL DEFAULT 1,
    criado_por    UUID        NOT NULL REFERENCES usuarios (id),
    criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    excluido_em   TIMESTAMPTZ
);
CREATE INDEX pedidos_restaurante_criado ON pedidos_restaurante (criado_em DESC) WHERE excluido_em IS NULL;

ALTER TABLE cotacoes ADD CONSTRAINT cotacoes_pedido_fk FOREIGN KEY (pedido_id) REFERENCES pedidos_restaurante (id);

CREATE TABLE eventos (
    id                 UUID PRIMARY KEY,
    nome               TEXT          NOT NULL,
    local              TEXT          NOT NULL DEFAULT '',
    cidade             TEXT          NOT NULL DEFAULT '',
    data               DATE,
    participantes      INTEGER       NOT NULL DEFAULT 0,
    estados            TEXT          NOT NULL DEFAULT '',
    ocs                TEXT          NOT NULL DEFAULT '',
    hospedados         INTEGER       NOT NULL DEFAULT 0,
    situacao           TEXT          NOT NULL DEFAULT 'PLANEJAMENTO',
    valor_orcado       NUMERIC(14,2) NOT NULL DEFAULT 0,
    credito_fornecedor NUMERIC(14,2) NOT NULL DEFAULT 0,
    observacoes        TEXT          NOT NULL DEFAULT '',
    despesas           JSONB         NOT NULL DEFAULT '[]'::jsonb,
    versao             INTEGER       NOT NULL DEFAULT 1,
    criado_por         UUID REFERENCES usuarios (id),
    atualizado_por     UUID REFERENCES usuarios (id),
    criado_em          TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    excluido_em        TIMESTAMPTZ
);

CREATE TABLE auditoria (
    id          BIGSERIAL PRIMARY KEY,
    usuario_id  UUID REFERENCES usuarios (id),
    acao        TEXT        NOT NULL,
    entidade    TEXT        NOT NULL,
    entidade_id TEXT        NOT NULL,
    em          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_entidade ON auditoria (entidade, entidade_id);
-- +goose StatementEnd

-- +goose Down
-- +goose StatementBegin
DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS eventos;
ALTER TABLE cotacoes DROP CONSTRAINT IF EXISTS cotacoes_pedido_fk;
DROP TABLE IF EXISTS pedidos_restaurante;
DROP TABLE IF EXISTS compras;
DROP TABLE IF EXISTS cotacoes;
DROP TABLE IF EXISTS fornecedores;
DROP TABLE IF EXISTS sessoes;
DROP TABLE IF EXISTS usuarios;
-- +goose StatementEnd
