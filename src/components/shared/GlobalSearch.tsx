import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Package, Users, DollarSign, X, ArrowRight } from 'lucide-react';
import { storageService } from '../services/storageService';
import { useDebounce } from '../hooks/useDebounce';

interface SearchResult {
  type: 'product' | 'customer' | 'sale';
  id: string;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  onSelect: () => void;
}

interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: string) => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose, onNavigate }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebounce(query, 200);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Search
  useEffect(() => {
    if (!debouncedQuery || debouncedQuery.length < 2) {
      setResults([]);
      return;
    }

    const q = debouncedQuery.toLowerCase().trim();
    const found: SearchResult[] = [];

    // Search products
    const products = storageService.getProducts();
    for (const p of products) {
      if (p.name.toLowerCase().includes(q) || p.barcode.includes(q)) {
        found.push({
          type: 'product',
          id: p.id,
          label: p.name,
          subtitle: `R$ ${p.salePrice.toFixed(2)} • Estoque: ${p.currentStock}`,
          icon: <Package className="w-4 h-4 text-indigo-500" />,
          onSelect: () => { onNavigate('inventory'); onClose(); },
        });
        if (found.length >= 8) break;
      }
    }

    // Search customers (if fewer than 6 results)
    if (found.length < 6) {
      const customers = storageService.getCustomers();
      for (const c of customers) {
        if (c.name.toLowerCase().includes(q) || (c.cpfCnpj && c.cpfCnpj.includes(q))) {
          found.push({
            type: 'customer',
            id: c.id,
            label: c.name,
            subtitle: c.cpfCnpj || '—',
            icon: <Users className="w-4 h-4 text-emerald-500" />,
            onSelect: () => { onNavigate('crm'); onClose(); },
          });
          if (found.length >= 8) break;
        }
      }
    }

    // Search sales
    if (found.length < 6) {
      const sales = storageService.getSales();
      for (const s of sales) {
        if (s.code?.toLowerCase().includes(q) || s.customerName?.toLowerCase().includes(q)) {
          found.push({
            type: 'sale',
            id: s.id,
            label: `${s.code || 'VENDA'} — ${s.customerName || 'Consumidor'}`,
            subtitle: `R$ ${s.total?.toFixed(2) || '0,00'} • ${new Date(s.date).toLocaleDateString('pt-BR')}`,
            icon: <DollarSign className="w-4 h-4 text-amber-500" />,
            onSelect: () => { onNavigate('finance'); onClose(); },
          });
          if (found.length >= 8) break;
        }
      }
    }

    setResults(found);
    setSelectedIdx(0);
  }, [debouncedQuery, onNavigate, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter' && results[selectedIdx]) {
        e.preventDefault();
        results[selectedIdx].onSelect();
      } else if (e.key === 'Escape') {
        onClose();
      }
    },
    [results, selectedIdx, onClose],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh] px-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />

      {/* Palette */}
      <div className="relative w-full max-w-lg bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl border border-slate-200 dark:border-[#27272a] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-[#27272a]">
          <Search className="w-5 h-5 text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar produtos, clientes ou vendas..."
            className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-white outline-none placeholder:text-slate-400"
          />
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-[#27272a] text-[10px] font-mono text-slate-400 border border-slate-200 dark:border-[#3f3f46]">
            ESC
          </kbd>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 sm:hidden"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-80 overflow-y-auto">
          {results.length > 0 ? (
            results.map((r, idx) => (
              <button
                key={`${r.type}-${r.id}`}
                onClick={r.onSelect}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  idx === selectedIdx
                    ? 'bg-indigo-500/10 dark:bg-indigo-500/15 border-l-2 border-indigo-500'
                    : 'hover:bg-slate-50 dark:hover:bg-[#27272a]/50 border-l-2 border-transparent'
                }`}
              >
                <div className="shrink-0 w-8 h-8 rounded-lg bg-slate-100 dark:bg-[#27272a] flex items-center justify-center">
                  {r.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{r.label}</p>
                  <p className="text-[10px] text-slate-400 dark:text-[#71717a] truncate">{r.subtitle}</p>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-[#52525b] shrink-0" />
              </button>
            ))
          ) : query.length >= 2 && debouncedQuery ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-[#52525b]">
              Nenhum resultado encontrado para "{query}"
            </div>
          ) : query.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-400 dark:text-[#52525b] space-y-1">
              <Search className="w-5 h-5 mx-auto mb-2 opacity-50" />
              <p>Digite pelo menos 2 caracteres para buscar</p>
              <p className="text-[10px] text-slate-300 dark:text-[#3f3f46]">
                Use ↑ ↓ para navegar, Enter para selecionar
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
