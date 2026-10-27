# Conta Certa | Compras e Eventos

Sistema da área de Compras da ARCOM para cotações, compras de consumo,
prestação de contas diária e acompanhamento de eventos. Segue o Padrão ARCOM
(`specs/`): frontend React + Vite, backend Go, banco Postgres.

## Rodar

```bash
docker compose up --build   # abre em http://localhost:8080
```

No **primeiro acesso** a tela de login pede para criar a conta da área de
Compras. Depois disso, em **Usuários**, crie as contas do time do restaurante
(papel *Restaurante*).

## Módulos

| Módulo | O que faz |
|---|---|
| Pedidos do restaurante | O time do restaurante preenche o pedido da semana (itens, quantidade, unidade, entrega). Compras recebe e transforma em cotação. |
| Cotação de carnes e verduras | Cotação semanal (sexta-feira) com vários fornecedores, menor preço automático e escolha manual, pedido por fornecedor com OS, envio do pedido e acompanhamento da entrada da NF. |
| Compras de consumo | Cotações por departamento (Marketing, Informática, Estoque, Manutenção Patrimonial, Almoxarifado, Treinamentos, Eventos...), lista de itens ou quantidades alternativas, prazo de pagamento e entrega por fornecedor, ordem de compra em PDF. |
| Resumo Inteligente | Lançar compra, resumo diário (compras realizadas por área e valor + orçamentos realizados, com cópia em imagem) e histórico com controle de provisionamento. Toda cotação aparece no resumo automaticamente. |
| Acompanhamento de eventos | Vários eventos com data, cidade, local, participantes, hospedagens e todas as despesas, orçado x efetivo. |
| Fornecedores, Usuários, Backup | Cadastro de fornecedores (aprende sozinho com as compras), acesso por papel, backup completo e importação do sistema anterior. |

## Migração do sistema anterior

No sistema antigo, gere o **Backup Geral** (JSON). Aqui, em **Backup e
importação → Importar backup do sistema anterior**, selecione o arquivo:
compras do Resumo (incluindo a base de 149 lançamentos), cotações, eventos e
fornecedores entram no banco. Cada registro mantém o identificador original,
então importar o mesmo arquivo de novo atualiza sem duplicar.

## Onde fica cada coisa

- `frontend/src/pages/` — uma tela por arquivo; `frontend/src/core/` —
  formatação, cálculo da cotação, imagem executiva, importação de pedidos.
- `backend/internal/<recurso>/` — um pacote por módulo (`compra`, `cotacao`,
  `pedido`, `evento`, `fornecedor`, `usuario`, `importacao`, `rascunho`).
- `backend/internal/db/migrations/` — estrutura do banco (goose).
- `specs/` — Padrão ARCOM (regras, design system). Não editar.

Verificação completa: `./specs/scripts/verificar.sh`.
