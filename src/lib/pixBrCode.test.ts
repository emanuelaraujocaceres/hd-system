import { describe, expect, it } from 'vitest';
import { buildPixBrCode, crc16Ccitt } from './pixBrCode';

describe('buildPixBrCode', () => {
  it('gera BR Code com valor final e CRC válido', () => {
    const payload = buildPixBrCode('cliente@exemplo.com', 12.5, 'Adega São João', 'São Paulo');
    expect(payload).toContain('540512.50');
    expect(payload).toContain('5914ADEGA SAO JOAO');
    expect(payload.slice(-4)).toBe(crc16Ccitt(payload.slice(0, -4)));
  });

  it('rejeita chave vazia', () => {
    expect(() => buildPixBrCode('', 10, 'Loja', 'Cidade')).toThrow('Chave Pix é obrigatória.');
  });
});
