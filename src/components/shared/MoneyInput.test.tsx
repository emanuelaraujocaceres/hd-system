import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput } from './MoneyInput';

// Componente controlado real (estado ↦ onChange ↦ value) para simular o ciclo
// de digitação que acontece nos formulários do app.
function ControlledMoneyInput({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <MoneyInput value={value} onChange={setValue} aria-label="valor" />;
}

// Simula a digitação de um usuário: o navegador concatena cada dígito ao
// texto formatado exibido no campo (ex.: "0,09" + "9" → "0,099").
function typeDigits(input: HTMLInputElement, digits: string) {
  for (const d of digits) {
    const current = input.value;
    fireEvent.change(input, { target: { value: current + d } });
  }
}

describe('MoneyInput — digitação por centavos', () => {
  it('converte dígitos digitados sem vírgula nos centavos (995 → 9,95)', () => {
    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText('valor') as HTMLInputElement;
    typeDigits(input, '995');
    expect(input.value).toBe('9,95');
  });

  it('exibe "0,05" ao digitar apenas "5"', () => {
    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText('valor') as HTMLInputElement;
    typeDigits(input, '5');
    expect(input.value).toBe('0,05');
  });

  it('apaga o último dígito com backspace', () => {
    render(<ControlledMoneyInput />);
    const input = screen.getByLabelText('valor') as HTMLInputElement;
    typeDigits(input, '995'); // 9,95
    fireEvent.change(input, { target: { value: '9,9' } }); // backspace no último
    expect(input.value).toBe('0,99');
  });

  it('aceita valor inicial formatado com vírgula e continua digitando por centavos', () => {
    render(<ControlledMoneyInput initial="12,34" />);
    const input = screen.getByLabelText('valor') as HTMLInputElement;
    expect(input.value).toBe('12,34');
    // digitar "5" concatena → "12,345" → 12345 centavos → R$ 123,45
    fireEvent.change(input, { target: { value: '12,345' } });
    expect(input.value).toBe('123,45');
  });
});
