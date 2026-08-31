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
  Plus,
  Camera,
  Printer,
  Send,
  Trash2,
} from 'lucide-react';
import { Product, Supplier, NFRecord as StoredNFRecord } from '../../types';
import { storageService } from '../../services/storageService';

import { NFAddModal } from './NFAddModal';

interface NFItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

interface NFRecord extends StoredNFRecord {
  supplierCNPJ?: string;
  accessKey?: string;
  pdfFile?: string | null;
}

interface NFHistoryViewProps {
  products: Product[];
  suppliers: Supplier[];
}

export const NFHistoryView: React.FC<NFHistoryViewProps> = ({ products, suppliers }) => {
  const [nfs, setNfs] = useState<NFRecord[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedNFs, setSelectedNFs] = useState<string[]>([]);
  const [showBulkWhatsapp, setShowBulkWhatsapp] = useState(false);
  const [bulkWhatsappNumber, setBulkWhatsappNumber] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showWhatsappModal, setShowWhatsappModal] = useState<string | null>(null);

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
    setSelectedNFs(prev => prev.filter(nfId => nfId !== id));
  };

  // Bulk selection handlers
  const handleToggleSelect = (id: string) => {
    setSelectedNFs(prev =>
      prev.includes(id) ? prev.filter(nfId => nfId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedNFs.length === filteredNfs.length) {
      setSelectedNFs([]);
    } else {
      setSelectedNFs(filteredNfs.map(nf => nf.id));
    }
  };

  const handleBulkDelete = () => {
    if (!confirm(`Excluir ${selectedNFs.length} nota(s) fiscal(is)?`)) return;
    selectedNFs.forEach(id => storageService.deleteNFRecord(id));
    setNfs(storageService.getNFRecords());
    setSelectedNFs([]);
  };

  const handleBulkWhatsApp = () => {
    if (!bulkWhatsappNumber.trim()) {
      alert('Digite o número do WhatsApp.');
      return;
    }
    const cleanPhone = bulkWhatsappNumber.replace(/\D/g, '');
    const nfNumbers = nfs.filter(nf => selectedNFs.includes(nf.id)).map(nf => nf.nfNumber).join(', ');
    const message = `📄 Notas Fiscais: ${nfNumbers}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
    setShowBulkWhatsapp(false);
    setBulkWhatsappNumber('');
  };

  const handleShareWhatsApp = (phone: string, nfIds: string[]) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const nfNumbers = nfs.filter(nf => nfIds.includes(nf.id)).map(nf => nf.nfNumber).join(', ');
    const message = `📄 Notas Fiscais: ${nfNumbers}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
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

  const closeAddModal = () => {
    setIsAddModalOpen(false);
  };

  // ── PDF Generation ──
  const generatePDF = (nf: NFRecord): void => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>NF - ${nf.supplierName}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
          h1 { font-size: 20px; border-bottom: 2px solid #333; padding-bottom: 10px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
          .info { margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .total { font-size: 18px; font-weight: bold; text-align: right; }
          .note { margin-top: 20px; padding: 10px; background: #f9f9f9; border-radius: 4px; }
        </style>
      </head>
      <body>
        <h1>Nota Fiscal</h1>
        <div class="header">
          <div class="info"><strong>Fornecedor:</strong> ${nf.supplierName}</div>
          <div class="info"><strong>Data:</strong> ${formatDate(nf.scanDate)}</div>
        </div>
        <table>
          <thead>
            <tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Total</th></tr>
          </thead>
          <tbody>
            ${nf.items.map((item) => `
              <tr>
                <td>${item.productName}</td>
                <td>${item.quantity}</td>
                <td>R$ ${item.unitPrice.toFixed(2)}</td>
                <td>R$ ${(item.quantity * item.unitPrice).toFixed(2)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="total">Total: R$ ${nf.totalValue.toFixed(2)}</div>
        ${nf.note ? `<div class="note"><strong>Obs:</strong> ${nf.note}</div>` : ''}
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  // ── WhatsApp Share ──
  const shareViaWhatsApp = (nf: NFRecord, phoneNumber: string) => {
    const message = encodeURIComponent(
      `📄 Nota Fiscal\n` +
      `Fornecedor: ${nf.supplierName}\n` +
      `Data: ${formatDate(nf.scanDate)}\n` +
      `Itens: ${nf.items.length}\n` +
      `Total: R$ ${nf.totalValue.toFixed(2)}`
    );
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    window.open(`https://wa.me/${cleanNumber}?text=${message}`, '_blank');
  };

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
              Notas Fiscais de Compra
            </h2>
            <p className="text-xs text-slate-500 dark:text-[#71717a]">
              Histórico de NFs importadas via câmera ou formulário
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Adicionar NF
          </button>
          {selectedNFs.length > 0 && (
            <button
              onClick={() => setShowBulkWhatsapp(true)}
              className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center gap-2 transition-colors"
            >
              <Send className="w-4 h-4" />
              Enviar ({selectedNFs.length})
            </button>
          )}
          <span className="px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-extrabold">
            {nfs.length} NF{nfs.length !== 1 ? 's' : ''}
          </span>
        </div>
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
                <div className="flex items-center gap-2 p-4">
                  <input
                    type="checkbox"
                    checked={selectedNFs.includes(nf.id)}
                    onChange={() => handleToggleSelect(nf.id)}
                    className="w-4 h-4 rounded accent-emerald-500"
                  />
                  <button
                    onClick={() => toggleExpand(nf.id)}
                    className="flex-1 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-[#09090b] transition-colors text-left rounded-xl p-2"
                  >
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                          {nf.nfNumber ? `#${nf.nfNumber}` : nf.supplierName}
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
                      <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                        R$ {nf.totalValue.toFixed(2)}
                      </p>
                      <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>
                </div>

                {/* Expanded Content */}

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

      {/* NF Add Modal */}
      <NFAddModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        suppliers={suppliers}
        onSave={() => setNfs(storageService.getNFRecords())}
      />

      {/* Bulk WhatsApp Modal */}
      {showBulkWhatsapp && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Enviar {selectedNFs.length} NF(s) via WhatsApp
              </h3>
              <button
                onClick={() => setShowBulkWhatsapp(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
                Número do WhatsApp
              </label>
              <input
                type="tel"
                value={bulkWhatsappNumber}
                onChange={(e) => setBulkWhatsappNumber(e.target.value)}
                placeholder="(11) 99999-9999"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBulkWhatsapp(false)}
                className="flex-1 py-2 rounded-xl bg-slate-100 dark:bg-[#27272a] text-slate-700 dark:text-slate-300 font-bold text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleBulkWhatsApp}
                className="flex-1 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" />
                Enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
