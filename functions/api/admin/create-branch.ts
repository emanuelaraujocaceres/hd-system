// Cloudflare Pages Function — POST /api/admin/create-branch
// Cria uma filial no Supabase com service role (ignora RLS do usuário).
// Usado pela tela de Configurações para criar filial de QUALQUER
// organização (inclusive o superadmin com override em outra org) sem
// depender do token do usuário logado.

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
      .select('superadmin, role, organization_id')
      .eq('id', authData.user.id)
      .maybeSingle();
    // Superadmin pode criar filial em qualquer org.
    // Admin só pode criar filial na própria organização.
    const isSuperadmin = callerProfile?.superadmin === true;
    const isAdmin = callerProfile?.role === 'admin';
    if (!isSuperadmin && !isAdmin) {
      return new Response(JSON.stringify({ success: false, message: 'Acesso negado: apenas superadmin ou admin.' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const body = await request.json().catch(() => ({}));
    const { id, name, code, organization_id, cnpj, city, state, address, phone, is_headquarters, active } = body;

    if (!name || !code || !organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'name, code e organization_id são obrigatórios.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Admin só pode criar filial na própria organização
    if (!isSuperadmin && callerProfile?.organization_id !== organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'Acesso negado: admin só pode criar filial na própria organização.',
      }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const branchId = id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id))
      ? id
      : crypto.randomUUID();

    const { error: branchErr } = await supabaseAdmin.from('store_branches').insert({
      id: branchId,
      organization_id,
      name: String(name),
      code: String(code),
      cnpj: cnpj || null,
      city: city || null,
      state: state || null,
      address: address || null,
      phone: phone || null,
      is_headquarters: is_headquarters === true,
      active: active !== false,
    });

    if (branchErr) {
      return new Response(JSON.stringify({
        success: false,
        message: `Erro ao criar filial: ${branchErr.message}`,
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Filial criada com sucesso!',
      branch_id: branchId,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });

  } catch (e: any) {
    console.error('[create-branch] Erro:', e?.message || e);
    return new Response(JSON.stringify({
      success: false,
      message: e?.message || 'Erro interno',
    }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
