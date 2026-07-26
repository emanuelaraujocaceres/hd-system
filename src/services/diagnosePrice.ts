/**
 * Diagnóstico rápido: verificar preço dos produtos e vendas
 * 
 * Cole no console do navegador (F12):
 *   (await import('./services/diagnosePrice')).diagnosePrice()
 */

import { storageService } from './storageService';
import { supabase } from '../lib/supabase';

export async function diagnosePrice() {
  console.log('='.repeat(60));
  console.log('🔍 DIAGNÓSTICO DE PREÇOS');
  console.log('='.repeat(60));

  // 1. Produtos no localStorage
  const products = storageService.getProducts();
  console.log(`\n📦 PRODUTOS NO LOCALSTORAGE (${products.length}):`);
  products.forEach(p => {
    console.log(`   ${p.id.slice(0,20).padEnd(22)} "${p.name.slice(0,30).padEnd(32)}" R$ ${p.salePrice.toFixed(2)} (estoque: ${p.currentStock})`);
  });

  const zeroPriceProducts = products.filter(p => p.salePrice <= 0);
  if (zeroPriceProducts.length > 0) {
    console.log(`\n⚠️  ${zeroPriceProducts.length} produto(s) com salePrice = 0 no localStorage!`);
  }

  // 2. Produtos no Supabase
  console.log(`\n☁️  PRODUTOS NO SUPABASE:`);
  const { data: cloudProducts, error } = await supabase.from('products').select('id, name, sale_price').limit(20);
  if (error) {
    console.log(`   ❌ Erro ao consultar Supabase: ${error.message}`);
  } else if (cloudProducts) {
    cloudProducts.forEach(p => {
      console.log(`   ${p.id.slice(0,20).padEnd(22)} "${(p.name || '').slice(0,30).padEnd(32)}" R$ ${(p.sale_price || 0).toFixed(2)}`);
    });
    const cloudZero = cloudProducts.filter(p => !p.sale_price || p.sale_price <= 0);
    if (cloudZero.length > 0) {
      console.log(`\n⚠️  ${cloudZero.length} produto(s) com sale_price = 0 no SUPABASE!`);
    }
  }

  // 3. Vendas recentes (últimas 5)
  const sales = storageService.getSales().slice(0, 5);
  console.log(`\n🧾 ÚLTIMAS VENDAS (localStorage):`);
  sales.forEach(s => {
    console.log(`   ${s.id.slice(0,25).padEnd(27)} #${s.code.padEnd(10)} R$ ${s.total.toFixed(2)} (${s.items.length} itens)`);
    s.items.forEach(item => {
      console.log(`     → ${item.productName.slice(0,30).padEnd(32)} ${item.quantity}x R$ ${item.unitPrice.toFixed(2)} = R$ ${item.total.toFixed(2)}`);
    });
  });

  // 4. Conclusão
  console.log('\n' + '='.repeat(60));
  if (zeroPriceProducts.length > 0) {
    console.log('❌ PROBLEMA: Produtos com salePrice = 0 encontrados.');
    console.log('   Isso explica vendas com valor 0.');
    console.log('   Solução: Edite o produto no sistema e corrija o preço,');
    console.log('   ou exclua os produtos com problema e recadastre.');
  } else if (sales.some(s => s.total <= 0)) {
    console.log('❌ PROBLEMA: Vendas com total = 0 encontradas no localStorage.');
    console.log('   As vendas foram salvas com valor 0 ao finalizar.');
    console.log('   Pode ser um bug no cálculo na tela de pagamento.');
  } else {
    console.log('✅ Tudo OK! Preços e vendas com valores corretos.');
    console.log('   Se ainda vir 0, pode ser cache do navegador - tente Ctrl+F5.');
  }
  console.log('='.repeat(60));
}
