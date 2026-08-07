const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // Deletar TODAS as mesas uma a uma para garantir
  const {data:mesas}=await s.from('tables').select('id,qr_token');
  console.log('Deletando',mesas?.length,'mesas...');
  let ok=0,err=0;
  for(const m of mesas||[]){
    const {error}=await s.from('tables').delete().eq('id',m.id);
    if(err)err++;else ok++;
  }
  console.log('✓ Deletadas:',ok,'| Falhas:',err);

  // Criar s� 1 mesa nova
  const token=`mesa01-${Date.now().toString(36)}`;
  const {data:created,error:cerr}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa 01',number:1,qr_token:token,status:'active'
  }).select().single();
  if(cerr){console.log('Erro ao criar:',cerr.message);return;}

  // Confirmar quantas mesas existem agora
  const {count}=await s.from('tables').select('*',{count:'exact'});
  console.log('\n✓ Mesa criada. Total no banco:',count);
  console.log('  Token:',created.qr_token);
  console.log('  URL: https://hd-system.pages.dev/#/mesa/'+created.qr_token);
})().catch(x=>console.error('ERRO:',x.message));
