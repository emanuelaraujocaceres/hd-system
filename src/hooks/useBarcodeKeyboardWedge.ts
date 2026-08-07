import { useEffect, useRef } from 'react';

interface BarcodeWedgeOptions {
  /** Called when a barcode burst (digits + Enter) is detected */
  onBarcode: (barcode: string) => void;
  /** While true, the wedge listener is paused (e.g. camera scanner open) */
  paused?: boolean;
  /** Max ms gap between keystrokes to still count as a burst (default 80) */
  burstGapMs?: number;
  /** Minimum digits to qualify as a barcode burst (default 5) */
  minDigits?: number;
}

/**
 * Detects "keyboard wedge" barcode scanners: a rapid burst of digits terminated
 * by Enter. Works alongside manual typing — ignored while an input/textarea is
 * focused so the user's manual form submit is never hijacked.
 *
 * Conflicts with the camera scanner are avoided because that path uses
 * BarcodeDetector (no keystrokes). We still honor `paused` so callers can mute
 * the wedge while the camera overlay is active.
 */
export function useBarcodeKeyboardWedge({
  onBarcode,
  paused = false,
  burstGapMs = 80,
  minDigits = 5,
}: BarcodeWedgeOptions) {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const isDigit = (k: string) => /^[0-9]$/.test(k);

    const onKeyDown = (e: KeyboardEvent) => {
      // Skip when user is typing in a form field — let the form submit handle it.
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Skip when paused (e.g. camera scanner overlay open).
      if (pausedRef.current) return;

      const now = Date.now();

      if (e.key === 'Enter') {
        const buf = bufferRef.current;
        if (buf.length >= minDigits) {
          e.preventDefault();
          onBarcode(buf);
        }
        bufferRef.current = '';
        lastKeyTimeRef.current = 0;
        return;
      }

      if (isDigit(e.key)) {
        const gap = now - lastKeyTimeRef.current;
        // If too slow, reset buffer (new burst).
        if (lastKeyTimeRef.current !== 0 && gap > burstGapMs) {
          bufferRef.current = '';
        }
        bufferRef.current += e.key;
        lastKeyTimeRef.current = now;
        return;
      }

      // Any non-digit, non-Enter key breaks the burst.
      bufferRef.current = '';
      lastKeyTimeRef.current = 0;
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBarcode, burstGapMs, minDigits]);
}
