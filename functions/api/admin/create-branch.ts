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

    const body = await request.json().catch(() => ({}));
    const { id, name, code, organization_id, cnpj, city, state, address, phone, is_headquarters, active } = body;

    if (!name || !code || !organization_id) {
      return new Response(JSON.stringify({
        success: false,
        message: 'name, code e organization_id são obrigatórios.',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
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
