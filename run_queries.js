const supabaseUrl = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

const rpc = async (query) => {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/run_sql`, {
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

const queries = [
  "SELECT su.id, su.email, public.get_user_org_id() AS org_id_from_func, su.organization_id IS NOT NULL AS has_org_id FROM public.system_users su JOIN auth.users au ON au.email = su.email ORDER BY su.id;",
  "SELECT su.id, su.email, su.organization_id, (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = su.organization_id) AS qtd_branches FROM public.system_users su JOIN auth.users au ON au.email = su.email ORDER BY su.id;",
  "SELECT o.id, o.name, o.organization_id, (SELECT COUNT(*) FROM public.store_branches sb WHERE sb.organization_id = o.id) AS filiais FROM public.organizations o ORDER BY o.name;",
  "SELECT prosrc FROM pg_proc WHERE proname = 'get_user_org_id';"
];

queries.forEach((q, i) => {
  console.log(`\n=== Query ${i + 1} ===`);
  rpc(q);
});