const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function finalValidation() {
  console.log('=== VALIDAÇÃO FINAL DE ISOLAMENTO ===\n');

  // Organizações e Branches
  const { data: orgs } = await supabase.from('organizations').select('id, name');
  const { data: branches } = await supabase.from('store_branches').select('id, name, organization_id');
  const { data: users } = await supabase.from('profiles').select('email, organization_id, store_branch_id, role');
  const { data: sales } = await supabase.from('sales').select('code, total, status, store_branch_id, organization_id, payment_method');

  console.log('--- ESTRUTURA ---');
  orgs.forEach(o => {
    const orgBranches = branches.filter(b => b.organization_id === o.id);
    console.log(`${o.name} (${o.id})`);
    orgBranches.forEach(b => console.log(`  └─ ${b.name} (${b.id})`));
  });

  console.log('\n--- USERS ---');
  const branchOrgMap = {};
  branches.forEach(b => { branchOrgMap[b.id] = b.organization_id; });
  
  let leaks = 0;
  users.forEach(u => {
    const orgMatch = u.organization_id === branchOrgMap[u.store_branch_id];
    if (!orgMatch && u.store_branch_id) {
      console.log(`  ❌ ${u.email}: org=${u.organization_id} branch=${u.store_branch_id}`);
      leaks++;
    } else {
      console.log(`  ✅ ${u.email} (${u.role})`);
    }
  });

  console.log('\n--- SALES ---');
  sales.forEach(s => {
    const orgMatch = s.organization_id === branchOrgMap[s.store_branch_id];
    if (!orgMatch) {
      console.log(`  ❌ ${s.code}: org=${s.organization_id} branch=${s.store_branch_id}`);
      leaks++;
    } else {
      console.log(`  ✅ ${s.code} R$ ${s.total} (${s.payment_method})`);
    }
  });

  console.log(`\n--- RESULTADO ---`);
  console.log(`Vazamentos encontrados: ${leaks}`);
  console.log(`Status: ${leaks === 0 ? '✅ ISOLAMENTO OK' : '❌ PROBLEMAS DETECTADOS'}`);
  console.log('\n=== FIM ===');
}

finalValidation().catch(console.error);
