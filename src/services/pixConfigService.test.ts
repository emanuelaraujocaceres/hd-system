import { describe, it, expect, beforeEach } from 'vitest';
import { pixConfigService } from './pixConfigService';
import type { PixKeyType } from './pixConfigService';

// ── validateChavePix ─────────────────────────────────────────────────

describe('pixConfigService.validateChavePix', () => {
  describe('cpf', () => {
    it('aceita CPF formatado', () => {
      expect(pixConfigService.validateChavePix('123.456.789-00', 'cpf')).toBe(true);
    });

    it('aceita CPF sem formatação (11 dígitos)', () => {
      expect(pixConfigService.validateChavePix('12345678900', 'cpf')).toBe(true);
    });

    it('rejeita CPF com dígitos insuficientes', () => {
      expect(pixConfigService.validateChavePix('123.456.789-0', 'cpf')).toBe(false);
      expect(pixConfigService.validateChavePix('1234567890', 'cpf')).toBe(false);
    });

    it('rejeita string não numérica', () => {
      expect(pixConfigService.validateChavePix('abc', 'cpf')).toBe(false);
    });
  });

  describe('cnpj', () => {
    it('aceita CNPJ formatado', () => {
      expect(pixConfigService.validateChavePix('12.345.678/0001-99', 'cnpj')).toBe(true);
    });

    it('aceita CNPJ sem formatação (14 dígitos)', () => {
      expect(pixConfigService.validateChavePix('12345678000199', 'cnpj')).toBe(true);
    });

    it('rejeita CNPJ curto', () => {
      expect(pixConfigService.validateChavePix('1234567800019', 'cnpj')).toBe(false);
    });
  });

  describe('telefone', () => {
    it('aceita telefone com código do país', () => {
      expect(pixConfigService.validateChavePix('+5511999999999', 'telefone')).toBe(true);
    });

    it('aceita telefone sem "+"', () => {
      expect(pixConfigService.validateChavePix('5511999999999', 'telefone')).toBe(true);
    });

    it('rejeita telefone com letras', () => {
      expect(pixConfigService.validateChavePix('abc', 'telefone')).toBe(false);
    });
  });

  describe('email', () => {
    it('aceita email válido', () => {
      expect(pixConfigService.validateChavePix('user@example.com', 'email')).toBe(true);
    });

    it('rejeita email inválido', () => {
      expect(pixConfigService.validateChavePix('noat', 'email')).toBe(false);
      expect(pixConfigService.validateChavePix('@domain.com', 'email')).toBe(false);
    });
  });

  describe('aleatoria', () => {
    it('aceita UUID válido', () => {
      expect(pixConfigService.validateChavePix('a1b2c3d4-e5f6-7890-abcd-ef1234567890', 'aleatoria')).toBe(true);
    });

    it('aceita UUID case-insensitive', () => {
      expect(pixConfigService.validateChavePix('A1B2C3D4-E5F6-7890-ABCD-EF1234567890', 'aleatoria')).toBe(true);
    });

    it('rejeita string não-UUID', () => {
      expect(pixConfigService.validateChavePix('not-a-uuid', 'aleatoria')).toBe(false);
    });
  });
});

// ── getTipoChaveLabel ────────────────────────────────────────────────

describe('pixConfigService.getTipoChaveLabel', () => {
  it('retorna label correta para cada tipo', () => {
    expect(pixConfigService.getTipoChaveLabel('cpf')).toBe('CPF');
    expect(pixConfigService.getTipoChaveLabel('cnpj')).toBe('CNPJ');
    expect(pixConfigService.getTipoChaveLabel('telefone')).toBe('Telefone');
    expect(pixConfigService.getTipoChaveLabel('email')).toBe('E-mail');
    expect(pixConfigService.getTipoChaveLabel('aleatoria')).toBe('Chave Aleatória');
  });

  it('retorna o próprio tipo como fallback para tipo desconhecido', () => {
    expect(pixConfigService.getTipoChaveLabel('desconhecido' as PixKeyType)).toBe('desconhecido');
  });
});

// ── getEffectivePixKey ───────────────────────────────────────────────

describe('pixConfigService.getEffectivePixKey', () => {
  const BRANCH_ID = 'test-branch-pix';

  beforeEach(() => {
    pixConfigService.removeConfig(BRANCH_ID);
  });

  it('retorna null quando não há config filial nem global', () => {
    expect(pixConfigService.getEffectivePixKey(BRANCH_ID)).toBeNull();
  });

  it('retorna a global quando não há config filial', () => {
    expect(pixConfigService.getEffectivePixKey(BRANCH_ID, 'global-key@test.com')).toBe('global-key@test.com');
  });

  it('retorna a chave filial quando está ativa e tem chavePix', () => {
    pixConfigService.saveConfig(BRANCH_ID, {
      chavePix: 'branch-key@test.com',
      tipoChave: 'email',
      nomeTitular: 'Filial Teste',
      cidade: 'São Paulo',
      ativo: true,
    });
    expect(pixConfigService.getEffectivePixKey(BRANCH_ID, 'global-key@test.com')).toBe('branch-key@test.com');
  });

  it('cai na global quando filial está inativa', () => {
    pixConfigService.saveConfig(BRANCH_ID, {
      chavePix: 'branch-key@test.com',
      tipoChave: 'email',
      nomeTitular: 'Filial Teste',
      cidade: 'São Paulo',
      ativo: false,
    });
    expect(pixConfigService.getEffectivePixKey(BRANCH_ID, 'global-key@test.com')).toBe('global-key@test.com');
  });

  it('cai na global quando filial não tem chavePix', () => {
    pixConfigService.saveConfig(BRANCH_ID, {
      chavePix: '',
      tipoChave: 'email',
      nomeTitular: 'Filial Teste',
      cidade: 'São Paulo',
      ativo: true,
    });
    expect(pixConfigService.getEffectivePixKey(BRANCH_ID, 'global-key@test.com')).toBe('global-key@test.com');
  });
});
