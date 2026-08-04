import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Search,
  ChevronDown,
  ChevronUp,
  Package,
  Building2,
  Calendar,
  DollarSign,
  StickyNote,
  X,
} from 'lucide-react';
import { Product, Supplier } from '../../types';
import { storageService } from '../../services/storageService';

interface NFItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface NFRecord {
  id: string;
  scanDate: string;
  supplierName: string;
  items: NFItem[];
  totalValue: number;
  note: string;
}

interface NFHistoryViewProps {
  products: Product[];
  suppliers: Supplier[];
}

export const NFHistoryView: React.FC<NFHistoryViewProps> = ({ products, suppliers }) => {
  const [nfs, setNfs] = useState<NFRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load NFs (localStorage + banco via storageService)
  useEffect(() => {
    setNfs(storageService.getNFRecords());
    // Atualiza ao vivo quando outro dispositivo importa/remove uma NF
    const unsub = storageService.subscribe(() => {
      setNfs(storageService.getNFRecords());
    });
    return () => { unsub(); };
  }, []);

  // Filter NFs by search term
  const filteredNfs = useMemo(() => {
    if (!searchTerm.trim()) return nfs;
    const term = searchTerm.toLowerCase();
    return nfs.filter((nf) => {
      // Search by supplier name
      if (nf.supplierName.toLowerCase().includes(term)) return true;
      // Search by product name in items
      if (nf.items.some((item) => item.productName.toLowerCase().includes(term))) return true;
      // Search by date
      if (nf.scanDate.toLowerCase().includes(term)) return true;
      return false;
    });
  }, [nfs, searchTerm]);

  const handleDeleteNF = (id: string) => {
    storageService.deleteNFRecord(id);
    setNfs(storageService.getNFRecords());
    if (expandedId === id) setExpandedId(null);
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    } catch {
      return iso;
    }
  };

  const formatDateTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const formatCurrency = (value: number) => {
    return `R$ ${value.toFixed(2).replace('.', ',')}`;
  };

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Notas Fiscais Escaneadas
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Histórico de NFs importadas via câmera ou formulário
            </p>
          </div>
        </div>
        <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold">
          {nfs.length} NF{nfs.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar por fornecedor, produto ou data..."
          className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-sm font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* NF List */}
      {filteredNfs.length === 0 ? (
        <div className="p-12 text-center space-y-4 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-[#09090b] text-slate-400 flex items-center justify-center mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              {searchTerm ? 'Nenhum resultado encontrado' : 'Nenhuma NF escaneada ainda'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {searchTerm
                ? 'Tente buscar por outro termo.'
                : 'Escaneie uma nota fiscal pelo Scanner de Câmera para começar o histórico.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNfs.map((nf) => {
            const isExpanded = expandedId === nf.id;
            return (
              <div
                key={nf.id}
                className="rounded-2xl border border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#18181b] overflow-hidden transition-all"
              >
                {/* NF Header Row */}
                <button
                  onClick={() => toggleExpand(nf.id)}
                  className="w-full p-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-[#09090b] transition-colors text-left"
                >
                  <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {nf.supplierName}
                      </h4>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(nf.scanDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Package className="w-3 h-3" />
                        {nf.items.length} {nf.items.length === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(nf.totalValue)}
                    </span>
                    {nf.note && (
                      <div className="flex items-center gap-1 text-[10px] text-slate-400 mt-0.5">
                        <StickyNote className="w-3 h-3" />
                        <span className="truncate max-w-[100px]">Nota</span>
                      </div>
                    )}
                  </div>

                  <div className="shrink-0">
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    )}
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="px-4 pb-4 space-y-3 border-t border-slate-100 dark:border-[#27272a]">
                    {/* NF Metadata */}
                    <div className="grid grid-cols-2 gap-3 pt-3 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Fornecedor</span>
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                          <Building2 className="w-3 h-3 text-emerald-500" />
                          {nf.supplierName}
                        </p>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">Data do Scan</span>
                        <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-indigo-500" />
                          {formatDateTime(nf.scanDate)}
                        </p>
                      </div>
                      {nf.note && (
                        <div className="col-span-2">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">Observação</span>
                          <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">{nf.note}</p>
                        </div>
                      )}
                    </div>

                    {/* Items Table */}
                    <div>
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                        Itens da Nota Fiscal
                      </span>
                      <div className="mt-2 rounded-xl border border-slate-200 dark:border-[#27272a] overflow-hidden">
                        {/* Table Header */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-slate-50 dark:bg-[#09090b] text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          <div className="col-span-5">Produto</div>
                          <div className="col-span-2 text-center">Qtd</div>
                          <div className="col-span-2 text-right">Preço Un.</div>
                          <div className="col-span-3 text-right">Subtotal</div>
                        </div>
                        {/* Table Rows */}
                        {nf.items.map((item, idx) => (
                          <div
                            key={idx}
                            className="grid grid-cols-12 gap-2 px-3 py-2 text-xs border-t border-slate-100 dark:border-[#27272a] last:border-b"
                          >
                            <div className="col-span-5 font-bold text-slate-900 dark:text-white truncate">
                              {item.productName}
                            </div>
                            <div className="col-span-2 text-center text-slate-600 dark:text-slate-300">
                              {item.quantity}
                            </div>
                            <div className="col-span-2 text-right text-slate-600 dark:text-slate-300">
                              {formatCurrency(item.unitPrice)}
                            </div>
                            <div className="col-span-3 text-right font-bold text-slate-900 dark:text-white">
                              {formatCurrency(item.quantity * item.unitPrice)}
                            </div>
                          </div>
                        ))}
                        {/* Total Row */}
                        <div className="grid grid-cols-12 gap-2 px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border-t border-slate-200 dark:border-[#27272a]">
                          <div className="col-span-9 text-xs font-extrabold text-slate-700 dark:text-slate-300 uppercase">
                            Total da NF
                          </div>
                          <div className="col-span-3 text-right text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(nf.totalValue)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Delete Button */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNF(nf.id);
                        }}
                        className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors"
                      >
                        Remover NF do histórico
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
