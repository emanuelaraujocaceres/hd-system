# BLOCO 9 — COMPARAÇÃO COM RESTO DO SISTEMA (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- `ComandaView` (`comandaService.ts` — referenciado, não auditado integralmente): usa `storageService` para `customer_sessions`, `sales` (`addSale`), `tables`. Nenhuma alteração aplicada.
- `FinanceView` (`FinanceView.tsx`): `grid` (`l.700` no `FiadosView` — similar), `rounded-2xl` (`l.795` — `search` no `FiadosView` vs `l.36` no `FinanceView` — similar), `shadow-sm` (`l.795` vs `l.36` — similar), `bg-white` (`l.795` vs `l.164` — similar). Nenhuma inconsistência crítica identificada (apenas `text-[10px]` no `FiadosView` vs `text-xs` no `FinanceView` — diferença de escala, mas não quebra consistência).
- `CRMView` (`CRMView.tsx` — não auditado integralmente): usa `FiadosView` como componente filho (`l.1162` no `App.tsx`). Nenhuma alteração aplicada.
- `SettingsView` (`SettingsView.tsx`): `addToast` usado (`BUG-032` corrigido anteriormente — `import { useToast }` + `const { addToast } = useToast()` aplicado). Nenhuma alteração aplicada.
- Nenhum arquivo alterado além dos 4 confirmados. Nenhuma alteração aplicada nesta rodada.
- Status: concluído (`AUDITORIA_BLOCO_9_FINAL.md`).
