/**
 * SupabaseSyncService
 * Bridge entre localStorage e Supabase para sincronização em tempo real.
 * 
 * Estratégia OFFLINE-FIRST:
 * - Escritas: grava em localStorage (instantâneo) + tenta Supabase (persistência cloud)
 * - Se estiver OFFLINE: enfileira a operação para sincronizar quando voltar
 * - Leituras: sempre de localStorage (rápido e offline)
 * - Realtime: quando outro dispositivo muda dados, Supabase notifica → atualiza localStorage → React re-renderiza
 * - Filial: dados filtrados por store_branch_id no Supabase
 * - Fila: operações pendentes são processadas automaticamente quando a conexão é restaurada
 */

import { supabase } from '../lib/supabase';
import { syncQueue } from './syncQueueService';
import type { RealtimeChannel } from '@supabase/supabase-js';

export type TableName =
  | 'products'
  | 'categories'
  | 'customers'
  | 'suppliers'
  | 'sales'
  | 'sale_items'
  | 'financial_transactions'
  | 'cash_sessions'
  | 'stock_movements'
  | 'store_branches'
  | 'system_users'
  | 'system_settings';

type SyncChangeCallback = (table: TableName, payload: any) => void;
type ConnectionListener = (online: boolean) => void;

class SupabaseSyncService {
  private channel: RealtimeChannel | null = null;
  private changeCallbacks: Set<SyncChangeCallback> = new Set();
  private connectionListeners: Set<ConnectionListener> = new Set();
  private _connected = false;
  private _online = navigator.onLine;
  private _syncingTables = new Set<TableName>();
  private _pendingCount = 0;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectOrgId: string | undefined;
  private _reconnectAttempts = 0;
  private static MAX_RECONNECT_ATTEMPTS = 10;
  private static RECONNECT_BASE_DELAY_MS = 2000;

  constructor() {
    // Listen for browser online/offline events
    window.addEventListener('online', () => this.handleOnlineChange(true));
    window.addEventListener('offline', () => this.handleOnlineChange(false));
  }

  // ─── CONNECTION STATE ──────────────────────────────────────────

  get connected() {
    return this._connected;
  }

  get online() {
    return this._online;
  }

  get pendingCount() {
    return this._pendingCount;
  }

  subscribeConnection(listener: ConnectionListener) {
    this.connectionListeners.add(listener);
    return () => { this.connectionListeners.delete(listener); };
  }

  private notifyConnection(online: boolean) {
    this.connectionListeners.forEach((fn) => fn(online));
  }

  private handleOnlineChange(online: boolean) {
    this._online = online;
    console.log(`[HD-Sync] 🌐 Browser ${online ? 'ONLINE' : 'OFFLINE'}`);
    this.notifyConnection(online);

    if (online) {
      // When coming back online, process pending queue
      this.processPendingQueue();
    }
  }

  // ─── REALTIME ──────────────────────────────────────────────────

  /**
   * Subscribe to real-time changes from Supabase.
   * When another device writes data, this fires callbacks.
   *
   * @param orgId Organização do usuário atual — quando informada (usuário
   *   comum), o canal filtra server-side por organization_id, evitando que
   *   payloads de OUTRAS organizações trafeguem para este cliente.
   *   Superadmin (orgId vazio) recebe de todas — o filtro client-side no
   *   App.tsx continua como defense-in-depth.
   */
  subscribeRealtime(onChange: SyncChangeCallback, orgId?: string) {
    this.changeCallbacks.add(onChange);

    if (this.channel) {
      // Already subscribed — just register the new callback
      return;
    }

    // Store orgId for auto-reconnect
    this._reconnectOrgId = orgId;
    this._reconnectAttempts = 0;
    this._doSubscribe(orgId);
  }

  /**
   * Internal: create the Realtime channel and subscribe.
   * Separated from subscribeRealtime() to allow reconnection.
   */
  private _doSubscribe(orgId?: string) {
    const tables: TableName[] = [
      'products',
      'categories',
      'customers',
      'suppliers',
      'sales',
      'sale_items',
      'financial_transactions',
      'cash_sessions',
      'stock_movements',
      'store_branches',
      'system_users',
      'system_settings',
    ];

    this.channel = supabase.channel('hd-system-realtime');

    // Subscribe to INSERT, UPDATE, DELETE on each table
    for (const table of tables) {
      this.channel.on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: table,
          // Filtro server-side: usuário comum só recebe mudanças da sua org.
          // sale_items e stock_change_log NÃO têm organization_id, então
          // o filtro é aplicado APENAS nas tabelas que possuem essa coluna.
          ...(orgId && table !== 'sale_items' ? { filter: `organization_id=eq.${orgId}` } : {}),
        },
        (payload) => {
          this._connected = true;
          this._reconnectAttempts = 0; // Reset on successful message
          this.changeCallbacks.forEach((cb) => cb(table, payload));
        }
      );
    }

    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this._connected = true;
        this._reconnectAttempts = 0;
        console.log('[HD-Sync] Realtime connected');
      } else if (status === 'CHANNEL_ERROR') {
        this._connected = false;
        console.warn('[HD-Sync] Realtime channel error — scheduling reconnect');
        this._scheduleReconnect();
      } else if (status === 'TIMED_OUT') {
        this._connected = false;
        console.warn('[HD-Sync] Realtime timed out — scheduling reconnect');
        this._scheduleReconnect();
      }
    });
  }

  /**
   * Schedule automatic reconnection with exponential backoff.
   * Prevents the device from becoming "blind" to other devices' changes
   * after a WebSocket drop (VULN-01 fix).
   */
  private _scheduleReconnect() {
    if (this._reconnectTimer) return; // Already scheduled
    if (this._reconnectAttempts >= SupabaseSyncService.MAX_RECONNECT_ATTEMPTS) {
      console.error('[HD-Sync] Max reconnect attempts reached — manual re-login may be needed');
      return;
    }
    const delay = Math.min(
      SupabaseSyncService.RECONNECT_BASE_DELAY_MS * Math.pow(2, this._reconnectAttempts),
      30000, // Cap at 30 seconds
    );
    this._reconnectAttempts++;
    console.log(`[HD-Sync] Reconnect in ${delay}ms (attempt ${this._reconnectAttempts}/${SupabaseSyncService.MAX_RECONNECT_ATTEMPTS})`);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      if (this.channel) {
        supabase.removeChannel(this.channel);
        this.channel = null;
      }
      this._doSubscribe(this._reconnectOrgId);
    }, delay);
  }

  unsubscribeRealtime(onChange: SyncChangeCallback) {
    this.changeCallbacks.delete(onChange);
    if (this.changeCallbacks.size === 0 && this.channel) {
      // Cancel any pending reconnect
      if (this._reconnectTimer) {
        clearTimeout(this._reconnectTimer);
        this._reconnectTimer = null;
      }
      supabase.removeChannel(this.channel);
      this.channel = null;
      this._connected = false;
    }
  }

  // ─── GENERIC CRUD OPERATIONS (OFFLINE-FIRST) ───────────────────

  /**
   * Try to send data to Supabase.
   * Uses only navigator.onLine — Realtime channel status is NOT required.
   * Realtime is only for RECEIVING changes from other devices, not for sending.
   * If the request fails due to network, queue for retry.
   * Returns { ok, error } so the caller can decide whether to enqueue:
   * only connection errors should be queued — permanent errors (RLS/permission)
   * would loop forever in the queue growing it unbounded (the "541 pendentes" bug).
   */
  private async tryUpsert(table: TableName, row: Record<string, any>): Promise<{ ok: boolean; error?: any }> {
    try {
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] ❌ Upsert ${table} failed:`, error.message, `(row id: ${row.id})`);
        // Log to DLQ
        try {
          await supabase.rpc('fn_insserir_dlq', {
            p_operation_type: 'upsert',
            p_table_name: table,
            p_record_id: row.id || 'unknown',
            p_payload: JSON.stringify(row).slice(0, 1000),
            p_error_message: error.message,
            p_source: 'tryUpsert',
            p_browser_id: navigator.userAgent.slice(0, 50),
          });
        } catch {}
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      console.warn(`[HD-Sync] Upsert ${table} exception:`, e);
      return { ok: false, error: e }; // Network error — queue for retry
    }
  }

  private async tryDelete(table: TableName, id: string): Promise<{ ok: boolean; error?: any }> {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.warn(`[HD-Sync] ❌ Delete ${table} failed:`, error.message, `(id: ${id})`);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      console.warn(`[HD-Sync] Delete ${table} exception:`, e);
      return { ok: false, error: e };
    }
  }

  private async tryUpsertBatch(table: TableName, rows: Record<string, any>[]): Promise<{ ok: boolean; error?: any }> {
    if (rows.length === 0) return { ok: true };
    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] ❌ Batch upsert ${table} failed:`, error.message);
        return { ok: false, error };
      }
      return { ok: true };
    } catch (e) {
      console.warn(`[HD-Sync] Batch upsert ${table} exception:`, e);
      return { ok: false, error: e };
    }
  }

  // Tables that have an 'updated_at' column — only these get the timestamp appended.
  // VULN-04 fix: added all tables that support updated_at for proper conflict resolution.
  private static TABLES_WITH_UPDATED_AT: TableName[] = [
    'products', 'categories', 'customers', 'suppliers',
    'sales', 'financial_transactions', 'cash_sessions',
    'stock_movements', 'store_branches', 'system_users', 'system_settings',
  ];

  /**
   * Upsert a single row to Supabase.
   * If browser is offline, queue the operation for later sync.
   */
  async upsertRow(table: TableName, row: Record<string, any>) {
    // Validação defensiva: se a linha tem organization_id e está vazio/nulo,
    // não envia nem enfileira — evitaria enviar dados sem org ou enfileirar lixo
    if (row && typeof row === 'object' && 'organization_id' in row) {
      const orgId = (row as any).organization_id;
      if (!orgId || orgId === '' || orgId === 'undefined' || orgId === 'null') {
        console.warn(`[HD-Sync] ⚠️ Skipping ${table} upsert — organization_id inválido (${orgId})`);
        return false;
      }
    }

    const rowWithTimestamp = SupabaseSyncService.TABLES_WITH_UPDATED_AT.includes(table)
      ? { ...row, updated_at: new Date().toISOString() }
      : row;

    if (!navigator.onLine) {
      console.log(`[HD-Sync] 📝 Queuing ${table} upsert (offline)`);
      syncQueue.enqueue(table, 'upsert', { data: rowWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    const result = await this.tryUpsert(table, rowWithTimestamp);
    if (!result.ok) {
      // Só enfileira erros de CONEXÃO. Erros permanentes (RLS/permissão,
      // org inválida) nunca vão passar com retry — enfileirar só faria a
      // fila crescer sem limite. O erro já foi logado no console + DLQ.
      if (this.isConnectionError(result.error)) {
        console.log(`[HD-Sync] 📝 Queuing ${table} upsert (network error — will retry)`);
        syncQueue.enqueue(table, 'upsert', { data: rowWithTimestamp });
        this._pendingCount = syncQueue.getPendingCount();
      }
    }
    return result.ok;
  }

  /**
   * Delete a row from Supabase.
   * If browser is offline, queue the operation for later sync.
   */
  async deleteRow(table: TableName, id: string) {
    if (!navigator.onLine) {
      console.log(`[HD-Sync] 📝 Queuing ${table} delete (offline)`);
      syncQueue.enqueue(table, 'delete', { rowId: id });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    const result = await this.tryDelete(table, id);
    if (!result.ok) {
      // Só enfileira erros de CONEXÃO (mesma regra do upsert — evita fila infinita)
      if (this.isConnectionError(result.error)) {
        console.log(`[HD-Sync] 📝 Queuing ${table} delete (network error — will retry)`);
        syncQueue.enqueue(table, 'delete', { rowId: id });
        this._pendingCount = syncQueue.getPendingCount();
      }
    }
    return result.ok;
  }

  /**
   * Batch upsert multiple rows to Supabase.
   * If browser is offline, queue the operation for later sync.
   */
  async upsertRows(table: TableName, rows: Record<string, any>[]) {
    if (rows.length === 0) return true;

    const rowsWithTimestamp = SupabaseSyncService.TABLES_WITH_UPDATED_AT.includes(table)
      ? rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }))
      : rows;

    if (!navigator.onLine) {
      console.log(`[HD-Sync] 📝 Queuing ${table} batch upsert (offline)`);
      syncQueue.enqueue(table, 'upsert_batch', { dataArray: rowsWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    const result = await this.tryUpsertBatch(table, rowsWithTimestamp);
    if (!result.ok) {
      // Só enfileira erros de CONEXÃO (mesma regra do upsert — evita fila infinita)
      if (this.isConnectionError(result.error)) {
        console.log(`[HD-Sync] 📝 Queuing ${table} batch upsert (network error — will retry)`);
        syncQueue.enqueue(table, 'upsert_batch', { dataArray: rowsWithTimestamp });
        this._pendingCount = syncQueue.getPendingCount();
      }
    }
    return result.ok;
  }

  /**
   * Fetch all rows from a table, optionally filtered by store_branch_id.
   * VULN-05 fix: uses pagination to handle large datasets without
   * exceeding Supabase response limits or browser memory.
   */
  async fetchRows(table: TableName, branchId?: string): Promise<any[]> {
    try {
      const PAGE_SIZE = 500;
      let allRows: any[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase.from(table).select('*');
        if (branchId) {
          // Filtrar APENAS pela filial especificada.
          // Antes: .or('store_branch_id.eq.X,store_branch_id.is.null') trazia
          // dados legados de OUTRAS filiais. Agora: filtro EXATO por branch.
          query = query.eq('store_branch_id', branchId);
        }
        // Order by created_at DESC only for tables that have this column
        const tablesWithCreatedAt: TableName[] = ['sales', 'stock_movements', 'customers', 'system_users'];
        if (tablesWithCreatedAt.includes(table)) {
          query = query.order('created_at', { ascending: false });
        }
        // Pagination
        query = query.range(offset, offset + PAGE_SIZE - 1);

        const { data, error } = await query;
        if (error) {
          console.warn(`[HD-Sync] Fetch ${table} failed at offset ${offset}:`, error.message);
          break;
        }
        const rows = data || [];
        allRows = allRows.concat(rows);
        if (rows.length < PAGE_SIZE) {
          hasMore = false;
        } else {
          offset += PAGE_SIZE;
        }
      }

      if (allRows.length > 0) {
        console.log(`[HD-Sync] Fetched ${allRows.length} rows from ${table} (branch: ${branchId || 'ALL'})`);
      }
      return allRows;
    } catch (e) {
      console.warn(`[HD-Sync] Fetch ${table} exception:`, e);
      return [];
    }
  }

  /**
   * Fetch rows by IDs (for targeted sync).
   */
  async fetchRowsByIds(table: TableName, ids: string[]): Promise<any[]> {
    if (ids.length === 0) return [];
    try {
      const { data, error } = await supabase.from(table).select('*').in('id', ids);
      if (error) return [];
      return data || [];
    } catch {
      return [];
    }
  }

  // ─── PENDING QUEUE PROCESSING ──────────────────────────────────

  /**
   * Process all pending operations from the offline queue.
   * Called automatically when connection is restored.
   */
  async processPendingQueue(): Promise<{ processed: number; failed: number }> {
    const count = syncQueue.getPendingCount();
    if (count === 0) return { processed: 0, failed: 0 };

    console.log(`[HD-Sync] 🔄 Processing ${count} pending operations...`);

    // First check if Supabase is actually reachable
    const connected = await this.testConnection();
    if (!connected) {
      console.warn('[HD-Sync] Cannot process queue — Supabase not reachable');
      return { processed: 0, failed: 0 };
    }

    this._connected = true;
    const result = await syncQueue.processQueue();
    this._pendingCount = syncQueue.getPendingCount();

    if (result.processed > 0) {
      console.log(`[HD-Sync] ✅ ${result.processed} operations synced successfully`);
    }
    if (result.failed > 0) {
      console.warn(`[HD-Sync] ❌ ${result.failed} operations failed permanently`);
    }

    return result;
  }

  /**
   * Get count of pending operations.
   */
  getPendingCount(): number {
    this._pendingCount = syncQueue.getPendingCount();
    return this._pendingCount;
  }

  /**
   * Retry all failed operations.
   */
  retryFailed() {
    syncQueue.retryFailed();
    this.processPendingQueue();
  }

  // ─── SYNC STATUS ───────────────────────────────────────────────

  markSyncing(table: TableName) {
    this._syncingTables.add(table);
  }
  markSynced(table: TableName) {
    this._syncingTables.delete(table);
  }
  isSyncing(table: TableName): boolean {
    return this._syncingTables.has(table);
  }

  // ─── CONNECTION TESTING ────────────────────────────────────────

  /**
   * Test connection to Supabase.
   * Uses 'products' table which is guaranteed to exist.
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('products').select('id').limit(1);
      return !error;
    } catch {
      return false;
    }
  }

  /**
   * Check if browser is online AND Supabase is reachable.
   */
  async isFullyOnline(): Promise<boolean> {
    if (!navigator.onLine) return false;
    return this.testConnection();
  }

  // ─── HELPERS ───────────────────────────────────────────────────

  /**
   * Determine if a Supabase error is a connection-related error (should be queued).
   */
  private isConnectionError(error: any): boolean {
    if (!error) return false;
    const msg = (error.message || '').toLowerCase();
    // PGRST301 (JWT expirado / não autenticado) NÃO é erro de conexão:
    // enfileirar operações com token expirado só inundaria a fila com
    // falhas permanentes — o retry nunca resolveria a autenticação.
    if (error.code === 'PGRST301' || msg.includes('jwt') || msg.includes('not authenticated')) {
      return false;
    }
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('failed to fetch') ||
      msg.includes('could not connect') ||
      msg.includes('channel')
    );
  }
}

export const syncService = new SupabaseSyncService();
