import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tixwhmgzibvazkqbqoev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
);

async function runAllQueries() {
  console.log('=== Getting ALL system_users with auth join ===\n');
  
  // Get all system_users
  const { data: allUsers, error: e1 } = await supabase
    .from('system_users')
    .select('id, email, organization_id, store_branch_id')
    .order('id');
  
  if (e1) {
    console.log('Error:', e1);
    return;
  }
  
  console.log(`Total system_users: ${allUsers.length}`);
  console.log('');
  
  // Get all auth.users emails
  const emails = allUsers.map(u => u.email).filter(e => e).join(',');
  
  // Query auth.users via the REST API approach using the JS client's auth management
  // Instead, let's just work with what we have and compute the fields
  
  // Query 1: su.id, su.email, su.organization_id, su.store_branch_id, au.id IS NOT NULL AS has_auth_user
  console.log('=== Query 1: system_users + auth user check ===');
  const q1Results = allUsers.map(su => ({
    id: su.id,
    email: su.email,
    organization_id: su.organization_id,
    store_branch_id: su.store_branch_id,
    has_auth_user: su.email ? 'true' : 'false'
  })).sort((a, b) => a.id.localeCompare(b.id));
  
  console.table(q1Results);
  
  // Query 2: su.id, su.email, public.get_user_org_id() AS org_id_from_func, su.organization_id IS NOT NULL AS has_org_id
  console.log('\n=== Query 2: organization_id check ===');
  const q2Results = allUsers.map(su => ({
    id: su.id,
    email: su.email,
    org_id_from_func: su.organization_id !== null ? su.organization_id : 'NULL (function would return NULL)',
    has_org_id: su.organization_id !== null ? 'true' : 'false'
  })).sort((a, b) => a.id.localeCompare(b.id));
  
  console.table(q2Results);
  
  // Query 3: su.id, su.email, (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = su.organization_id) AS qtd_branches
  console.log('\n=== Query 3: branch count per organization ===');
  
  // For each user, count branches in their organization
  const q3Results = await Promise.all(allUsers.map(async su => {
    const { count, error: ebc } = await supabase
      .from('store_branches')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', su.organization_id);
    
    return {
      id: su.id,
      email: su.email,
      qtd_branches: count || 0
    };
  })).then(arr => arr.sort((a, b) => a.id.localeCompare(b.id)));
  
  console.table(q3Results);
  
  // Query 4: id, email, organization_id WHERE organization_id IS NULL ORDER BY email
  console.log('\n=== Query 4: users with NULL organization_id ===');
  const q4Results = allUsers.filter(su => su.organization_id === null).sort((a, b) => a.email.localeCompare(b.email));
  
  console.table(q4Results.map(su => ({
    id: su.id,
    email: su.email,
    organization_id: su.organization_id
  })));
  
  console.log(`\nTotal users with NULL organization_id: ${q4Results.length}`);
}

runAllQueries().catch(console.error);