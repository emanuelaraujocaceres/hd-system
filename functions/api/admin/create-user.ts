// Cloudflare Pages Function — POST /api/admin/create-user
// Traduzido de server.ts (Express) para o runtime Workers/Pages.
// Cria usuário no Supabase Auth + system_users com o mesmo UUID.

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

    const body = await request.json().catch(() => ({}));
    const { name, email, role, organization_id, store_branch_id } = body;

    if (!name || !email || !organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'name, email e organization_id são obrigatórios.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Verificar se já existe em system_users
    const { data: existing } = await supabaseAdmin
      .from('system_users')
      .select('id')
      .eq('email', String(email).toLowerCase())
      .eq('organization_id', organization_id)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Já existe um usuário com este e-mail nesta organização.',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // Gerar senha temporária segura
    const tempPassword =
      Math.random().toString(36).slice(2, 6).toUpperCase() +
      Math.random().toString(36).slice(2, 6) +
      Math.random().toString(10).slice(2, 5) +
      '@';

    // 1. Criar no Supabase Auth
    const { data: authUser, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email: String(email).toLowerCase(),
      password: tempPassword,
      email_confirm: true,
      user_metadata: { name, role: role || 'admin' },
    });

    if (authErr) {
      const msg = authErr.message || '';
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

    // 2. Inserir em system_users com o mesmo UUID do Auth
    const { error: dbErr } = await supabaseAdmin.from('system_users').insert({
      id: authUser.user.id,
      organization_id,
      name,
      email: String(email).toLowerCase(),
      role: role || 'admin',
      active: true,
      store_branch_id: store_branch_id || null,
      superadmin: false,
    });

    if (dbErr) {
      // Se falhou o insert, tenta deletar o auth user pra não ficar órfão
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id).catch(() => {});
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao salvar: ${dbErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Usuário criado com sucesso!',
      user_id: authUser.user.id,
      password: tempPassword,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[create-user] Erro:', e?.message || e);
    return new Response(JSON.stringify({
      success: false,
      message: e?.message || 'Erro interno',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
