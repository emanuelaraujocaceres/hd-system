/**
 * Tests for useBarcodeKeyboardWedge hook.
 *
 * Este hook agora é usado em duas telas (PDV e Estoque/Entrada). Estas
 * regressões garantem que a detecção de leitor USB "keyboard wedge"
 * (rajada de dígitos + Enter) funciona como esperado e, principalmente,
 * NÃO interfere na digitação manual (input focado) nem dispara quando pausado.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useBarcodeKeyboardWedge } from '../hooks/useBarcodeKeyboardWedge';

function fireKey(key: string) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

describe('useBarcodeKeyboardWedge', () => {
  const onBarcode = vi.fn();

  beforeEach(() => {
    onBarcode.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('dispara onBarcode com o código completo após rajada de dígitos + Enter (cenário feliz)', () => {
    renderHook(() => useBarcodeKeyboardWedge({ onBarcode }));

    act(() => {
      // Leitor USB "digita" o código 7891234567890 rapidamente e termina com Enter
      const code = '7891234567890';
      for (const d of code) fireKey(d);
      fireKey('Enter');
    });

    expect(onBarcode).toHaveBeenCalledTimes(1);
    expect(onBarcode).toHaveBeenCalledWith('7891234567890');
  });

  it('NÃO dispara se a rajada de dígitos não for terminada por Enter (falha)', () => {
    renderHook(() => useBarcodeKeyboardWedge({ onBarcode }));

    act(() => {
      fireKey('1');
      fireKey('2');
      fireKey('3');
      // sem Enter
    });

    expect(onBarcode).not.toHaveBeenCalled();
  });

  it('NÃO dispara enquanto paused=true, mesmo com rajada + Enter (falha)', () => {
    renderHook(() => useBarcodeKeyboardWedge({ onBarcode, paused: true }));

    act(() => {
      fireKey('1');
      fireKey('2');
      fireKey('3');
      fireKey('4');
      fireKey('5');
      fireKey('Enter');
    });

    expect(onBarcode).not.toHaveBeenCalled();
  });

  it('ignora teclas não dígitos e NÃO captura digitação manual em campo de formulário (falha)', () => {
    renderHook(() => useBarcodeKeyboardWedge({ onBarcode }));

    // Simula o usuário digitando dentro de um input (document.activeElement = INPUT)
    const input = document.createElement('input');
    vi.spyOn(document, 'activeElement', 'get').mockReturnValue(input as unknown as Element);

    act(() => {
      fireKey('1');
      fireKey('2');
      fireKey('3');
      fireKey('4');
      fireKey('5');
      fireKey('Enter');
    });

    expect(onBarcode).not.toHaveBeenCalled();
  });

  it('reseta o buffer quando o intervalo entre teclas excede burstGapMs (falha: só dispara a 2ª rajada)', () => {
    // Controla Date.now para simular intervalos maiores que o gap
    let now = 0;
    vi.spyOn(Date, 'now').mockImplementation(() => now);

    renderHook(() => useBarcodeKeyboardWedge({ onBarcode, burstGapMs: 80 }));

    // 1ª rajada rápida (intervalo de 10ms)
    now = 0;
    fireKey('1'); // now=0
    now = 10;
    fireKey('2'); // gap=10 <= 80, buffer="12"
    now = 1000; // gap de 990ms > 80 → buffer resetado no próximo dígito
    fireKey('3'); // gap=990 > 80 → buffer limpo, recomeça "3"
    now = 10;
    fireKey('4'); // gap pequeno, buffer="34"
    now = 1010; // gap 1000 > 80 → limpa
    fireKey('5'); // buffer="5"
    fireKey('Enter'); // buffer="5" mas len < minDigits(5) → não dispara
    expect(onBarcode).not.toHaveBeenCalled();

    // 2ª rajada válida: 5 dígitos rápidos + Enter
    now = 0;
    for (const d of '12345') {
      fireKey(d);
      now += 10;
    }
    fireKey('Enter');
    expect(onBarcode).toHaveBeenCalledTimes(1);
    expect(onBarcode).toHaveBeenCalledWith('12345');
  });
});
