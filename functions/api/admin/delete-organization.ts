// Cloudflare Pages Function — POST /api/admin/delete-organization
// Exclui uma organização INTEIRA com service role (ignora RLS).
//
// Fluxo:
//  1. Valida confirmação: o front envia o NOME EXATO da org digitado pelo usuário.
//  2. Bloqueia a organização padrão do sistema (HD-System).
//  3. Chama a RPC admin_delete_organization (banco) — deleção em cascata atômica
//     de TODOS os dados da org (filiais, usuários, produtos, vendas, financeiro...).
//  4. Depois de excluir, apaga as contas do Supabase Auth dos usuários da org
//     (best-effort; o Auth não pode ser apagado via SQL/RLS).
//
// ATENÇÃO: operação IRREVERSÍVEL. A confirmação por nome é a proteção final.

export async function onRequestPost(context: any) {
  const { request, env } = context;

  try {
    const supabaseUrl = env.VITE_SUPABASE_URL || 'https://tixwhmgzibvazkqbqoev.supabase.co';
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

    if (!serviceKey) {
      return new Response(JSON.stringify({
        success: false,
        message: 'SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1) Valida o chamador: precisa ser superadmin
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return new Response(JSON.stringify({ success: false, message: 'Não autenticado.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: authData, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !authData?.user) {
      return new Response(JSON.stringify({ success: false, message: 'Sessão inválida ou expirada.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: callerProfile } = await supabaseAdmin
      .from('system_users')
      .select('superadmin')
      .eq('id', authData.user.id)
      .maybeSingle();
    if (!callerProfile?.superadmin) {
      return new Response(JSON.stringify({ success: false, message: 'Acesso negado: apenas superadmin.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json().catch(() => ({}));
    const { organization_id, confirm_name } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'organization_id é obrigatório.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    if (!confirm_name || typeof confirm_name !== 'string') {
      return new Response(JSON.stringify({
        success: false,
        message: 'Confirmação necessária: digite o nome exato da organização.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Proteção: org padrão do sistema não pode ser excluída
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
    if (organization_id === DEFAULT_ORG_ID) {
      return new Response(JSON.stringify({
        success: false,
        message: 'A organização padrão do sistema (HD-System) não pode ser excluída.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Valida que a org existe e o nome digitado confere
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', organization_id)
      .maybeSingle();

    if (orgErr) {
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao consultar organização: ${orgErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!org) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Organização não encontrada.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(confirm_name).trim().toLowerCase() !== String(org.name).trim().toLowerCase()) {
      return new Response(JSON.stringify({
        success: false,
        message: 'O nome digitado não confere com o nome da organização. Nada foi excluído.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Busca os usuários da org ANTES de excluir (para apagar as contas Auth depois)
    const { data: sysUsers } = await supabaseAdmin
      .from('system_users')
      .select('id')
      .eq('organization_id', organization_id);

    // 1. Deleção em cascata no banco (transação única via RPC)
    const { data: rpcResult, error: rpcErr } = await supabaseAdmin.rpc(
      'admin_delete_organization',
      { p_org_id: organization_id }
    );

    if (rpcErr) {
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao excluir organização: ${rpcErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const result = (typeof rpcResult === 'string') ? JSON.parse(rpcResult) : rpcResult;
    if (!result?.success) {
      return new Response(JSON.stringify({
        success: false,
        message: result?.message || 'Falha ao excluir organização.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 2. Apaga as contas do Supabase Auth (best-effort — Auth não é apagável via SQL)
    const authIds = (sysUsers || []).map((u: any) => u.id);
    const authErrors: string[] = [];
    for (const uid of authIds) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(uid);
      if (error) authErrors.push(`${uid}: ${error.message}`);
    }

    return new Response(JSON.stringify({
      success: true,
      message: result.message,
      auth_deleted: authIds.length - authErrors.length,
      auth_total: authIds.length,
      auth_errors: authErrors,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[delete-organization] Erro:', e?.message || e);
    return new Response(JSON.stringify({
      success: false,
      message: e?.message || 'Erro interno',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
