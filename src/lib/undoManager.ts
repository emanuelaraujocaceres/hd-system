type UndoAction = {
  type: string;
  description: string;
  undo: () => void;
  timestamp: number;
};

const MAX_UNDO = 20;

/**
 * Simple undo stack for destructive actions.
 * Each action registers an undo callback that can be invoked
 * to revert the operation.
 */
class UndoManager {
  private stack: UndoAction[] = [];
  private listeners: Array<() => void> = [];

  push(action: UndoAction): void {
    this.stack.push(action);
    if (this.stack.length > MAX_UNDO) {
      this.stack.shift();
    }
    this.notify();
  }

  pop(): UndoAction | null {
    const action = this.stack.pop() || null;
    this.notify();
    return action;
  }

  /** Executa a última ação desfeita (pop + callback) */
  undo(): boolean {
    const action = this.stack.pop();
    if (!action) return false;
    try {
      action.undo();
    } catch (err) {
      console.warn('[UndoManager] Falha ao desfazer ação:', err);
    }
    this.notify();
    return true;
  }

  peek(): UndoAction | null {
    return this.stack[this.stack.length - 1] || null;
  }

  get count(): number {
    return this.stack.length;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l());
  }
}

export const undoManager = new UndoManager();
