const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // Verificar colunas de products
  const {data}=await s.from('products').select('*').limit(1);
  console.log('Colunas products:',data&&data[0]?Object.keys(data[0]):'no data');

  // Verificar produtos da filial
  const {data:prods}=await s.from('products').select('id,name,is_active,show_on_cardapio,store_branch_id').eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee').limit(5);
  console.log('\nProdutos da filial e5085eba:');
  prods?.forEach(p=>console.log(`  - ${p.name} | is_active:${p.is_active} | show_on_cardapio:${p.show_on_cardapio}`));
})().catch(x=>console.error(x.message));
