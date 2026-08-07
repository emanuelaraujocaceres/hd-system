const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // Verificar policies RLS na tabela tables
  const {data:policies}=await s.rpc('exec_sql',{q:"SELECT policyname, qual FROM pg_policies WHERE tablename='tables'"});
  console.log('POLICIES:');
  console.log(JSON.stringify(policies,null,2));

  // Verificar se RLS esta habilitado
  const {data:rls}=await s.rpc('exec_sql',{q:"SELECT relrowsecurity FROM pg_tables WHERE tablename='tables'"});
  console.log('\nRLS habilitado:',rls);

  // Tentar deletar 1 mesa especifica para ver o erro
  const {data:del,err}=await s.from('tables').delete().eq('qr_token','mesa01-msirf3t3');
  console.log('\nTeste DELETE:',err? 'ERRO: '+err.message : 'OK');
})().catch(x=>console.error(x.message));
