import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tixwhmgzibvazkqbqoev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
);

async function runQueries() {
  console.log('=== Query 1 ===');
  const { data: q1, error: e1 } = await supabase
    .from('system_users')
    .select('id, email, organization_id, store_branch_id')
    .join('auth.users', { on: 'auth.users.email', eq: 'system_users.email' })
    .order('system_users.id');
  console.log('Data:', JSON.stringify(q1));
  console.log('Error:', e1);

  console.log('\n=== Query 2 ===');
  const { data: q2, error: e2 } = await supabase
    .from('system_users')
    .select('id, email, organization_id')
    .join('auth.users', { on: 'auth.users.email', eq: 'system_users.email' })
    .order('system_users.id');
  console.log('Data:', JSON.stringify(q2));
  console.log('Error:', e2);

  console.log('\n=== Query 3 ===');
  const { data: q3, error: e3 } = await supabase
    .from('system_users')
    .select(`id, email, (
      SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = system_users.organization_id
    ) AS qtd_branches`)
    .join('auth.users', { on: 'auth.users.email', eq: 'system_users.email' })
    .order('system_users.id');
  console.log('Data:', JSON.stringify(q3));
  console.log('Error:', e3);

  console.log('\n=== Query 4 ===');
  const { data: q4, error: e4 } = await supabase
    .from('system_users')
    .select('id, email, organization_id')
    .is('organization_id', null)
    .order('email');
  console.log('Data:', JSON.stringify(q4));
  console.log('Error:', e4);
}

runQueries().catch(console.error);