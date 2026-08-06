// Cloudflare Pages Function — POST /api/admin/set-user-active
// Ativa/desativa um ADMINISTRADOR ou COLABORADOR (bloqueio remoto de conta).
//
//  - active=true  → a conta volta a funcionar normalmente
//  - active=false → o app do usuário é derrubado (logout forçado em até 30s
//                   pelo health check) e ele não consegue mais logar
//
// Proteções:
//  - Apenas superadmin pode chamar (valida o JWT do chamador no banco)
//  - Não permite desativar a própria conta
//  - Não permite desativar outro superadmin (protege o dono do sistema)

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
    const callerId = authData.user.id;
    const { data: callerProfile } = await supabaseAdmin
      .from('system_users')
      .select('superadmin')
      .eq('id', callerId)
      .maybeSingle();
    if (!callerProfile?.superadmin) {
      return new Response(JSON.stringify({ success: false, message: 'Acesso negado: apenas superadmin.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    // 2) Parâmetros
    const body = await request.json().catch(() => ({}));
    const { user_id, active } = body;

    if (!user_id) {
      return new Response(JSON.stringify({ success: false, message: 'user_id é obrigatório.' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    const nextActive = active !== false; // default: ativar

    // 3) Proteções
    if (user_id === callerId) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Você não pode desativar a sua própria conta.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    const { data: target, error: targetErr } = await supabaseAdmin
      .from('system_users')
      .select('id, superadmin, name, email')
      .eq('id', user_id)
      .maybeSingle();
    if (targetErr) {
      return new Response(JSON.stringify({ success: false, message: `Erro ao consultar usuário: ${targetErr.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!target) {
      return new Response(JSON.stringify({ success: false, message: 'Usuário não encontrado.' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (target.superadmin) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Contas de superadmin não podem ser desativadas.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // 4) Aplica o interruptor
    const { error: updateErr } = await supabaseAdmin
      .from('system_users')
      .update({ active: nextActive })
      .eq('id', user_id);

    if (updateErr) {
      return new Response(JSON.stringify({ success: false, message: `Erro ao atualizar usuário: ${updateErr.message}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      active: nextActive,
      message: nextActive
        ? `Conta de ${target.name} reativada — acesso restaurado.`
        : `Conta de ${target.name} desativada — o aparelho dele será desconectado automaticamente quando ficar online.`,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[set-user-active] Erro:', e?.message || e);
    return new Response(JSON.stringify({ success: false, message: e?.message || 'Erro interno' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
