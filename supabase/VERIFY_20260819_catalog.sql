-- ═══════════════════════════════════════════════════════════════════
-- VERIFY_20260819_catalog.sql — DIAGNÓSTICO 1: CATÁLOGO COMPLETO
-- Auditoria total do Supabase (2026-08-19)
-- READ-ONLY: só SELECTs. Rode no SQL Editor — cada bloco é uma aba de resultado.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1.1 TIPOS PERSONALIZADOS (enum / composite / domain) ──────────
-- Esperado: nenhum (não há CREATE TYPE nos migrations). Vazio = correto.
SELECT t.typname AS tipo,
       CASE t.typtype WHEN 'e' THEN 'ENUM' WHEN 'c' THEN 'COMPOSITE' WHEN 'd' THEN 'DOMAIN' END AS tipo_especie
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public' AND t.typtype IN ('e', 'c', 'd')
ORDER BY t.typname;

-- ── 1.2 TABELAS + STATUS RLS ───────────────────────────────────────
-- relrowsecurity=true  → RLS habilitado (regra 0 do AGENTS.md: obrigatório)
-- relrowsecurity=false → ⚠️ FALHA (tabela sem RLS)
-- relforcerowsecurity=true → FORCE RLS (afeta também o dono)
SELECT c.relname AS tabela,
       c.relrowsecurity AS rls_habilitado,
       c.relforcerowsecurity AS rls_forcado,
       pg_get_userbyid(c.relowner) AS dono
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- ── 1.3 COLUNAS DE TODAS AS TABELAS (agrupadas) ────────────────────
SELECT table_name AS tabela,
       string_agg(column_name || ':' || data_type, ', ' ORDER BY ordinal_position) AS colunas
FROM information_schema.columns
WHERE table_schema = 'public'
GROUP BY table_name
ORDER BY table_name;

-- ── 1.4 PRIMARY KEYS ───────────────────────────────────────────────
-- Atenção: ai_insights tem PK TEXT (doc diz "UUID em todas" — conferir).
SELECT tc.table_name AS tabela,
       string_agg(kcu.column_name, ', ' ORDER BY kcu.ordinal_position) AS pk
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'
GROUP BY tc.table_name
ORDER BY tc.table_name;

-- ── 1.5 FOREIGN KEYS (todas) ───────────────────────────────────────
SELECT conrelid::regclass::text AS tabela,
       conname AS fk,
       pg_get_constraintdef(oid) AS definicao
FROM pg_constraint
WHERE contype = 'f' AND connamespace = 'public'::regnamespace
ORDER BY 1, 2;

-- ── 1.6 FUNÇÕES (todas, com SECURITY DEFINER e volatilidade) ───────
-- SECURITY DEFINER com filtro por org/branch no corpo = OK.
-- SECURITY DEFINER sem RLS no corpo = risco (funciona como superuser).
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer,
       CASE p.provolatile WHEN 's' THEN 'STABLE' WHEN 'i' THEN 'IMMUTABLE' ELSE 'VOLATILE' END AS volatilidade,
       p.proacl::text AS permissao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.prokind = 'f'
ORDER BY p.proname;

-- ── 1.7 TRIGGERS (não internos) ────────────────────────────────────
SELECT tg.tgrelid::regclass::text AS tabela,
       tg.tgname AS trigger,
       p.proname AS funcao,
       CASE WHEN tg.tgtype & 1 = 1 THEN 'FOR EACH ROW' ELSE 'FOR EACH STATEMENT' END AS nivel,
       CASE WHEN tg.tgtype & 2 = 2 THEN 'BEFORE ' ELSE 'AFTER ' END ||
       CASE WHEN tg.tgtype & 4 = 4 THEN 'INSERT ' ELSE '' END ||
       CASE WHEN tg.tgtype & 8 = 8 THEN 'UPDATE ' ELSE '' END ||
       CASE WHEN tg.tgtype & 16 = 16 THEN 'DELETE' ELSE '' END AS quando
FROM pg_trigger tg
JOIN pg_proc p ON p.oid = tg.tgfoid
JOIN pg_class c ON c.oid = tg.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE NOT tg.tgisinternal AND n.nspname = 'public'
ORDER BY 1, 2;

-- ── 1.8 VIEWS (com definição) ──────────────────────────────────────
-- vw_report_sale_items deve ter security_invoker = true
SELECT c.relname AS view,
       pg_get_viewdef(c.oid) AS definicao
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'v'
ORDER BY c.relname;