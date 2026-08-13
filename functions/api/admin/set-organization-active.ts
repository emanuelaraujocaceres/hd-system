// Cloudflare Pages Function — POST /api/admin/set-organization-active
// Liga/desliga o ACESSO ONLINE de uma organização (interruptor de mensalidade).
//
//  - active=true  → a organização volta a sincronizar (Realtime + fila) normalmente
//  - active=false → o app do cliente corta todo o tráfego de nuvem e passa a
//                   operar apenas localmente até ser reativado
//
// A organização padrão do sistema (HD-System) não pode ser desativada.

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
    const { organization_id, active } = body;

    if (!organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'organization_id é obrigatório.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const nextActive = active !== false; // default: ativar

    // Proteção: org padrão do sistema nunca pode ser desativada
    const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000001';
    if (organization_id === DEFAULT_ORG_ID && !nextActive) {
      return new Response(JSON.stringify({
        success: false,
        message: 'A organização padrão do sistema (HD-System) não pode ser desativada.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Valida que a org existe
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id')
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

    // Aplica o interruptor (subscription_expires_at marca o corte para futura
    // automação de cobrança; reativar zera a data)
    const { error: updateErr } = await supabaseAdmin
      .from('organizations')
      .update({
        active: nextActive,
        subscription_expires_at: nextActive ? null : new Date().toISOString(),
      })
      .eq('id', organization_id);

    if (updateErr) {
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao atualizar organização: ${updateErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      active: nextActive,
      message: nextActive
        ? 'Organização reativada — acesso online restaurado. O app do cliente volta a sincronizar automaticamente.'
        : 'Organização desativada — acesso online cortado. O app do cliente continua funcionando localmente; nada foi apagado.',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[set-organization-active] Erro:', e?.message || e);
    return new Response(JSON.stringify({
      success: false,
      message: e?.message || 'Erro interno',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
