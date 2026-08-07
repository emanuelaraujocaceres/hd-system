import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    let token: string | null = null;

    // Accept token from query param (GET) or body (POST)
    if (req.method === 'GET') {
      const url = new URL(req.url);
      token = url.searchParams.get('token');
    } else {
      const body = await req.json().catch(() => ({}));
      token = body.token || null;
    }

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token e obrigatorio' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: table, error: tableError } = await supabase
      .from('tables')
      .select('*')
      .eq('qr_token', token)
      .eq('status', 'active')
      .maybeSingle();

    if (tableError || !table) {
      return new Response(JSON.stringify({ error: 'Mesa nao encontrada' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: config } = await supabase
      .from('digital_menu_config')
      .select('*')
      .eq('store_branch_id', table.store_branch_id)
      .maybeSingle();

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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Erro interno do servidor' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
