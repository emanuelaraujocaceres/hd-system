import { useEffect, useCallback } from 'react';

type ShortcutHandler = (e: KeyboardEvent) => void;

interface Shortcut {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  handler: ShortcutHandler;
  /** If true, handler runs even when an input/textarea/select is focused */
  global?: boolean;
}

const INPUT_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Registers keyboard shortcuts. Skips when user is typing in an input
 * unless `shortcut.global === true`.
 */
export function useKeyboardShortcuts(shortcuts: Shortcut[], deps: any[] = []) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      for (const s of shortcuts) {
        const ctrlOrMeta = s.ctrl ? (e.ctrlKey || e.metaKey) : true;
        const meta = s.meta ? e.metaKey : true;
        const shift = s.shift ? e.shiftKey : true;
        const key = (e.key || '').toLowerCase() === (s.key || '').toLowerCase();

        if (key && ctrlOrMeta && meta && shift) {
          // Skip if typing in an input, unless global
          if (!s.global && INPUT_TAGS.has(document.activeElement?.tagName || '')) {
            continue;
          }
          e.preventDefault();
          s.handler(e);
          return;
        }
      }
    },
    [shortcuts, ...deps],
  );

  useEffect(() => {
    // Listen on both document and window for PWA compatibility
    const handler = (e: KeyboardEvent) => handleKeyDown(e);
    document.addEventListener('keydown', handler);
    window.addEventListener('keydown', handler);
    return () => {
      document.removeEventListener('keydown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [handleKeyDown]);
}

/**
 * Convenience: dismiss current modal on Escape key.
 */
export function useEscapeKey(handler: () => void, active: boolean = true) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handler();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handler, active]);
}
