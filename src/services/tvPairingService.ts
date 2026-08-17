import { supabase } from '../lib/supabase';

/**
 * tvPairingService — pareamento do aparelho de TV / vitrine com um
 * `media_device` cadastrado no painel (código de 6 dígitos) + heartbeat.
 *
 * A TV roda o mesmo app e guarda localmente qual dispositivo ela é.
 * O heartbeat (RPC `heartbeat_media_device`) mantém `last_seen_at`
 * atualizado no cloud para o painel exibir status online/offline.
 */

const PAIRED_TV_KEY = 'hd_system_paired_tv';

export interface PairedTv {
  deviceId: string;
  branchId?: string;
  pairedAt: string;
}

export const tvPairing = {
  getPairedTv(): PairedTv | null {
    try {
      const raw = localStorage.getItem(PAIRED_TV_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as PairedTv;
      if (!parsed || !parsed.deviceId) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  savePairedTv(pair: { deviceId: string; branchId?: string }): void {
    const data: PairedTv = {
      deviceId: pair.deviceId,
      branchId: pair.branchId,
      pairedAt: new Date().toISOString(),
    };
    localStorage.setItem(PAIRED_TV_KEY, JSON.stringify(data));
  },

  clearPairedTv(): void {
    localStorage.removeItem(PAIRED_TV_KEY);
  },

  /**
   * Envia um batimento cardíaco para o dispositivo. Throttled no servidor
   * (15s), então chamar a cada 30s é seguro. Falhas silenciosas: a TV
   * continua exibindo conteúdo offline.
   */
  async heartbeat(deviceId: string): Promise<void> {
    if (!deviceId) return;
    try {
      await Promise.resolve(supabase.rpc('heartbeat_media_device', { p_device_id: deviceId }));
    } catch (err) {
      console.warn('[tvPairing] heartbeat falhou:', err);
    }
  },
};
