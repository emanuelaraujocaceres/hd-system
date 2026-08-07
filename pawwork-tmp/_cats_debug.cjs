const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // 1) Categorias no banco
  const {data:dbCats}=await s.from('categories').select('*').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31');
  console.log('Categorias no banco:',dbCats?.length||0);
  dbCats?.forEach(c=>console.log(`  - ${c.name} | branch:${c.store_branch_id?.slice(0,8)} | org:${c.organization_id?.slice(0,8)}`));

  // 2) Products no banco (verificar se a categoria está sendo salva)
  const {data:dbProds}=await s.from('products').select('id,name,category').eq('organization_id','361fb95a-3e9f-43be-a43c-0dc91f851f31').limit(3);
  console.log('\nProducts sample:',JSON.stringify(dbProds,null,2));
})().catch(x=>console.error(x.message));
