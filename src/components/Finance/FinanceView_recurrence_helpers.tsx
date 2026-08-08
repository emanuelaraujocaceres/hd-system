// ── Dar baixa em ocorrência individual ─────────────────────────
  const handleMarkRecurrencePaid = useCallback(
    (account: FinancialAccount, recurrenceId: string) => {
      if (!account.recurrences) return;
      const updated = {
        ...account,
        recurrences: account.recurrences.map((rec) =>
          rec.id === recurrenceId ? { ...rec, status: 'paid' as const, paidDate: new Date().toISOString().slice(0, 10) } : rec
        ),
      };
      if (updated.recurrences.every((r) => r.status === 'paid')) {
        updated.status = 'paid';
      }
      storageService.saveFinancialAccount(updated);
      posAudio.chime();
      addToast('success', `Ocorrência marcada como paga.`);
    },
    [addToast]
  );

  // ── Dar baixa em parcela individual ─────────────────────────────
  const handleMarkInstallmentPaid = useCallback(
    (account: FinancialAccount, installmentId: string) => {
      if (!account.installments) return;
      const updated = {
        ...account,
        installments: account.installments.map((inst) =>
          inst.id === installmentId ? { ...inst, status: 'paid' as const, paidDate: new Date().toISOString().slice(0, 10) } : inst
        ),
      };
      if (updated.installments.every((i) => i.status === 'paid')) {
        updated.status = 'paid';
      }
      storageService.saveFinancialAccount(updated);
      posAudio.chime();
      addToast('success', `Parcela marcada como paga.`);
    },
    [addToast]
  );