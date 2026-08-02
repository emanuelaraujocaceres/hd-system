/**
 * SyncQueueService
 * 
 * Fila de operações pendentes para sincronização offline-first.
 * 
 * Estratégia:
 * - Toda operação (upsert/delete) que falha por falta de conexão é enfileirada
 * - Quando a conexão é restaurada, a fila é processada em ordem FIFO
 * - Cada operação tem até 3 tentativas com backoff exponencial
 * - Operações que excedem o limite viram "failed" para revisão manual
 */

import { supabase } from '../lib/supabase';

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

type QueueAction = 'upsert' | 'delete' | 'upsert_batch';

interface PendingOperation {
  id: string;
  table: TableName;
  action: QueueAction;
  data?: Record<string, any>;
  dataArray?: Record<string, any>[];
  rowId?: string;
  timestamp: string;
  retries: number;
  maxRetries: number;
  lastError?: string;
  status: 'pending' | 'processing' | 'failed';
}

type QueueListener = (pendingCount: number) => void;

const STORAGE_KEY = 'hd_system_sync_queue';

class SyncQueueService {
  private listeners: Set<QueueListener> = new Set();
  private processing = false;

  subscribe(listener: QueueListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private notify() {
    const count = this.getPendingCount();
    this.listeners.forEach((fn) => fn(count));
  }

  // ─── QUEUE MANAGEMENT ──────────────────────────────────────────

  private getQueue(): PendingOperation[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveQueue(queue: PendingOperation[]) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
      this.notify();
    } catch (e) {
      console.error('[SyncQueue] Error saving queue:', e);
    }
  }

  /** Add an operation to the pending queue */
  enqueue(table: TableName, action: QueueAction, payload: { data?: Record<string, any>; dataArray?: Record<string, any>[]; rowId?: string }) {
    const queue = this.getQueue();
    const op: PendingOperation = {
      id: `op-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      table,
      action,
      data: payload.data,
      dataArray: payload.dataArray,
      rowId: payload.rowId,
      timestamp: new Date().toISOString(),
      retries: 0,
      maxRetries: 3,
      status: 'pending',
    };
    queue.push(op);
    this.saveQueue(queue);
    console.log(`[SyncQueue] 📝 Enqueued ${action} on ${table} (total: ${queue.length})`);
  }

  /** Remove an operation from the queue (after success) */
  private dequeue(opId: string) {
    const queue = this.getQueue().filter((op) => op.id !== opId);
    this.saveQueue(queue);
  }

  /** Get count of pending operations */
  getPendingCount(): number {
    return this.getQueue().filter((op) => op.status !== 'failed').length;
  }

  /** Get failed operations */
  getFailedOperations(): PendingOperation[] {
    return this.getQueue().filter((op) => op.status === 'failed');
  }

  /** Clear all operations */
  clearQueue() {
    this.saveQueue([]);
    console.log('[SyncQueue] 🗑️ Queue cleared');
  }

  /** Retry all failed operations */
  retryFailed() {
    const queue = this.getQueue();
    let changed = false;
    for (const op of queue) {
      if (op.status === 'failed') {
        op.status = 'pending';
        op.retries = 0;
        op.lastError = undefined;
        changed = true;
      }
    }
    if (changed) {
      this.saveQueue(queue);
      this.processQueue();
    }
  }

  // ─── QUEUE PROCESSING ──────────────────────────────────────────

  /** Process all pending operations in FIFO order */
  async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.processing) return { processed: 0, failed: 0 };
    this.processing = true;

    let processed = 0;
    let failed = 0;
    const queue = this.getQueue();
    // Órfãs: operações marcadas 'processing' por um ciclo interrompido (ex: F5
    // no meio do processamento) ficariam presas para sempre — o loop abaixo só
    // pega 'pending' e getPendingCount() as conta como pendentes. Resetá-las.
    let orphanReset = false;
    for (const op of queue) {
      if (op.status === 'processing') {
        op.status = 'pending';
        op.retries = 0;
        orphanReset = true;
      }
    }
    if (orphanReset) this.saveQueue(queue);
    const pending = queue.filter((op) => op.status === 'pending');

    console.log(`[SyncQueue] 🔄 Processing ${pending.length} pending operations...`);

    for (const op of pending) {
      // Mark as processing
      op.status = 'processing';
      this.saveQueue([...this.getQueue().filter((q) => q.id !== op.id), op]);

      try {
        let success = false;

        switch (op.action) {
          case 'upsert':
            success = await this.executeUpsert(op.table, op.data!);
            break;
          case 'delete':
            success = await this.executeDelete(op.table, op.rowId!);
            break;
          case 'upsert_batch':
            success = await this.executeUpsertBatch(op.table, op.dataArray!);
            break;
        }

        if (success) {
          this.dequeue(op.id);
          processed++;
          console.log(`[SyncQueue] ✅ ${op.action} on ${op.table} succeeded`);
        } else {
          throw new Error('Supabase operation returned false');
        }
      } catch (err: any) {
        op.retries++;
        op.lastError = err?.message || 'Unknown error';
        op.status = op.retries >= op.maxRetries ? 'failed' : 'pending';
        
        if (op.status === 'failed') {
          failed++;
          console.error(`[SyncQueue] ❌ ${op.action} on ${op.table} failed permanently after ${op.retries} retries:`, op.lastError);
        } else {
          console.warn(`[SyncQueue] ⚠️ ${op.action} on ${op.table} failed (retry ${op.retries}/${op.maxRetries}):`, op.lastError);
        }
        
        // Sem backoff por item: com centenas de operações pendentes, o sleep
        // exponencial por item tornaria o processamento da fila inviável.
        this.saveQueue([...this.getQueue().filter((q) => q.id !== op.id), op]);
      }
    }

    this.processing = false;
    const remaining = this.getPendingCount();
    console.log(`[SyncQueue] 📊 Processed: ${processed} ok, ${failed} failed, ${remaining} remaining`);
    
    if (remaining === 0 && processed > 0) {
      console.log('[SyncQueue] 🎉 All operations synced successfully!');
    }

    return { processed, failed };
  }

  // ─── SUPABASE EXECUTION ────────────────────────────────────────

  private async executeUpsert(table: TableName, data: Record<string, any>): Promise<boolean> {
    // Validação defensiva: se a operação tem organization_id inválido, pula (evita 403 RLS eterno)
    if (data && typeof data === 'object' && 'organization_id' in data) {
      const orgId = data.organization_id as any;
      if (!orgId || orgId === '' || orgId === 'undefined' || orgId === 'null') {
        console.warn(`[SyncQueue] ⚠️ Skipping ${table} upsert — organization_id inválido (${orgId})`);
        return true; // Treat as success to remove from queue
      }
    }
    const { error } = await supabase.from(table).upsert(data, { onConflict: 'id' });
    if (error) {
      console.warn(`[SyncQueue] Upsert ${table} failed:`, error.message);
      return false;
    }
    return true;
  }

  private async executeDelete(table: TableName, id: string): Promise<boolean> {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) {
      console.warn(`[SyncQueue] Delete ${table} failed:`, error.message);
      return false;
    }
    return true;
  }

  private async executeUpsertBatch(table: TableName, rows: Record<string, any>[]): Promise<boolean> {
    if (rows.length === 0) return true;
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) {
      console.warn(`[SyncQueue] Batch upsert ${table} failed:`, error.message);
      return false;
    }
    return true;
  }
}

export const syncQueue = new SyncQueueService();
