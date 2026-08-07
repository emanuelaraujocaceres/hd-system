import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers });
  }

  try {
    const url = new URL(req.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token é obrigatório' }), {
        status: 400,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Buscar mesa pelo token
    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('*')
      .eq('qr_token', token)
      .eq('status', 'active')
      .single();

    if (tableError || !table) {
      return new Response(JSON.stringify({ error: 'Mesa não encontrada' }), {
        status: 404,
        headers: { ...headers, 'Content-Type': 'application/json' },
      });
    }

    // Buscar config do cardápio
    const { data: config } = await supabase
      .from('digital_menu_config')
      .select('*')
      .eq('store_branch_id', table.store_branch_id)
      .single();

    // Buscar produtos visíveis no cardápio
    const { data: products } = await supabase
      .from('products')
      .select('*')
      .eq('store_branch_id', table.store_branch_id)
      .eq('active', true)
      .eq('show_on_cardapio', true);

    return new Response(
      JSON.stringify({
        table: {
          id: table.id,
          name: table.name,
          number: table.number,
          storeBranchId: table.store_branch_id,
          organizationId: table.organization_id,
        },
        config: config || null,
        products: products || [],
      }),
      {
        status: 200,
        headers: { ...headers, 'Content-Type': 'application/json' },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }
});
