const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://tixwhmgzibvazkqbqoev.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDg5NzI0MywiZXhwIjoyMTAwNDczMjQzfQ.j6FXodPl_xduyq_w_laaZEPE456hj_UxMcEqLevt2N0';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function validateBranchIsolation() {
  console.log('=== ISOLAMENTO ENTRE FILIAIS ===\n');

  const { data: branches } = await supabase.from('store_branches').select('id, name, organization_id');
  const { data: orgs } = await supabase.from('organizations').select('id, name');

  // 1. Products por filial
  console.log('--- PRODUCTS POR FILIAL ---');
  const { data: products } = await supabase.from('products').select('id, name, store_branch_id');
  const prodByBranch = {};
  products.forEach(p => {
    prodByBranch[p.store_branch_id] = (prodByBranch[p.store_branch_id] || 0) + 1;
  });
  branches.forEach(b => {
    console.log(`  ${b.name}: ${prodByBranch[b.id] || 0} products`);
  });

  // 2. Sales por filial (verificar se cada sale tem store_branch_id correto)
  console.log('\n--- SALES POR FILIAL ---');
  const { data: sales } = await supabase.from('sales').select('code, total, store_branch_id, organization_id, order_source');
  const salesByBranch = {};
  sales.forEach(s => {
    salesByBranch[s.store_branch_id] = (salesByBranch[s.store_branch_id] || 0) + 1;
  });
  branches.forEach(b => {
    console.log(`  ${b.name}: ${salesByBranch[b.id] || 0} sales`);
  });

  // 3. Sale_items por filial
  console.log('\n--- SALE_ITEMS POR FILIAL ---');
  const { data: items } = await supabase.from('sale_items').select('id, sale_id, store_branch_id, product_name');
  const itemsByBranch = {};
  items.forEach(i => {
    itemsByBranch[i.store_branch_id] = (itemsByBranch[i.store_branch_id] || 0) + 1;
  });
  branches.forEach(b => {
    console.log(`  ${b.name}: ${itemsByBranch[b.id] || 0} items`);
  });

  // 4. Users: cada user está em UMA filial específica?
  console.log('\n--- USERS POR FILIAL ---');
  const { data: users } = await supabase.from('profiles').select('email, store_branch_id, role, organization_id');
  const usersByBranch = {};
  users.forEach(u => {
    const key = u.store_branch_id || 'null';
    usersByBranch[key] = usersByBranch[key] || [];
    usersByBranch[key].push(u.email);
  });
  Object.entries(usersByBranch).forEach(([br, emails]) => {
    const b = branches.find(x => x.id === br);
    console.log(`  ${b?.name || br}: ${emails.join(', ')}`);
  });

  // 5. Verificar se há users multi-filial (access a múltiplas filiais)
  console.log('\n--- USERS MULTI-FILIAL ---');
  // Na implementação atual, user tem store_branch_id único — isso bloqueia acesso a outras filiais
  users.forEach(u => {
    console.log(`  ${u.email} → ${u.store_branch_id} (${u.role})`);
  });

  // 6. Buscar tabelas que NÃO têm store_branch_id (possível ponto de vazamento)
  console.log('\n--- TABELAS SEM store_branch_id ---');
  // user_permissions
  const { data: perms } = await supabase.from('user_permissions').select('*').limit(5);
  if (perms && perms.length > 0) {
    console.log(`  user_permissions: ${perms[0].store_branch_id ? 'TEM' : 'NÃO TEM'} store_branch_id`);
  } else {
    console.log('  user_permissions: sem dados ou sem coluna');
  }

  console.log('\n=== FIM ===');
}

validateBranchIsolation().catch(console.error);
