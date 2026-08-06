-- ==============================================================================
-- 20260813_admin_delete_organization.sql
-- Deleção segura (em cascata) de uma organização inteira.
--
-- Usada pela Pages Function /api/admin/delete-organization: a função roda com
-- SECURITY DEFINER (dono = postgres) para ignorar RLS, tudo dentro de uma única
-- transação — ou apaga TUDO da org, ou nada.
--
-- ATENÇÃO: apagar uma organização remove permanentemente filiais, usuários,
-- produtos, vendas, financeiro, caixa, etc. daquela empresa.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_delete_organization(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name TEXT;
BEGIN
  SELECT name INTO v_name FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Organização não encontrada.');
  END IF;

  -- A organização padrão do sistema (HD-System / Adega) é protegida
  IF p_org_id = '00000000-0000-0000-0000-000000000001' THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'A organização padrão do sistema (HD-System) não pode ser excluída.'
    );
  END IF;

  -- Deleção em cascata — filhos antes dos pais (respeita FKs)
  DELETE FROM sale_items
    WHERE sale_id IN (SELECT id FROM sales WHERE organization_id = p_org_id);
  DELETE FROM credit_payments WHERE organization_id = p_org_id;
  DELETE FROM nf_records WHERE organization_id = p_org_id;
  DELETE FROM scanned_boletos WHERE organization_id = p_org_id;
  DELETE FROM stock_movements WHERE organization_id = p_org_id;
  DELETE FROM cash_sessions WHERE organization_id = p_org_id;
  DELETE FROM financial_transactions WHERE organization_id = p_org_id;
  DELETE FROM sales WHERE organization_id = p_org_id;
  DELETE FROM products WHERE organization_id = p_org_id;
  DELETE FROM categories WHERE organization_id = p_org_id;
  DELETE FROM customers WHERE organization_id = p_org_id;
  DELETE FROM suppliers WHERE organization_id = p_org_id;
  DELETE FROM system_settings WHERE organization_id = p_org_id;
  DELETE FROM sync_queue WHERE organization_id = p_org_id;
  DELETE FROM movimentacoes_falhas WHERE organization_id = p_org_id;
  DELETE FROM store_branches WHERE organization_id = p_org_id;
  DELETE FROM system_users WHERE organization_id = p_org_id;
  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Organização "%s" excluída com sucesso.', v_name)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_delete_organization TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_organization TO service_role;

-- Verificação: a função deve aparecer na listagem
SELECT routine_name
FROM information_schema.routines
WHERE routine_name = 'admin_delete_organization';
