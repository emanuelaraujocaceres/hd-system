const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkExecSQL() {
  console.log('=== VERIFICANDO exec_sql ===\n');
  
  const { error } = await supabase.rpc('exec_sql', { sql: 'SELECT 1;' });
  if (error) {
    console.log('❌ exec_sql não disponível:', error.message);
    console.log('\nConclusão: aplicar via Supabase SQL Editor (manual) no navegador');
  } else {
    console.log('✅ exec_sql disponível — pode aplicar via script');
  }
}

checkExecSQL().catch(console.error);
