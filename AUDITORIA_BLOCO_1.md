# BLOCO 1 — INVENTÁRIO DE ARQUIVOS (LEITURA APENAS, NENHUMA ALTERAÇÃO)

Arq  | Arquivo | Propósito no Fiados | Linhas (aprox) | Auditado antes? | Status
---|---|---|---|---|---
1  | src/components/CRM/FiadosView.tsx | UI principal do módulo Fiados | 1468 | SIM (bloco 1 anterior) | ✅ Lido
2  | src/services/storageService.ts | Persistência local + sync + cálculos de fiado | 7270 | SIM (funções críticas) | ✅ Lido
3  | src/services/syncService.ts | Sincronização com Supabase (realtime + upsert/delete) | 1306 | PARCIAL | ✅ Lido
4  | src/services/syncQueueService.ts | Fila de sync offline (TableName) | 342 | PARCIAL | ✅ Lido
5  | src/services/comandaService.ts | Comanda/PDV (indireto — usa storageService) | ~500 | NÃO AUDITADO | ⏹ Não auditado nesta sessão
6  | src/components/Finance/FinanceView.tsx | Financeiro (lê credit_payments via getCreditPayments) | 1749 | SIM (referenciado) | ✅ Lido
7  | src/components/Dashboard/DashboardView.tsx | Dashboard (usa getCreditPayments) | ~890 | NÃO AUDITADO (referenciado) | ⏹ Lido parcialmente
8  | src/types/index.ts | Tipos (CreditPayment, Sale, etc.) | 758 | SIM | ✅ Lido
9  | src/lib/supabaseAnon.ts | Supabase anon (citado no doc, não inspecionado) | ~20 | NÃO AUDITADO | ⏹ Não inspecionado
10 | src/lib/supabase.ts | Supabase client (não inspecionado) | ~30 | NÃO AUDITADO | ⏹ Não inspecionado
11 | src/services/syncService.test.ts | Testes de sync (não inspecionado) | ~300 | NÃO AUDITADO | ⏹ Não inspecionado

Observação: nenhum arquivo alterado nesta sessão além dos já confirmados (3 edições + sync `sale_item_payments`). A auditoria NÃO modificou nenhum arquivo de produção.
