import { createClient } from '@supabase/supabase-js';

// Cliente Supabase ANON PURO para o cardápio público (#/mesa/, #/delivery).
//
// PROBLEMA (auditoria 2026-09-08): o cliente padrão `supabase` persiste a sessão
// do operador (juninho/Gustavo) no localStorage. Quando o mesmo aparelho abre o
// QR da mesa, os upserts do cardápio iam com `Authorization: Bearer <JWT do
// operador>` em vez de anon. Resultado:
//  - RLS `sales_insert_anon TO anon` não aplicava (role=authenticated);
//  - `org_branch_insert_* TO authenticated` negava (filial do JWT ≠ filial da mesa);
//  - `401/42501` na DLQ e venda presa no aparelho (`visible=false`).
//
// Este cliente NÃO persiste sessão (persistSession:false) e nunca carrega o JWT
// do operador — toda escrita do cardápio sai como `role=anon`, caindo nas
// policies `*_anon WITH CHECK (true)` (exceção 0f documentada).
const metaEnv = (import.meta as any).env || {};
export const ANON_URL =
  metaEnv.VITE_SUPABASE_URL || 'https://tixwhmgzibvazkqbqoev.supabase.co';
export const ANON_KEY =
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRpeHdobWd6aWJ2YXprcWJxb2V2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ4OTcyNDMsImV4cCI6MjEwMDQ3MzI0M30._5d_QlYpWXTUB4Bh4MbK5AGXUrFKkfiJPzPEz3Zi7yg';

export const supabaseAnon = createClient(ANON_URL, ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

// fetch REST direto com anon (sem JWT de operador). Usado pelo cardápio para
// leituras/escritas que precisam ser 100% anon mesmo com perfil salvo.
export async function anonFetch(
  path: string,
  init?: RequestInit & { branchId?: string }
): Promise<Response> {
  const { branchId, ...rest } = init || {};
  const headers: Record<string, string> = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${ANON_KEY}`,
    'Content-Type': 'application/json',
    ...((rest.headers as Record<string, string>) || {}),
  };
  if (branchId) headers['x-branch-id'] = branchId;
  return fetch(`${ANON_URL}${path}`, { ...rest, headers });
}
