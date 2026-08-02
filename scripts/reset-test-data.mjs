import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '.env.local' });

if (!process.argv.includes('--executar')) {
  console.error('Operação destrutiva bloqueada. Execute com: node scripts/reset-test-data.mjs --executar');
  process.exit(1);
}

const url = process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) throw new Error('VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.');

const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });

async function removerTodos(tabela) {
  const { error } = await supabase.from(tabela).delete().not('id', 'is', null);
  if (error && error.code !== 'PGRST205') throw new Error(`${tabela}: ${error.message}`);
  console.log(`limpo: ${tabela}`);
}

async function inserir(tabela, linhas) {
  const { data, error } = await supabase.from(tabela).insert(linhas).select();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data;
}

const categoriasPorFilial = ['Cervejas', 'Destilados', 'Não alcoólicos'];
const catalogoBase = [
  { nome: 'Lager 350 ml', categoria: 'Cervejas', custo: 3.2, venda: 6.9, estoque: 48 },
  { nome: 'Gin 750 ml', categoria: 'Destilados', custo: 42, venda: 79.9, estoque: 12 },
  { nome: 'Água tônica 269 ml', categoria: 'Não alcoólicos', custo: 2.4, venda: 5.5, estoque: 36 },
];

async function main() {
  const { data: filiais, error } = await supabase
    .from('store_branches')
    .select('id, organization_id, code, name')
    .eq('active', true)
    .order('code');
  if (error) throw new Error(`store_branches: ${error.message}`);
  if (!filiais?.length) throw new Error('Nenhuma filial ativa encontrada; reset cancelado.');

  // A ordem evita violações de FKs e impede que a DLQ reintroduza dados removidos.
  for (const tabela of [
    'sale_items', 'financial_transactions', 'stock_movements', 'cash_sessions', 'sales',
    'movimentacoes_falhas', 'sync_queue', 'stock_change_log', 'ai_insights',
    'products', 'customers', 'suppliers', 'categories',
  ]) await removerTodos(tabela);

  for (const [indice, filial] of filiais.entries()) {
    const sufixo = `${filial.code}-${String(indice + 1).padStart(2, '0')}`;
    const categorias = await inserir('categories', categoriasPorFilial.map((name, categoriaIndice) => ({
      id: crypto.randomUUID(),
      organization_id: filial.organization_id,
      store_branch_id: filial.id,
      name,
      color: ['#2563eb', '#9333ea', '#059669'][categoriaIndice],
      description: `Categoria exclusiva da filial ${filial.code}`,
    })));

    const fornecedor = (await inserir('suppliers', [{
      id: crypto.randomUUID(),
      organization_id: filial.organization_id,
      store_branch_id: filial.id,
      corporate_name: `Fornecedor ${sufixo} Ltda`,
      trade_name: `Distribuidora ${filial.code}`,
      cnpj: `00${String(indice + 1).padStart(12, '0')}`,
      contact_person: `Contato ${filial.code}`,
      email: `fornecedor.${filial.code.toLowerCase()}@teste.local`,
      phone: `1199000${String(indice + 1).padStart(4, '0')}`,
    }]))[0];

    const produtos = await inserir('products', catalogoBase.map((produto, produtoIndice) => ({
      id: crypto.randomUUID(),
      organization_id: filial.organization_id,
      store_branch_id: filial.id,
      supplier_id: fornecedor.id,
      name: `${produto.nome} — ${filial.code}`,
      sku: `${sufixo}-${String(produtoIndice + 1).padStart(3, '0')}`,
      barcode: `789${String(indice + 1).padStart(3, '0')}${String(produtoIndice + 1).padStart(8, '0')}`,
      category: produto.categoria,
      cost_price: produto.custo + indice,
      sale_price: produto.venda + indice,
      stock_quantity: produto.estoque + (indice * 3),
      min_stock_quantity: 5,
      max_stock_quantity: 100,
      unit: 'UN',
      is_active: true,
      show_on_tv: produtoIndice === 0,
    })));

    await inserir('customers', [1, 2].map((clienteIndice) => ({
      id: crypto.randomUUID(),
      organization_id: filial.organization_id,
      store_branch_id: filial.id,
      name: `Cliente ${filial.code} ${clienteIndice}`,
      cpf_cnpj: `${String(indice + 1).padStart(3, '0')}.${String(clienteIndice).padStart(3, '0')}.000-00`,
      email: `cliente.${filial.code.toLowerCase()}.${clienteIndice}@teste.local`,
      phone: `119800${String(indice + 1).padStart(2, '0')}${String(clienteIndice).padStart(3, '0')}`,
      credit_limit: 200 + (indice * 50),
      city: filial.code.startsWith('RJ') ? 'Rio de Janeiro' : 'São Paulo',
      state: filial.code.startsWith('RJ') ? 'RJ' : 'SP',
    })));

    await inserir('stock_movements', produtos.map((produto, produtoIndice) => ({
      id: crypto.randomUUID(),
      organization_id: filial.organization_id,
      store_branch_id: filial.id,
      product_id: produto.id,
      product_name: produto.name,
      type: 'entrada',
      quantity: catalogoBase[produtoIndice].estoque + (indice * 3),
      previous_stock: 0,
      new_stock: catalogoBase[produtoIndice].estoque + (indice * 3),
      reason: `Carga inicial exclusiva da filial ${filial.code}`,
      operator_name: 'Carga de teste',
    })));

    console.log(`semeada: ${filial.code} (${categorias.length} categorias, ${produtos.length} produtos, 2 clientes)`);
  }
}

main().catch((error) => {
  console.error(`RESET FALHOU: ${error.message}`);
  process.exitCode = 1;
});
