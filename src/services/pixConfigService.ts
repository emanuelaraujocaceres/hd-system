/**
 * PixConfigService
 *
 * Gerencia a configuração PIX por filial (chave, tipo, titular).
 * Armazena em localStorage com fallback para settings globais.
 * Preparado para migração futura para Supabase (tabela pix_config).
 */

// ─── Types ──────────────────────────────────────────────────────

export type PixKeyType = 'cpf' | 'cnpj' | 'telefone' | 'email' | 'aleatoria';

export interface PixBranchConfig {
  /** Chave PIX (CPF, CNPJ, e-mail, telefone ou UUID) */
  chavePix: string;
  /** Tipo da chave */
  tipoChave: PixKeyType;
  /** Nome do titular da chave */
  nomeTitular: string;
  /** Cidade do titular (para o BR Code) */
  cidade: string;
  /** Se a config está ativa para esta filial */
  ativo: boolean;
}

const STORAGE_PREFIX = 'hd_system_pix_config_';

// ─── Service ────────────────────────────────────────────────────

class PixConfigService {
  /**
   * Retorna a configuração PIX da filial informada.
   * Se não houver config local, retorna null (caller deve usar fallback).
   */
  getConfig(branchId: string): PixBranchConfig | null {
    try {
      const raw = localStorage.getItem(`${STORAGE_PREFIX}${branchId}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PixBranchConfig;
      if (parsed && parsed.chavePix) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Salva a configuração PIX de uma filial.
   */
  saveConfig(branchId: string, config: PixBranchConfig): void {
    localStorage.setItem(`${STORAGE_PREFIX}${branchId}`, JSON.stringify(config));
  }

  /**
   * Remove a configuração PIX de uma filial.
   */
  removeConfig(branchId: string): void {
    localStorage.removeItem(`${STORAGE_PREFIX}${branchId}`);
  }

  /**
   * Retorna a chave PIX efetiva para uma filial.
   * Prioridade: config da filial > settings.pixKey (global).
   * Retorna null se nenhuma chave estiver configurada.
   */
  getEffectivePixKey(branchId: string, globalPixKey?: string): string | null {
    const config = this.getConfig(branchId);
    if (config?.ativo && config.chavePix) return config.chavePix;
    if (globalPixKey) return globalPixKey;
    return null;
  }

  /**
   * Retorna o titular efetivo para uma filial.
   */
  getEffectiveTitle(branchId: string, globalTradeName?: string): string {
    const config = this.getConfig(branchId);
    if (config?.nomeTitular) return config.nomeTitular;
    return globalTradeName || 'HD-SYSTEM';
  }

  /**
   * Retorna a cidade efetiva para uma filial.
   */
  getEffectiveCity(branchId: string, globalCity?: string): string {
    const config = this.getConfig(branchId);
    if (config?.cidade) return config.cidade;
    return globalCity || 'SAO PAULO';
  }

  /**
   * Valida o formato de uma chave PIX conforme seu tipo.
   */
  validateChavePix(chave: string, tipo: PixKeyType): boolean {
    const trimmed = chave.trim();
    switch (tipo) {
      case 'cpf':
        return /^\d{3}\.\d{3}\.\d{3}-\d{2}$|^\d{11}$/.test(trimmed);
      case 'cnpj':
        return /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$|^\d{14}$/.test(trimmed);
      case 'telefone':
        return /^\+?[1-9]\d{1,14}$/.test(trimmed.replace(/\D/g, ''));
      case 'email':
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
      case 'aleatoria':
        return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
      default:
        return false;
    }
  }

  /**
   * Retorna labels amigáveis para os tipos de chave.
   */
  getTipoChaveLabel(tipo: PixKeyType): string {
    const labels: Record<PixKeyType, string> = {
      cpf: 'CPF',
      cnpj: 'CNPJ',
      telefone: 'Telefone',
      email: 'E-mail',
      aleatoria: 'Chave Aleatória',
    };
    return labels[tipo] || tipo;
  }

  /**
   * Retorna placeholders para os campos de chave.
   */
  getPlaceholder(tipo: PixKeyType): string {
    const placeholders: Record<PixKeyType, string> = {
      cpf: '000.000.000-00',
      cnpj: '00.000.000/0000-00',
      telefone: '+5511999999999',
      email: 'email@dominio.com',
      aleatoria: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    };
    return placeholders[tipo] || 'Digite a chave PIX';
  }
}

export const pixConfigService = new PixConfigService();
