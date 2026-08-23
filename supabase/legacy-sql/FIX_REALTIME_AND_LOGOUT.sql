-- ═══════════════════════════════════════════════════════════════════
-- FIX: Cross-device logout + Realtime para product_recipes e delivery_worker_earnings
-- Execute no Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. Adicionar coluna last_logout_at em system_users (para logout cross-device)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='system_users' AND column_name='last_logout_at') THEN
    ALTER TABLE system_users ADD COLUMN last_logout_at TIMESTAMPTZ;
    RAISE NOTICE 'Added last_logout_at to system_users';
  END IF;
END $$;

-- 2. RPC: Marcar logout (chamado pelo dispositivo que faz logout)
CREATE OR REPLACE FUNCTION mark_user_logout()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE system_users SET last_logout_at = NOW() WHERE id = auth.uid();
END;
$$;

-- 3. Garantir que product_recipes e delivery_worker_earnings têm REPLICA IDENTITY FULL
ALTER TABLE product_recipes REPLICA IDENTITY FULL;
ALTER TABLE delivery_worker_earnings REPLICA IDENTITY FULL;

-- 4. Publicar no supabase_realtime (se ainda não estiver)
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE product_recipes;
    RAISE NOTICE 'Added product_recipes to supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'product_recipes already in supabase_realtime';
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_worker_earnings;
    RAISE NOTICE 'Added delivery_worker_earnings to supabase_realtime';
  EXCEPTION WHEN duplicate_object THEN
    RAISE NOTICE 'delivery_worker_earnings already in supabase_realtime';
  END;
END $$;
