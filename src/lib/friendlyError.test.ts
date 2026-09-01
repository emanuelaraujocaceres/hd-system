import { describe, it, expect, vi, beforeEach } from 'vitest';
import { friendlyErrorMessage } from './friendlyError';

describe('friendlyErrorMessage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retorna mensagem amigável para erro JWT/expired', () => {
    expect(friendlyErrorMessage({ message: 'JWT expired' }, 'fallback')).toBe(
      'Sua sessão expirou. Faça login novamente.',
    );
  });

  it('retorna mensagem amigável para erro com "token"', () => {
    expect(friendlyErrorMessage({ message: 'invalid token format' }, 'fallback')).toBe(
      'Sua sessão expirou. Faça login novamente.',
    );
  });

  it('retorna mensagem amigável para erro de rede/fetch', () => {
    expect(friendlyErrorMessage({ message: 'Failed to fetch' }, 'fallback')).toBe(
      'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    );
  });

  it('retorna mensagem amigável para "network error"', () => {
    expect(friendlyErrorMessage({ message: 'network error' }, 'fallback')).toBe(
      'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    );
  });

  it('retorna mensagem amigável para "load failed"', () => {
    expect(friendlyErrorMessage({ message: 'load failed' }, 'fallback')).toBe(
      'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    );
  });

  it('retorna mensagem amigável para erro RLS/permission/policy', () => {
    expect(friendlyErrorMessage({ message: 'row-level security policy violated' }, 'fallback')).toBe(
      'Você não tem permissão para realizar esta ação.',
    );
  });

  it('retorna mensagem amigável para "permission denied"', () => {
    expect(friendlyErrorMessage({ message: 'permission denied' }, 'fallback')).toBe(
      'Você não tem permissão para realizar esta ação.',
    );
  });

  it('retorna mensagem amigável para erro duplicate/already exists', () => {
    expect(friendlyErrorMessage({ message: 'duplicate key value violates unique constraint' }, 'fallback')).toBe(
      'Este registro já existe. Verifique os dados e tente novamente.',
    );
  });

  it('retorna mensagem amigável para "already exists"', () => {
    expect(friendlyErrorMessage({ message: 'Record already exists' }, 'fallback')).toBe(
      'Este registro já existe. Verifique os dados e tente novamente.',
    );
  });

  it('retorna mensagem amigável para "not found"', () => {
    expect(friendlyErrorMessage({ message: 'Row not found' }, 'fallback')).toBe(
      'Registro não encontrado. Ele pode ter sido excluído.',
    );
  });

  it('retorna mensagem amigável para "does not exist"', () => {
    expect(friendlyErrorMessage({ message: 'The resource does not exist' }, 'fallback')).toBe(
      'Registro não encontrado. Ele pode ter sido excluído.',
    );
  });

  it('retorna fallback quando mensagem não é reconhecida', () => {
    expect(friendlyErrorMessage({ message: 'Unknown error 500' }, 'Algo deu errado')).toBe(
      'Algo deu errado',
    );
  });

  it('retorna fallback para null/undefined', () => {
    expect(friendlyErrorMessage(null, 'fallback msg')).toBe('fallback msg');
    expect(friendlyErrorMessage(undefined, 'fallback msg')).toBe('fallback msg');
  });

  it('retorna fallback para objeto sem .message', () => {
    expect(friendlyErrorMessage({ code: 42 }, 'fallback msg')).toBe('fallback msg');
  });

  it('chama console.error para erros não reconhecidos', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    friendlyErrorMessage({ message: 'something weird' }, 'fallback');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('NÃO chama console.error para erros reconhecidos (deixa passar)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    friendlyErrorMessage({ message: 'JWT expired' }, 'fallback');
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('case-insensitive nas regex', () => {
    expect(friendlyErrorMessage({ message: 'JWT EXPIRED' }, 'fb')).toBe(
      'Sua sessão expirou. Faça login novamente.',
    );
    expect(friendlyErrorMessage({ message: 'NETWORK ERROR' }, 'fb')).toBe(
      'Sem conexão com a internet. Verifique sua rede e tente novamente.',
    );
  });
});
