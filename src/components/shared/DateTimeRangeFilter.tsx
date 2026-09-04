import React from 'react';

/**
 * DateTimeRangeFilter — filtro reutilizável de Data/Hora Inicial e Final.
 *
 * Usa dois inputs `datetime-local` (formato "YYYY-MM-DDTHH:mm", hora local do
 * navegador). Mantém o mesmo padrão visual dos filtros de data das telas de
 * vendas/financeiro, permitindo override por `className`/`inputClassName`.
 *
 * O valor vazio ("") significa limite aberto (sem filtro naquele lado).
 */
interface DateTimeRangeFilterProps {
  startDate: string;
  endDate: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  /** Rótulo do filtro inicial (padrão: "Data/Hora Inicial"). */
  labelStart?: string;
  /** Rótulo do filtro final (padrão: "Data/Hora Final"). */
  labelEnd?: string;
  /** Rótulo entre os dois inputs (padrão: "até"). Use "" para ocultar. */
  connector?: string;
  className?: string;
  inputClassName?: string;
}

const DEFAULT_INPUT_CLASS =
  'px-3 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';

export function DateTimeRangeFilter({
  startDate,
  endDate,
  onStartChange,
  onEndChange,
  labelStart = 'Data/Hora Inicial',
  labelEnd = 'Data/Hora Final',
  connector = 'até',
  className = '',
  inputClassName = DEFAULT_INPUT_CLASS,
}: DateTimeRangeFilterProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`.trim()}>
      {labelStart && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#71717a] shrink-0">
          {labelStart}
        </label>
      )}
      <input
        type="datetime-local"
        value={startDate}
        onChange={(e) => onStartChange(e.target.value)}
        className={inputClassName}
        title="Data/hora inicial"
        aria-label={labelStart || 'Data/hora inicial'}
      />
      {connector && (
        <span className="text-xs text-slate-400 dark:text-[#71717a] shrink-0">{connector}</span>
      )}
      {labelEnd && (
        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-[#71717a] shrink-0">
          {labelEnd}
        </label>
      )}
      <input
        type="datetime-local"
        value={endDate}
        onChange={(e) => onEndChange(e.target.value)}
        className={inputClassName}
        title="Data/hora final"
        aria-label={labelEnd || 'Data/hora final'}
      />
    </div>
  );
}
