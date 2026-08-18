import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Package, AlertTriangle, CheckCircle, X, Calendar, DollarSign } from 'lucide-react';
import { ProductLot } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';
import { MoneyInput, parseBrlToNumber } from '../shared/MoneyInput';

interface LotManagerModalProps {
  isOpen: boolean;
  productId: string;
  productName: string;
  onClose: () => void;
}

export const LotManagerModal: React.FC<LotManagerModalProps> = ({ isOpen, productId, productName, onClose }) => {
  const { success, error } = useToast();
  const [lots, setLots] = useState<ProductLot[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newLotNumber, setNewLotNumber] = useState('');
  const [newExpirationDate, setNewExpirationDate] = useState('');
  const [newQuantity, setNewQuantity] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [editLotId, setEditLotId] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState('');

  useEffect(() => {
    if (isOpen) loadLots();
  }, [isOpen, productId]);

  const loadLots = () => {
    setLots(storageService.getProductLots(productId));
  };

  const totalActive = lots.filter(l => l.status === 'active').reduce((s, l) => s + l.quantity, 0);

  const handleAddLot = () => {
    if (!newLotNumber.trim()) { error('Informe o número do lote.'); return; }
    if (!newExpirationDate) { error('Informe a data de validade.'); return; }
    const qty = parseInt(newQuantity) || 0;
    if (qty <= 0) { error('Quantidade deve ser maior que zero.'); return; }

    const lot: ProductLot = {
      id: `lot-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      productId,
      lotNumber: newLotNumber.trim(),
      expirationDate: newExpirationDate,
      quantity: qty,
      costPrice: parseBrlToNumber(newCostPrice) || undefined,
      status: 'active',
      receivedAt: new Date().toISOString(),
      storeBranchId: storageService.getSelectedBranchId() || undefined,
    };

    storageService.saveProductLot(lot);
    posAudio.chime();
    success(`Lote "${lot.lotNumber}" criado com ${qty} un.`);
    setIsAdding(false);
    setNewLotNumber('');
    setNewExpirationDate('');
    setNewQuantity('');
    setNewCostPrice('');
    loadLots();
  };

  const handleUpdateQuantity = (lot: ProductLot) => {
    const qty = parseInt(editQuantity) || 0;
    if (qty < 0) { error('Quantidade não pode ser negativa.'); return; }
    const updated = { ...lot, quantity: qty, status: (qty === 0 ? 'disposed' : 'active') as ProductLot['status'] };
    storageService.saveProductLot(updated);
    posAudio.click();
    setEditLotId(null);
    setEditQuantity('');
    loadLots();
  };

  const handleDisposeLot = (lot: ProductLot) => {
    const updated = { ...lot, status: 'disposed' as const, quantity: 0 };
    storageService.saveProductLot(updated);
    posAudio.error();
    success(`Lote "${lot.lotNumber}" dispensado.`);
    loadLots();
  };

  const handleDeleteLot = (lot: ProductLot) => {
    storageService.deleteProductLot(lot.id);
    posAudio.error();
    success(`Lote "${lot.lotNumber}" removido.`);
    loadLots();
  };

  const getDaysUntilExpiration = (date: string) => {
    const exp = new Date(date + 'T23:59:59');
    const today = new Date();
    return Math.ceil((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const getStatusBadge = (lot: ProductLot) => {
    if (lot.status === 'disposed') return { bg: 'bg-slate-100 dark:bg-slate-800', text: 'text-slate-500', label: 'Dispensado' };
    if (lot.status === 'expired') return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'Vencido' };
    const days = getDaysUntilExpiration(lot.expirationDate);
    if (days < 0) return { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-600 dark:text-red-400', label: 'Vencido' };
    if (days <= 30) return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400', label: `${days}d` };
    if (days <= 90) return { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-600 dark:text-yellow-400', label: `${days}d` };
    return { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-600 dark:text-emerald-400', label: `${days}d` };
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-[560px] w-full max-h-[80vh] shadow-2xl overflow-hidden animate-slideUp flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#27272a]">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-500" />
              Lotes — {productName}
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-[#52525b] mt-0.5">
              {totalActive} un. em estoque · {lots.filter(l => l.status === 'active').length} lote(s) ativo(s)
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181b]">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* Add lot form */}
          {isAdding ? (
            <div className="p-4 rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/10 space-y-3">
              <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-400">Novo Lote</h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-1">Nº do Lote *</label>
                  <input value={newLotNumber} onChange={e => setNewLotNumber(e.target.value)} placeholder="LOTE-2026-001"
                    className="w-full px-3 py-2 bg-white dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-1">Validade *</label>
                  <input type="date" value={newExpirationDate} onChange={e => setNewExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-1">Quantidade *</label>
                  <input type="number" min="1" value={newQuantity} onChange={e => setNewQuantity(e.target.value)} placeholder="0"
                    className="w-full px-3 py-2 bg-white dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs outline-none" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] mb-1">Custo Unitário</label>
                  <MoneyInput value={newCostPrice} onChange={setNewCostPrice} placeholder="R$ 0,00" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={handleAddLot} className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors">
                  Salvar Lote
                </button>
                <button onClick={() => setIsAdding(false)} className="px-4 py-2 bg-slate-200 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-[#3f3f46] transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => setIsAdding(true)}
              className="w-full p-3 border-2 border-dashed border-slate-300 dark:border-[#3f3f46] rounded-xl text-xs font-bold text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-colors flex items-center justify-center gap-2">
              <Plus className="w-4 h-4" /> Adicionar Lote
            </button>
          )}

          {/* Lots list */}
          {lots.length === 0 && !isAdding && (
            <div className="text-center py-8 text-slate-400 dark:text-[#52525b]">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs">Nenhum lote cadastrado</p>
              <p className="text-[10px] mt-1">Clique em "Adicionar Lote" para começar</p>
            </div>
          )}

          {lots.map(lot => {
            const badge = getStatusBadge(lot);
            const days = getDaysUntilExpiration(lot.expirationDate);
            const isEditing = editLotId === lot.id;

            return (
              <div key={lot.id} className={`p-3 rounded-xl border transition-all ${
                lot.status === 'disposed' ? 'border-slate-200 dark:border-[#27272a] opacity-50' :
                days <= 30 ? 'border-amber-300 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/5' :
                'border-slate-200 dark:border-[#27272a] bg-white dark:bg-[#09090b]'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{lot.lotNumber}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-400 dark:text-[#52525b]">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> {lot.expirationDate ? new Date(lot.expirationDate + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}
                      </span>
                      {lot.costPrice != null && lot.costPrice > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3 h-3" /> R$ {lot.costPrice.toFixed(2)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    {isEditing ? (
                      <div className="flex items-center gap-1">
                        <input type="number" min="0" value={editQuantity} onChange={e => setEditQuantity(e.target.value)}
                          className="w-16 px-2 py-1 bg-white dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-lg text-xs text-center outline-none" autoFocus />
                        <button onClick={() => handleUpdateQuantity(lot)} className="p-1 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600">
                          <CheckCircle className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="text-lg font-black text-slate-900 dark:text-white">{lot.quantity}</span>
                        <span className="text-[10px] text-slate-400 dark:text-[#52525b]">un.</span>
                      </div>
                    )}
                  </div>
                </div>
                {lot.status === 'active' && !isEditing && (
                  <div className="flex gap-1 mt-2 pt-2 border-t border-slate-100 dark:border-[#18181b]">
                    <button onClick={() => { setEditLotId(lot.id); setEditQuantity(String(lot.quantity)); }}
                      className="flex-1 py-1 text-[10px] font-bold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-[#18181b]">
                      Editar Qtd
                    </button>
                    <button onClick={() => handleDisposeLot(lot)}
                      className="flex-1 py-1 text-[10px] font-bold text-slate-500 hover:text-amber-600 dark:hover:text-amber-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-[#18181b]">
                      Dispensar
                    </button>
                    <button onClick={() => handleDeleteLot(lot)}
                      className="py-1 px-2 text-[10px] font-bold text-slate-500 hover:text-red-600 dark:hover:text-red-400 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-[#18181b]">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]">
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-400 dark:text-[#52525b]">
              Total ativo: <strong className="text-slate-700 dark:text-white">{totalActive} un.</strong>
            </span>
            <button onClick={onClose} className="px-4 py-2 bg-slate-200 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 text-xs font-bold rounded-xl hover:bg-slate-300 dark:hover:bg-[#3f3f46] transition-colors">
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
