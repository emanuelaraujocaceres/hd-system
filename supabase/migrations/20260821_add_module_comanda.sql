-- Corrige módulo Comandas: a coluna module_comanda NÃO existia em module_visibility,
-- então o frontend dropava module_comanda do upsert e do mapeamento remoto.
-- Consequência: Comandas nunca era persistida na nuvem nem sincronizada por
-- realtime, divergindo de todos os outros módulos (que têm suas colunas).
-- Adiciona a coluna (idempotente) com default false, igual às demais.
ALTER TABLE public.module_visibility
  ADD COLUMN IF NOT EXISTS module_comanda BOOLEAN NOT NULL DEFAULT false;
