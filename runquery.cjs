const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://tixwhmgzibvazkqbqoev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
);

async function run() {
  console.log('=== Query: system_users with auth.users join ===');
  const { data: q1, error: e1 } = await supabase
    .from('system_users')
    .select('id, email, organization_id, store_branch_id')
    .join('auth.users', { on: 'auth.users.email', eq: 'system_users.email' })
    .order('system_users.id');
  
  console.log('Data:', JSON.stringify(q1, null, 2));
  console.log('Error:', e1 ? e1.message : 'none');

  console.log('\n=== Query: system_users with auth users (direct) ===');
  const { data: q2, error: e2 } = await supabase
    .from('system_users')
    .select(`
      id, email, 
      auth.users.id AS auth_user_id, 
      auth.users.email AS auth_email
    `)
    .join('auth.users', { on: 'auth.users.email', eq: 'system_users.email' })
    .order('system_users.id');
  
  console.log('Data:', JSON.stringify(q2, null, 2));
  console.log('Error:', e2 ? e2.message : 'none');
}

run().catch(console.error);