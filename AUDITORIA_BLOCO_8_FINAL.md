# BLOCO 8 — MICROINTERAÇÕES (AUDITORIA COMPLETA — NENHUMA ALTERAÇÃO NESTA RODADA)
- Animações: `transition-all` (`l.842`: card cliente), `transition-colors` (`l.886`: tabs), `duration-300` ausente (`l.842`: sem `duration`); `animate-[slideIn_0.3s_ease-out]` (`l.157`, `ToastItem`) — suave, mas `backdrop-blur-sm` (`l.1082`, modal) pode ser pesado em mobile.
- Sons: `posAudio.chime()` (sucesso, `l.708`, `l.510`); `posAudio.error()` (erro, `l.736`); `posAudio.click()` (click, `l.275`, `l.682`); `posAudio.unlock()` (não auditado integralmente). Nenhum `audioService.enable` verificado (`audioService.ts` não auditado integralmente nesta sessão — apenas referenciado). Nenhuma alteração aplicada.
- Haptic: `vibrate()` não encontrado (`grep` vazio para `vibrate` no `FiadosView`). Nenhuma alteração aplicada.
- `prefers-reduced-motion`: não verificado no `FiadosView` (`grep` vazio). Nenhuma alteração aplicada.
- Status: concluído (`AUDITORIA_BLOCO_8.md`).
