/**
 * SupabaseSyncService
 * Bridge entre localStorage e Supabase para sincronização em tempo real.
 * 
 * Estratégia:
 * - Escritas: grava em localStorage (instantâneo) + Supabase (persistência cloud)
 * - Leituras: sempre de localStorage (rápido), com dados do Supabase como fonte primária na primeira carga
 * - Realtime: quando outro dispositivo muda dados, Supabase notifica → atualiza localStorage → React re-renderiza
 * - Filial: dados filtrados por store_branch_id no Supabase
 */

import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

type TableName =
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

class SupabaseSyncService {
  private channel: RealtimeChannel | null = null;
  private changeCallbacks: Set<SyncChangeCallback> = new Set();
  private _connected = false;
  private _syncingTables = new Set<TableName>();

  get connected() {
    return this._connected;
  }

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

  // ─── GENERIC CRUD OPERATIONS ────────────────────────────────────

  /**
   * Upsert a single row to Supabase.
   * id is mapped to the Supabase UUID or VARCHAR PK.
   */
  async upsertRow(table: TableName, row: Record<string, any>) {
    try {
      const { error } = await supabase.from(table).upsert(row, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] Upsert ${table} failed:`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Upsert ${table} exception:`, e);
      return false;
    }
  }

  async deleteRow(table: TableName, id: string) {
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) {
        console.warn(`[HD-Sync] Delete ${table} failed:`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Delete ${table} exception:`, e);
      return false;
    }
  }

  async upsertRows(table: TableName, rows: Record<string, any>[]) {
    if (rows.length === 0) return true;
    try {
      const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
      if (error) {
        console.warn(`[HD-Sync] Batch upsert ${table} failed:`, error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn(`[HD-Sync] Batch upsert ${table} exception:`, e);
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

  /**
   * Mark a table as being synced (for UI feedback).
   */
  markSyncing(table: TableName) {
    this._syncingTables.add(table);
  }
  markSynced(table: TableName) {
    this._syncingTables.delete(table);
  }
  isSyncing(table: TableName): boolean {
    return this._syncingTables.has(table);
  }

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
}

export const syncService = new SupabaseSyncService();
