const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function listRPCs() {
  console.log('=== RPCs DISPONÍVEIS ===\n');
  
  // Listar todas as functions (RPCs)
  const { data: funcs, error } = await supabase.rpc('pg_proc_functions');
  if (error) {
    console.log('Tentando via information_schema...');
  } else if (funcs) {
    funcs.forEach(f => console.log(`  ${f.proname}`));
  }
  
  // Tentar listar via pg_proc
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/pg_proc`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({})
  });
  
  console.log('\n=== Listando functions via pg_get_functiondef ===');
  // Não tem como listar functions facilmente via REST
  
  // Tentar supabase functions list
  console.log('\nProcurando functions úteis...');
  
  // Verificar se existe exec_sql
  const { error: execErr } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });
  if (execErr) {
    console.log('❌ exec_sql não disponível:', execErr.message);
  } else {
    console.log('✅ exec_sql disponível');
  }
  
  // Verificar SQL Editor - tem API REST pro SQL?
  // Supabase real-time não tem SQL REST API
  
  console.log('\n=== Conclusão ===');
  console.log('Para aplicar SQL DDL (ALTER TABLE, CREATE POLICY), o método mais confiável é:');
  console.log('1. Supabase CLI: npx supabase db push');
  console.log('2. Supabase SQL Editor (manual)');
  console.log('3. Criar uma RPC helper no banco que aceita SQL');
}

listRPCs().catch(console.error);
