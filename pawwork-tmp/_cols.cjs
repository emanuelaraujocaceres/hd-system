const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // Verificar colunas de products
  const {data}=await s.rpc('exec_sql',{q:"SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name IN ('active','is_active','show_on_cardapio','show_on_tv') ORDER BY column_name"});
  console.log('products cols:',JSON.stringify(data));
})().catch(x=>console.error(x.message));
