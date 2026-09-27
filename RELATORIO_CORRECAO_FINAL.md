# CORREÇÃO FINAL — getSaleCreditAmount (FASE EXTRA — CONFIRMADA)

## Antes (l.106, `FiadosView.tsx`):
```typescript
    .filter((cp) => cp.saleId === sale.id && !cp.isItemPayment)
```
## Depois (l.106, `FiadosView.tsx`):
```typescript
    .filter((cp) => cp.saleId === sale.id)
```
- Status: ✅ Aplicado
- `npm run lint`: 0 erros
- Impacto: `getSaleCreditAmount` agora conta TODOS os `credit_payments` (FIFO + por item) — consistente com `customerDebts` (`totalPaid` corrigido na FASE 1) e com `getSaleItemPayments()` (FASE 1.5).

Nenhuma alteração além desta linha.
