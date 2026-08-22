const supabaseUrl = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const rpc = async (query) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const text = await response.text();
  console.log('Status:', response.status);
  console.log('Body:', text);
};

// Query 1
console.log('=== Query 1 ===');
rpc(`SELECT su.id, su.email, su.organization_id, su.store_branch_id, au.id IS NOT NULL AS has_auth_user FROM public.system_users su JOIN auth.users au ON au.email = su.email ORDER BY su.id;`);

// Query 2
console.log('\n=== Query 2 ===');
rpc(`SELECT su.id, su.email, public.get_user_org_id() AS org_id_from_func, su.organization_id IS NOT NULL AS has_org_id FROM public.system_users su JOIN auth.users au ON au.email = su.email ORDER BY su.id;`);

// Query 3
console.log('\n=== Query 3 ===');
rpc(`SELECT su.id, su.email, (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = su.organization_id) AS qtd_branches FROM public.system_users su JOIN auth.users au ON au.email = su.email ORDER BY su.id;`);

// Query 4
console.log('\n=== Query 4 ===');
rpc(`SELECT id, email, organization_id FROM public.system_users WHERE organization_id IS NULL ORDER BY email;`);