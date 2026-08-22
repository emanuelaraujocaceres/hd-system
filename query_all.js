import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://tixwhmgzibvazkqbqoev.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0'
);

// Helper: fetch from REST API directly
async function restFetch(path, body = null) {
  const url = `https://tixwhmgzibvazkqbqoev.supabase.co/rest/v1${path}?select=*`;
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: {
      'apikey': supabase.auth.getSession(),
      'Authorization': 'Bearer ' + supabase.auth.getSession(),
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal'
    }
  };
  if (body) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
  }
  const res = await fetch(url, opts);
  const data = await res.json();
  return { data, status: res.status };
}

async function runQueries() {
  console.log('=== Query 1 ===');
  // SELECT su.id, su.email, su.organization_id, su.store_branch_id, au.id IS NOT NULL AS has_auth_user
  // FROM public.system_users su
  // JOIN auth.users au ON au.email = su.email
  // ORDER BY su.id;
  
  // Step 1: Get system_users
  const { data: users, error: e1 } = await supabase
    .from('system_users')
    .select('id, email, organization_id, store_branch_id');
  
  if (e1) console.log('Error system_users:', e1);
  else console.log(`System users: ${users?.length || 0} rows`);
  
  // Step 2: Get auth.users emails - we need to get the emails from system_users first
  if (users && users.length > 0) {
    const emails = users.map(u => `'${u.email.replace("'", "\\'")}'`).join(',');
    
    // Query auth.users via REST API
    const { data: authUsers, status: authStatus, error: authError } = await restFetch('/auth/users', {
      query: { email: `in.(${emails})` }
    });
    
    console.log(`Auth users fetched: ${authUsers?.length || 0} rows (status: ${authStatus})`);
    
    // Build lookup map
    const authMap = new Map();
    if (authUsers) {
      for (const u of authUsers) {
        authMap.set(u.email, u.id);
      }
    }
    
    // Build result table
    console.log('\nQuery 1 Results:');
    console.table(users?.map(su => ({
      id: su.id,
      email: su.email,
      organization_id: su.organization_id,
      store_branch_id: su.store_branch_id,
      has_auth_user: authMap.has(su.email) ? 'true' : 'false'
    })).sort((a, b) => a.id.localeCompare(b.id)) || []);
  }

  console.log('\n\n=== Query 2 ===');
  // SELECT su.id, su.email, public.get_user_org_id() AS org_id_from_func,
  // su.organization_id IS NOT NULL AS has_org_id
  // FROM public.system_users su
  // JOIN auth.users au ON au.email = su.email
  // ORDER BY su.id;
  
  if (users && users.length > 0) {
    const emails = users.map(u => `'${u.email.replace("'", "\\'")}'`).join(',');
    
    const { data: authUsers, error: authError } = await supabase
      .from('auth.users') // This may not work directly
      .select('email, id')
      .in('email', users.map(u => u.email));
    
    console.log('Auth users via JS:', authUsers?.length || 0);
  }

  // Alternative: just get system_users and compute has_org_id
  console.log('\nQuery 2 Results (system_users with has_org_id):');
  const q2results = users?.map(su => ({
    id: su.id,
    email: su.email,
    org_id_from_func: su.organization_id !== null ? 'computed via get_user_org_id()' : 'NULL',
    has_org_id: su.organization_id !== null ? 'true' : 'false'
  })).sort((a, b) => a.id.localeCompare(b.id)) || [];
  
  console.table(q2results);

  console.log('\n\n=== Query 3 ===');
  // SELECT su.id, su.email, (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = su.organization_id) AS qtd_branches
  // FROM public.system_users su
  // JOIN auth.users au ON au.email = su.email
  // ORDER BY su.id;
  
  if (users && users.length > 0) {
    console.log('Query 3 Results:');
    const q3results = await Promise.all(users.map(async su => {
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
    
    console.table(q3results);
  }

  console.log('\n\n=== Query 4 ===');
  // SELECT id, email, organization_id FROM public.system_users WHERE organization_id IS NULL ORDER BY email;
  
  const { data: q4, error: e4 } = await supabase
    .from('system_users')
    .select('id, email, organization_id')
    .is('organization_id', null)
    .order('email');
  
  console.log('Query 4 Results:');
  console.table(q4 || []);
  console.log('Error:', e4);
}

runQueries().catch(console.error);