const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function checkCurrentUsers() {
  console.log('=== USERS ATUAIS ===');
  const { data: users } = await supabase
    .from('profiles')
    .select('email, role, organization_id, store_branch_id');
  
  users.forEach(u => {
    console.log(`  ${u.email} | role: ${u.role} | org: ${u.organization_id} | branch: ${u.store_branch_id}`);
  });
}

checkCurrentUsers().catch(console.error);
