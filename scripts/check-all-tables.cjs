const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2EviIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkPolicies() {
  console.log('=== POLITICS DETALHADAS ===\n');

  // Usar fetch direto pro endpoint /rest/v1/rpc/ para tentar executar SQL
  // Primeiro verificar RPCs existentes
  const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
    headers: {
      'apikey': SUPABASE_SERVICE_ROLE_KEY,
      'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const spec = await res.json();
  
  // Listar paths que são RPCs
  const rpcPaths = Object.keys(spec.paths || {}).filter(p => {
    const clean = p.replace(/\/rest\/v1\//, '');
    return clean.startsWith('rpc/') && !clean.includes('{');
  });
  console.log('RPCs disponíveis:');
  rpcPaths.forEach(p => console.log(`  ${p.replace('/rest/v1/', '')}`));

  // Tentar buscar uma query específica - pg_policies isn't a table, won't work
  // Mas tabelas reais: vamos listar via openapi spec
  console.log('\n--- Tabelas via OpenAPI ---');
  const tablePaths = Object.keys(spec.paths || {}).filter(p => {
    const clean = p.replace(/\/rest\/v1\//, '');
    return !clean.startsWith('rpc/') && !clean.includes('{') && clean.length > 0;
  });
  tablePaths.forEach(p => console.log(`  ${p.replace('/rest/v1/', '')}`));

  console.log('\n=== FIM ===');
}

checkPolicies().catch(console.error);
