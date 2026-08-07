const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  console.log('=== DEBUG QR CODE ===\n');

  // 1) Listar todas as mesas
  const {data:mesas,err:em}=await s.from('tables').select('*').eq('store_branch_id','e5085eba-4398-4c31-ae13-8082b46561ee');
  if(em){console.log('Erro mesas:',em.message);return;}
  console.log('Mesas encontradas:',mesas.length);
  mesas.forEach(m=>{
    console.log(`  - ${m.id.slice(0,8)} | ${m.name} | qr_token: "${m.qr_token}" | len=${m.qr_token?.length}`);
  });

  // 2) Testar busca por token
  if(mesas.length>0){
    const token=mesas[0].qr_token;
    console.log('\nTestando busca por token:',token);
    const {data:found,err:ef}=await s.from('tables').select('*').eq('qr_token',token);
    console.log('Encontrados:',found?.length,'| Erro:',ef?.message);
  }

  // 3) Criar nova mesa com token seguro
  console.log('\nCriando mesa teste...');
  const newToken=`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`;
  console.log('Novo token:',newToken);
  const {data:created,err:ec}=await s.from('tables').insert({
    organization_id:'361fb95a-3e9f-43be-a43c-0dc91f851f31',
    store_branch_id:'e5085eba-4398-4c31-ae13-8082b46561ee',
    name:'Mesa Teste QR',
    number:999,
    qr_token:newToken,
    status:'active'
  }).select().single();
  if(ec){console.log('Erro criar:',ec.message);return;}
  console.log('Mesa criada:',created.id.slice(0,8),'token:',created.qr_token);

  // 4) Testar busca pelo novo token
  const {data:found2,err:ef2}=await s.from('tables').select('*').eq('qr_token',newToken);
  console.log('Busca novo token:',found2?.length,'encontrados | Erro:',ef2?.message);

  // 5) Testar URL
  console.log('\nURL do cardápio:');
  console.log(`https://hd-system.pages.dev/#/mesa/${newToken}`);

  // Cleanup
  await s.from('tables').delete().eq('id',created.id);
  console.log('\n[DONE] Mesa teste removida');
})().catch(err=>console.error('ERRO:',err.message));
