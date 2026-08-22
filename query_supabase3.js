import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tixwhmgzibvazkqbqoev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
);

async function runQueries() {
  console.log('=== Query 1 ===');
  // Query system_users with auth.users join - we'll do separate queries
  const { data: users, error: e1 } = await supabase
    .from('system_users')
    .select('id, email, organization_id, store_branch_id');
  
  if (e1) {
    console.log('Error Query 1:', e1);
  } else {
    console.log('System users count:', users ? users.length : 0);
    console.log('First 3 users:', users ? users.slice(0, 3).map(u => ({ id: u.id, email: u.email, org_id: u.organization_id })) : 'none');
  }

  console.log('\n=== Query 2 ===');
  // Query system_users with organization_id
  const { data: users2, error: e2 } = await supabase
    .from('system_users')
    .select('id, email, organization_id');
  
  if (e2) {
    console.log('Error Query 2:', e2);
  } else {
    console.log('System users count:', users2 ? users2.length : 0);
    console.log('First 3 users:', users2 ? users2.slice(0, 3).map(u => ({ id: u.id, email: u.email, org_id: u.organization_id })) : 'none');
  }

  console.log('\n=== Query 3 ===');
  // Count branches per organization
  if (users2 && users2.length > 0) {
    for (const user of users2.slice(0, 5)) {
      const { count, error: ebc } = await supabase
        .from('store_branches')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', user.organization_id);
      
      console.log(`User ${user.email} (org ${user.organization_id}): ${count} branches`);
    }
  }

  console.log('\n=== Query 4 ===');
  // Users with NULL organization_id
  const { data: q4, error: e4 } = await supabase
    .from('system_users')
    .select('id, email, organization_id')
    .is('organization_id', null)
    .order('email');
  
  if (e4) {
    console.log('Error Query 4:', e4);
  } else {
    console.log('Users with NULL organization_id:', q4 ? q4.length : 0);
    console.log('Details:', q4 ? q4.map(u => ({ id: u.id, email: u.email, org_id: u.organization_id })) : 'none');
  }
}

runQueries().catch(console.error);