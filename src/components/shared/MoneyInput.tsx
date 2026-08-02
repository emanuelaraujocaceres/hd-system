import React, { forwardRef } from 'react';

interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  /** Passa o número já convertido (vírgula→ponto) no onChange do formulário */
  onNumericChange?: (value: number) => void;
}

/** Converte "1.234,56" (pt-BR) → "1234.56" para parseFloat seguro */
export function parseBrlToNumber(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/** Formata um número para exibição pt-BR ("1234.5" → "1.234,50") */
export function formatNumberToBrl(value: number): string {
  if (isNaN(value)) return '';
  return value.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Input de dinheiro com máscara pt-BR (aceita "5,90" e "5.90").
 * Mantém o texto cru no estado do formulário; use `parseBrlToNumber()` ao salvar.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({
  value,
  onChange,
  onNumericChange,
  className = '',
  ...props
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/[^\d.,]/g, '');

    // Aceita vírgula ou ponto como separador decimal — normaliza para vírgula
    if (raw.includes('.') && raw.includes(',')) {
      // Ex.: "1.234,56" — remove pontos dos milhares, mantém vírgula decimal
      raw = raw.replace(/\./g, '').replace(',', '.');
    } else if (raw.includes('.')) {
      raw = raw.replace('.', ',');
    }

    // Limita a 2 casas decimais
    const commaIndex = raw.indexOf(',');
    if (commaIndex !== -1 && raw.length - commaIndex - 1 > 2) {
      raw = raw.slice(0, commaIndex + 3);
    }

    onChange(raw);
    if (onNumericChange) onNumericChange(parseBrlToNumber(raw));
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="decimal"
      value={value}
      onChange={handleChange}
      className={className}
    />
  );
});

MoneyInput.displayName = 'MoneyInput';
