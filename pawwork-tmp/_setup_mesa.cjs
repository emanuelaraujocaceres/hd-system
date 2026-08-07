const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  console.log('=== LIMPEZAS E NOVA MESA ===\n');

  // 1) Deletar mesas antigas com tokens problemáticos
  const {data:mesas}=await s.from('tables').select('id,name,qr_token').eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee');
  console.log('Mesas para deletar:',mesas?.length);
  for(const m of mesas||[]){
    await s.from('tables').delete().eq('id',m.id);
    console.log(`  ✓ Deletada: ${m.name} (${m.qr_token?.slice(0,20)}...)`);
  }

  // 2) Criar mesa nova com token seguro
  const newToken=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  const {data:created,err}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',
    number:1,
    qr_token:newToken,
    status:'active'
  }).select().single();
  if(err){console.log('Erro:',err.message);return;}

  console.log('\n✓ Mesa criada com sucesso!');
  console.log('  Nome:',created.name);
  console.log('  Token:',created.qr_token);
  console.log('\n📱 URL para testar no celular:');
  console.log(`  https://hd-system.pages.dev/#/mesa/${created.qr_token}`);
})().catch(err=>console.error('ERRO:',err.message));
