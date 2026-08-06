import { supabase } from './supabase';

/* ------------------------------------------------------------------ */
/*  Helpers de API do servidor (Express local OU Cloudflare Pages      */
/*  Functions — mesmo contrato /api/...).                              */
/* ------------------------------------------------------------------ */

/** Pega o access token da sessão atual para autenticar chamadas ao servidor */
export async function getAuthToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Chama uma rota da API do servidor (mesmo domínio — /api/...). */
export async function callServerApi<T>(
  path: string,
  body: Record<string, any>
): Promise<{ data: T | null; error: string | null }> {
  try {
    const token = await getAuthToken();
    const res = await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json.message || `HTTP ${res.status}` };
    return { data: json as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message || 'Erro de conexão com o servidor' };
  }
}
