import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DateTimeRangeFilter } from './DateTimeRangeFilter';

// Wrapper controlado real (estado ↦ onChange ↦ value), como o MoneyInput test.
function ControlledFilter({ initialStart = '', initialEnd = '' }: { initialStart?: string; initialEnd?: string }) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  return (
    <DateTimeRangeFilter
      startDate={start}
      endDate={end}
      onStartChange={setStart}
      onEndChange={setEnd}
      labelStart="Início"
      labelEnd="Fim"
    />
  );
}

describe('DateTimeRangeFilter', () => {
  it('renderiza os dois inputs datetime-local com os valores iniciais', () => {
    render(
      <DateTimeRangeFilter
        startDate="2026-09-04T14:00"
        endDate="2026-09-04T18:00"
        onStartChange={() => {}}
        onEndChange={() => {}}
      />
    );
    const start = screen.getByLabelText('Data/Hora Inicial') as HTMLInputElement;
    const end = screen.getByLabelText('Data/Hora Final') as HTMLInputElement;
    expect(start.type).toBe('datetime-local');
    expect(end.type).toBe('datetime-local');
    expect(start.value).toBe('2026-09-04T14:00');
    expect(end.value).toBe('2026-09-04T18:00');
  });

  it('repassa a mudança do limite inicial via onChange (ciclo controlado)', () => {
    render(<ControlledFilter />);
    const start = screen.getByLabelText('Início') as HTMLInputElement;
    fireEvent.change(start, { target: { value: '2026-09-05T08:30' } });
    expect(start.value).toBe('2026-09-05T08:30');
  });

  it('repassa a mudança do limite final via onChange (ciclo controlado)', () => {
    render(<ControlledFilter />);
    const end = screen.getByLabelText('Fim') as HTMLInputElement;
    fireEvent.change(end, { target: { value: '2026-09-06T22:00' } });
    expect(end.value).toBe('2026-09-06T22:00');
  });

  it('usa os labels customizados fornecidos', () => {
    render(<ControlledFilter />);
    expect(screen.getByLabelText('Início')).toBeTruthy();
    expect(screen.getByLabelText('Fim')).toBeTruthy();
  });
});
