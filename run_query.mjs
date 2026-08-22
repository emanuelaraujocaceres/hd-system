const supabaseUrl = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

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

const query = "SELECT su.id, su.email, su.organization_id, su.store_branch_id FROM public.system_users su JOIN auth.users au ON au.email = su.email WHERE su.email = 'funcionaria@gmail.com';";
rpc(query);