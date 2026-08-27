import { describe, it, expect } from 'vitest';
import { MODULE_VISIBILITY_MAP, MODULE_VISIBILITY_OVERRIDE } from './Sidebar';
import { storageService } from '../../services/storageService';

/**
 * Regressão do bug "caixa de seleção ≠ item de menu" (Fiados).
 *
 * Regra de negócio: o que aparece no menu deve ter a caixa marcada na aba
 * Módulos, e o que não aparece não pode ter caixa marcada. Isso só vale se o
 * item de menu "fiados" for controlado pela MESMA chave da aba (moduleFiado),
 * e não por moduleCrm.
 */
describe('Mapeamento de visibilidade de módulos (regressão Fiados)', () => {
  it('o item de menu "fiados" resolve para moduleFiado (não moduleCrm)', () => {
    const resolved = MODULE_VISIBILITY_OVERRIDE['fiados'] ?? 'fiados';
    expect(MODULE_VISIBILITY_MAP[resolved]).toBe('moduleFiado');
  });

  it('moduleFiado é uma chave conhecida do mapa efetivo de visibilidade', () => {
    const defaults = storageService.getDefaultModuleVisibility();
    expect(defaults).toHaveProperty('moduleFiado');
    expect(typeof defaults.moduleFiado).toBe('boolean');
  });

  it('toda chave referenciada no menu existe no mapa efetivo (sem chave órfã)', () => {
    const defaults = storageService.getDefaultModuleVisibility();
    const referenced = Object.values(MODULE_VISIBILITY_MAP);
    for (const key of referenced) {
      expect(defaults).toHaveProperty(key, expect.any(Boolean));
    }
  });
});
