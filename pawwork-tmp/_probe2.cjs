const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const r=await s.from('products').select('id,name,stock_quantity').eq('id','0ff082a4-ea1f-4b2e-b9dc-f0c2a22edc25');
  console.log('Produto Gin:',JSON.stringify(r.data));
  const m=await s.from('stock_movements').select('id,type,quantity,reason,created_at').ilike('reason','%TESTE-OFFLINE%');
  console.log('Residuos movements:',m.data?.length ?? 0, JSON.stringify(m.data));
  // ve se tem trigger em stock_movements que atualiza products
  const t=await s.rpc('exec_sql',{q:"SELECT routine_name FROM information_schema.routines WHERE routine_definition ILIKE '%stock_movements%' AND routine_type='TRIGGER'"}).select();
  console.log('Triggers stock_movements:',JSON.stringify(t.data));
})().catch(x=>console.error('ERR',x.message));
