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

// Quantos dígitos inteiros no máximo (evita valores absurdos). 9 dígitos = até
// R$ 9.999.999,99.
const MAX_DIGITS = 9;

/**
 * Input de dinheiro com "vírgula inteligente" (digitação por centavos):
 *
 * Você digita SÓ os números e os DOIS ÚLTIMOS dígitos são sempre os centavos.
 * Ex.:  '5'   → 0,05
 *       '59'  → 0,59
 *       '590' → 5,90
 *       '995' → 9,95
 *
 * Assim nunca é preciso apertar a vírgula: ela é inserida automaticamente
 * "pulando as casas". O value passado no `onChange` é o texto pt-BR formatado
 * (ex.: "9,95"); use `parseBrlToNumber()` ao salvar.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(({
  value,
  onChange,
  onNumericChange,
  className = '',
  ...props
}, ref) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Pega apenas os dígitos (0-9) presentes no campo, descartando máscara.
    // Como o campo mostra o valor formatado, digitar um dígito concatena e o
    // próximo dígito "empurra" as casas — ex.: "5," + "9" → "5,9x" → 0,59.
    let digits = e.target.value.replace(/\D/g, '');
    digits = digits.slice(0, MAX_DIGITS);

    const cents = digits ? parseInt(digits, 10) : 0;
    const num = cents / 100;
    onChange(formatNumberToBrl(num));
    if (onNumericChange) onNumericChange(num);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      inputMode="numeric"
      value={value}
      onChange={handleChange}
      className={className}
    />
  );
});

MoneyInput.displayName = 'MoneyInput';
