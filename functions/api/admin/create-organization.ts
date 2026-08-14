// Cloudflare Pages Function — POST /api/admin/create-organization
// Traduzido de server.ts (Express) para o runtime Workers/Pages.
// Cria organização + filial Matriz + auth user + admin em system_users.

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
    const { org_name, admin_name, admin_email } = body;

    if (!org_name || !admin_name || !admin_email) {
      return new Response(JSON.stringify({
        success: false,
        message: 'org_name, admin_name e admin_email são obrigatórios.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Verificar se admin_email já está em system_users
    const { data: existing } = await supabaseAdmin
      .from('system_users')
      .select('id')
      .eq('email', String(admin_email).toLowerCase())
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Este e-mail já está cadastrado no sistema.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Gerar senha temporária
    const tempPassword =
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      Math.random().toString(36).slice(2, 6) +
      Math.random().toString(10).slice(2, 5) +
      '@';

    // 1. Criar no Supabase Auth
    const { data: authUser, error: createAuthErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(admin_email).toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name: admin_name, role: 'admin' },
    });

    if (createAuthErr) {
      const msg = createAuthErr.message || '';
      if (msg.includes('already registered') || msg.includes('already exists')) {
        return new Response(JSON.stringify({
          success: false,
          message: 'Este e-mail já possui uma conta no sistema. Use outro e-mail.',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({
        success: false,
        message: `Erro Auth: ${msg}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const authUserId = authUser.user.id;
    const orgId = crypto.randomUUID();
    const branchId = crypto.randomUUID();

    // 2. Inserir organização
    const { error: orgErr } = await supabaseAdmin
      .from('organizations')
      .insert({ id: orgId, name: org_name });

    if (orgErr) {
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao criar organização: ${orgErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 3. Inserir filial Matriz
    const { error: branchErr } = await supabaseAdmin.from('store_branches').insert({
      id: branchId,
      organization_id: orgId,
      name: `${org_name} - Matriz`,
      code: 'MTZ-01',
      active: true,
      is_headquarters: true,
    });

    if (branchErr) {
      try { await supabaseAdmin.from('organizations').delete().eq('id', orgId); } catch {}
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao criar filial: ${branchErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    // 4. Inserir admin em system_users
    const { error: userErr } = await supabaseAdmin.from('system_users').insert({
      id: authUserId,
      organization_id: orgId,
      name: admin_name,
      email: String(admin_email).toLowerCase(),
      role: 'admin',
      active: true,
      store_branch_id: branchId,
      superadmin: false,
    });

    if (userErr) {
      try { await supabaseAdmin.from('store_branches').delete().eq('id', branchId); } catch {}
      try { await supabaseAdmin.from('organizations').delete().eq('id', orgId); } catch {}
      await supabaseAdmin.auth.admin.deleteUser(authUserId).catch(() => {});
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao salvar admin: ${userErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Organização criada com sucesso!',
      org_id: orgId,
      admin_id: authUserId,
      password: tempPassword,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[create-organization] Erro:', e?.message || e);
    return new Response(JSON.stringify({
      success: false,
      message: e?.message || 'Erro interno',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
