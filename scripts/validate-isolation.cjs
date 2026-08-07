const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function validateIsolation() {
  console.log('=== VALIDAÇÃO DE ISOLAMENTO MULTI-FILIAL ===\n');

  // 1. Organizations e Branches
  console.log('--- ORGANIZATIONS & BRANCHES ---');
  const { data: orgs } = await supabase
    .from('organizations')
    .select('id, name')
    .order('created_at');
  console.log(`Total organizations: ${orgs.length}`);
  orgs.forEach(o => console.log(`  ${o.id} | ${o.name}`));

  const { data: branches } = await supabase
    .from('store_branches')
    .select('id, name, organization_id')
    .order('created_at');
  console.log(`\nTotal branches: ${branches.length}`);
  branches.forEach(b => console.log(`  ${b.id} | ${b.name} | org: ${b.organization_id}`));

  // 2. Users (profiles) e roles
  console.log('\n--- USERS (profiles) & ROLES ---');
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, role, organization_id, store_branch_id')
    .order('created_at');
  console.log(`Total users: ${users.length}`);
  users.forEach(u => console.log(`  ${u.email} | role: ${u.role} | org: ${u.organization_id} | branch: ${u.store_branch_id}`));

  // 3. Sales por filial
  console.log('\n--- SALES DISTRIBUTION ---');
  const { data: sales } = await supabase
    .from('sales')
    .select('id, store_branch_id, organization_id, total, status, created_at')
    .order('created_at', { ascending: false })
    .limit(50);
  
  const byBranch = {};
  const byOrg = {};
  sales.forEach(s => {
    byBranch[s.store_branch_id] = (byBranch[s.store_branch_id] || 0) + 1;
    byOrg[s.organization_id] = (byOrg[s.organization_id] || 0) + 1;
  });
  console.log(`Total sales returned: ${sales.length}`);
  console.log('Por filial:');
  Object.entries(byBranch).forEach(([br, count]) => {
    const b = branches.find(x => x.id === br);
    console.log(`  ${br} (${b?.name || 'unknown'}): ${count}`);
  });
  console.log('Por organização:');
  Object.entries(byOrg).forEach(([org, count]) => {
    const o = orgs.find(x => x.id === org);
    console.log(`  ${org} (${o?.name || 'unknown'}): ${count}`);
  });

  // 4. Verificar vazamento cross-branch
  console.log('\n--- CROSS-BRANCH LEAKAGE CHECK ---');
  const branchOrgMap = {};
  branches.forEach(b => { branchOrgMap[b.id] = b.organization_id; });
  
  let leakage = 0;
  users.forEach(u => {
    if (u.store_branch_id && branchOrgMap[u.store_branch_id] !== u.organization_id) {
      console.log(`  LEAK: user ${u.email} org=${u.organization_id} branch=${u.store_branch_id} (org do branch: ${branchOrgMap[u.store_branch_id]})`);
      leakage++;
    }
  });
  if (leakage === 0) console.log('  OK: nenhum usuário com filial de outra organização');

  // 5. Verificar sales com organization_id inconsistente
  console.log('\n--- SALES ORG CONSISTENCY ---');
  let salesLeak = 0;
  sales.forEach(s => {
    if (s.organization_id !== branchOrgMap[s.store_branch_id]) {
      console.log(`  LEAK: sale ${s.id} org=${s.organization_id} branch=${s.store_branch_id}`);
      salesLeak++;
    }
  });
  if (salesLeak === 0) console.log('  OK: todas sales com organization_id consistente ao branch');

  // 6. Movimentos residuais de teste
  console.log('\n--- RESIDUAL TEST DATA ---');
  const { data: testSales } = await supabase
    .from('sales')
    .select('id, store_branch_id, organization_id, total, status, created_at')
    .or('notes.ilike.%teste%,notes.ilike.%test%,order_source.ilike.%pdv%')
    .order('created_at', { ascending: false });
  console.log(`Sales com possíveis dados de teste: ${testSales.length}`);
  testSales.forEach(s => console.log(`  ${s.id} | branch: ${s.store_branch_id} | R$ ${s.total} | status: ${s.status} | ${s.created_at}`));

  // 7. Contagem total de sales
  console.log('\n--- TOTAL COUNTS ---');
  const { count: totalSales } = await supabase
    .from('sales')
    .select('*', { count: 'exact', head: true });
  console.log(`Total sales: ${totalSales}`);

  const { count: totalItems } = await supabase
    .from('sale_items')
    .select('*', { count: 'exact', head: true });
  console.log(`Total sale_items: ${totalItems}`);

  const { count: totalProducts } = await supabase
    .from('products')
    .select('*', { count: 'exact', head: true });
  console.log(`Total products: ${totalProducts}`);

  console.log('\n=== FIM ===');
}

validateIsolation().catch(console.error);
