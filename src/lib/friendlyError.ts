/**
 * Converte erros técnicos crus em mensagens amigáveis em pt-BR.
 * O `err?.message` técnico fica só no console para diagnóstico.
 */
export function friendlyErrorMessage(err: unknown, fallback: string): string {
  // Erros conhecidos do Supabase que dão para traduzir bem
  const msg = (err as any)?.message || '';
  if (typeof msg === 'string') {
    if (/JWT|expired|token/i.test(msg)) {
      return 'Sua sessão expirou. Faça login novamente.';
    }
    if (/network|fetch|failed to fetch|load failed/i.test(msg)) {
      return 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
    }
    if (/row-level security|permission|policy/i.test(msg)) {
      return 'Você não tem permissão para realizar esta ação.';
    }
    if (/duplicate|already exists|unique/i.test(msg)) {
      return 'Este registro já existe. Verifique os dados e tente novamente.';
    }
    if (/not found|does not exist/i.test(msg)) {
      return 'Registro não encontrado. Ele pode ter sido excluído.';
    }
  }
  // Mantém o detalhe técnico no console, mas mostra algo amigável ao usuário
  if (err) console.error('[HD] Erro tratado:', err);
  return fallback;
}
