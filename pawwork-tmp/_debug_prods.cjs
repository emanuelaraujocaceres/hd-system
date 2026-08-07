const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const {data}=await s.from('products').select('id,name,sale_price,stock_quantity,is_active,show_on_cardapio,show_on_tv,tv_promo_price,image_url').eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee').eq('is_active',true);
  console.log('Produtos da filial:');
  data?.forEach(p=>console.log(`  - ${p.name} | sale:${p.sale_price} | stock:${p.stock_quantity} | cardapio:${p.show_on_cardapio} | tv:${p.show_on_tv} | promo:${p.tv_promo_price} | img:${p.image_url ? 'OK' : 'NULL'}`));
})().catch(x=>console.error(x.message));
