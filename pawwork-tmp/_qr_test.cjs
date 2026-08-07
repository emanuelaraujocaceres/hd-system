const fs=require('fs'),path=require('path');
const e={};fs.readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)="?([^"]*)"?$/);if(m)e[m[1]]=m[2].trim();});
const {createClient}=require(path.join(process.cwd(),'node_modules','@supabase','supabase-js'));
const s=createClient(e.VITE_SUPABASE_URL,e.SUPABASE_SERVICE_ROLE_KEY);

(async()=>{
  const TOKEN='msiqhc02-4oaocq4o';
  console.log('=== TESTE QR CODE ===\n');

  // 1) Buscar mesa pelo token
  const {data:mesa,err}=await s.from('tables').select('*').eq('qr_token',TOKEN).eq('status','active').single();
  if(err){console.log('Erro busca:',err.message);return;}
  console.log('Mesa encontrada:',mesa.name,'| id:',mesa.id);

  // 2) Verificar customer_sessions
  const {data:sess}=await s.from('customer_sessions').select('*').eq('table_id',mesa.id);
  console.log('Sessões na mesa:',sess?.length||0);
})().catch(err=>console.error('ERRO:',err.message));
