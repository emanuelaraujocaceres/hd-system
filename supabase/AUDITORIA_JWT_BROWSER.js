// =====================================================================
// AUDITORIA JWT no NAVEGADOR — cole este código no console (F12) com a
// aba do HD-System aberta. Ele decodifica o token do Supabase e compara
// o iat (emitido-em) com:
//   (a) o relógio do NAVEGADOR
//   (b) o TEMPO REAL (worldtimeapi, independente do PC)
//
// Isso diz se o token tem iat no futuro (servidor Auth adiantado) ou se
// o problema é o relógio do seu PC.
// =====================================================================
(async () => {
  const keys = Object.keys(localStorage).filter(
    (k) => k.includes('supabase') || k.includes('auth')
  );
  console.log('🔑 Chaves de auth no localStorage:', keys);

  let token = null, raw = null, usedKey = null;
  for (const k of keys) {
    try {
      const v = JSON.parse(localStorage.getItem(k));
      if (v && v.access_token) { raw = v; token = v.access_token; usedKey = k; break; }
    } catch {}
  }
  if (!token) {
    console.log('⚠️ Nenhum access_token no localStorage. O token pode estar só em memória (recarregue a página após limpar dados).');
    return;
  }
  console.log('📦 Token em:', usedKey);

  // Decodificar payload JWT (base64url)
  const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(b64));
  const nowSec = Math.floor(Date.now() / 1000);

  console.log('--- PAYLOAD JWT ---');
  console.log('sub :', payload.sub);
  console.log('email:', payload.email);
  console.log('role:', payload.role);
  console.log('iat (emitido) :', payload.iat, '→', new Date(payload.iat * 1000).toISOString());
  console.log('exp (expira)  :', payload.exp, '→', new Date(payload.exp * 1000).toISOString());

  console.log('--- RELÓGIOS ---');
  console.log('agora NAVEGADOR:', nowSec, '→', new Date(nowSec * 1000).toISOString());
  console.log('dif iat - nav :', payload.iat - nowSec, 'segundos',
    payload.iat > nowSec ? '⚠️ iat NO FUTURO vs PC' : '✅ iat <= PC');

  // Tempo REAL independente do relógio do PC
  try {
    const t = await fetch('https://worldtimeapi.org/api/timezone/Etc/UTC').then((r) => r.json());
    const realSec = Math.floor(Date.parse(t.utc_datetime) / 1000);
    console.log('agora REAL    :', realSec, '→', t.utc_datetime);
    const diffReal = payload.iat - realSec;
    console.log('dif iat - REAL:', diffReal, 'segundos');
    if (diffReal > 5) {
      console.log('🔴 CONCLUSÃO: iat está NO FUTURO vs tempo REAL → token emitido com relógio ADIANTADO (clock skew do servidor Auth GoTrue).');
    } else if (payload.iat <= realSec && diffReal < -300) {
      console.log('🟡 CONCLUSÃO: iat está no passado (token antigo/expirado). O servidor rejeita por outro motivo (veja exp).');
    } else {
      console.log('🟢 CONCLUSÃO: iat está OK vs tempo real. O "issued at future" vem do relógio do PC estar atrasado OU do servidor de API (PostgREST) estar atrasado vs Auth.');
    }
  } catch (e) {
    console.log('⚠️ Não consegui obter tempo real (sem rede?):', e.message);
  }

  console.log('--- EXTRA ---');
  console.log('Token expira em (segundos desde agora):', payload.exp - nowSec);
})();
