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
   */
  subscribeRealtime(onChange: SyncChangeCallback) {
    this.changeCallbacks.add(onChange);

    if (this.channel) {
      // Already subscribed
      return;
    }

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
        },
        (payload) => {
          this._connected = true;
          this.changeCallbacks.forEach((cb) => cb(table, payload));
        }
      );
    }

    this.channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        this._connected = true;
        console.log('[HD-Sync] Realtime connected');
      } else if (status === 'CHANNEL_ERROR') {
        this._connected = false;
        console.warn('[HD-Sync] Realtime channel error — will retry');
      } else if (status === 'TIMED_OUT') {
        this._connected = false;
        console.warn('[HD-Sync] Realtime timed out — will retry');
      }
    });
  }

  unsubscribeRealtime(onChange: SyncChangeCallback) {
    this.changeCallbacks.delete(onChange);
    if (this.changeCallbacks.size === 0 && this.channel) {
      supabase.removeChannel(this.channel);
      this.channel = null;
      this._connected = false;
    }
  }

  // ─── GENERIC CRUD OPERATIONS (OFFLINE-FIRST) ───────────────────

  /**
   * Upsert a single row to Supabase.
   * If offline, queue the operation for later sync.
   */
  async upsertRow(table: TableName, row: Record<string, any>) {
    // Always add updated_at timestamp
    const rowWithTimestamp = { ...row, updated_at: new Date().toISOString() };

    if (!this._online || !this._connected) {
      // Offline: queue for later
      console.log(`[HD-Sync] 📝 Queuing ${table} upsert (offline)`);
      syncQueue.enqueue(table, 'upsert', { data: rowWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    try {
      const { error } = await supabase.from(table).upsert(rowWithTimestamp, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] Upsert ${table} failed:`, error.message);
        // Queue for retry if it's a connection-related error
        if (this.isConnectionError(error)) {
          syncQueue.enqueue(table, 'upsert', { data: rowWithTimestamp });
          this._pendingCount = syncQueue.getPendingCount();
        }
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Upsert ${table} exception:`, e);
      // Queue for retry
      syncQueue.enqueue(table, 'upsert', { data: rowWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }
  }

  /**
   * Delete a row from Supabase.
   * If offline, queue the operation for later sync.
   */
  async deleteRow(table: TableName, id: string) {
    if (!this._online || !this._connected) {
      // Offline: queue for later
      console.log(`[HD-Sync] 📝 Queuing ${table} delete (offline)`);
      syncQueue.enqueue(table, 'delete', { rowId: id });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.warn(`[HD-Sync] Delete ${table} failed:`, error.message);
        if (this.isConnectionError(error)) {
          syncQueue.enqueue(table, 'delete', { rowId: id });
          this._pendingCount = syncQueue.getPendingCount();
        }
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Delete ${table} exception:`, e);
      syncQueue.enqueue(table, 'delete', { rowId: id });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }
  }

  /**
   * Batch upsert multiple rows to Supabase.
   * If offline, queue the operation for later sync.
   */
  async upsertRows(table: TableName, rows: Record<string, any>[]) {
    if (rows.length === 0) return true;

    // Add updated_at to each row
    const rowsWithTimestamp = rows.map((r) => ({ ...r, updated_at: new Date().toISOString() }));

    if (!this._online || !this._connected) {
      console.log(`[HD-Sync] 📝 Queuing ${table} batch upsert (offline)`);
      syncQueue.enqueue(table, 'upsert_batch', { dataArray: rowsWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }

    try {
      const { error } = await supabase.from(table).upsert(rowsWithTimestamp, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] Batch upsert ${table} failed:`, error.message);
        if (this.isConnectionError(error)) {
          syncQueue.enqueue(table, 'upsert_batch', { dataArray: rowsWithTimestamp });
          this._pendingCount = syncQueue.getPendingCount();
        }
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Batch upsert ${table} exception:`, e);
      syncQueue.enqueue(table, 'upsert_batch', { dataArray: rowsWithTimestamp });
      this._pendingCount = syncQueue.getPendingCount();
      return false;
    }
  }

  /**
   * Fetch all rows from a table, optionally filtered by store_branch_id.
   */
  async fetchRows(table: TableName, branchId?: string): Promise<any[]> {
    try {
      let query = supabase.from(table).select('*');
      if (branchId) {
        // Fetch rows where store_branch_id matches OR is null (shared data)
        query = query.or(`store_branch_id.eq.${branchId},store_branch_id.is.null`);
      }
      const { data, error } = await query;
      if (error) {
        console.warn(`[HD-Sync] Fetch ${table} failed:`, error.message);
        return [];
      }
      return data || [];
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
   */
  async testConnection(): Promise<boolean> {
    try {
      const { error } = await supabase.from('organizations').select('id').limit(1);
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
    return (
      msg.includes('network') ||
      msg.includes('fetch') ||
      msg.includes('timeout') ||
      msg.includes('econnrefused') ||
      msg.includes('enotfound') ||
      msg.includes('failed to fetch') ||
      msg.includes('could not connect') ||
      msg.includes('channel') ||
      error.code === 'PGRST301' // Not authenticated
    );
  }
}

export const syncService = new SupabaseSyncService();
