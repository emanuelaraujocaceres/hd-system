const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  // Verificar FK constraints na tabela tables
  const {data:fk}=await s.rpc('exec_sql',{q:"
    SELECT tc.constraint_name, tc.table_name, kcu.column_name,
           ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu ON ccu.constraint_name = tc.constraint_name
    WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'tables';
  "});
  console.log('FK constraints em tables:');
  console.log(JSON.stringify(fk,null,2));

  // Verificar sessoes vinculadas
  const {data:sess}=await s.from('customer_sessions').select('id,table_id').in('table_id',[
    'dc1318f6-74d9-48e0-a8f8-e0761ef91376',
    '4e730acb-ff39-431a-aab7-faef3dfb7203',
    'da0896d4-4e43-435e-afa6-82ad921e764e'
  ]);
  console.log('\nSessoes nas mesas antigas:');
  console.log(JSON.stringify(sess,null,2));
})().catch(x=>console.error(x.message));
