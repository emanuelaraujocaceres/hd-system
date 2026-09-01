/**
 * NFAddModal - Modal completo para adicionar Nota Fiscal
 * 
 * Funcionalidades:
 * - Formulário manual com todos os dados da NF
 * - Captura de foto da NF via câmera (armazena como PDF)
 * - Compartilhar via WhatsApp com campo de número
 * - Ações em conjunto (selecionar múltiplas NFs)
 */

import React, { useState, useRef, useCallback } from 'react';
import {
  X,
  Camera,
  FileText,
  Plus,
  Minus,
  Trash2,
  Save,
  Building2,
  Calendar,
  DollarSign,
  Package,
  StickyNote,
  Search,
  Upload,
  Check,
  Printer,
  Send,
  PackagePlus,
  Loader2,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Supplier, NFRecord, NFRecordItem } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { NFMultiCaptureModal } from './NFMultiCaptureModal';
import type { OcrResult } from '../../services/ocrService';
import { planInventoryImport, type PlannedInventoryItem } from '../../lib/ocr/matchProducts';
import type { Product } from '../../types';

interface NFItem {
  productName: string;
  quantity: number;
  unitPrice: number;
  /** Preço de venda (usado ao criar produto novo a partir da NF). */
  salePrice: number;
}

/** Linha do plano de importação: resultado do match + decisão do usuário. */
type ConfirmRow = PlannedInventoryItem & { forceNew: boolean };

interface NFAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  onSave: () => void;
}

export const NFAddModal: React.FC<NFAddModalProps> = ({
  isOpen,
  onClose,
  suppliers,
  onSave,
}) => {
  // Form state
  const [nfNumber, setNfNumber] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplierName, setSupplierName] = useState('');
  const [supplierCNPJ, setSupplierCNPJ] = useState('');
  const [items, setItems] = useState<NFItem[]>([
    { productName: '', quantity: 1, unitPrice: 0, salePrice: 0 },
  ]);
  // Fase de confirmação de itens no estoque (match fuzzy + ajuste de preços)
  const [phase, setPhase] = useState<'form' | 'confirm'>('form');
  const [confirmPlan, setConfirmPlan] = useState<ConfirmRow[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [totalValue, setTotalValue] = useState(0);
  const [note, setNote] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [pdfFile, setPdfFile] = useState<string | null>(null);
  // Adicionar itens da NF ao estoque automaticamente (match + criação)
  const [addToInventory, setAddToInventory] = useState(true);

  // Multi-page capture (Fase 2)
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('danfe');
  const [isCaptureOpen, setIsCaptureOpen] = useState(false);

  // WhatsApp state
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [showWhatsappModal, setShowWhatsappModal] = useState(false);

  // Bulk selection state
  const [selectedNFs, setSelectedNFs] = useState<string[]>([]);
  const [showBulkActions, setShowBulkActions] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAddItem = () => {
    setItems([...items, { productName: '', quantity: 1, unitPrice: 0, salePrice: 0 }]);
  };

  const handleRemoveItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: keyof NFItem, value: string | number) => {
    const newItems = [...items];
    if (field === 'productName') {
      newItems[index].productName = value as string;
    } else if (field === 'quantity') {
      newItems[index].quantity = Number(value) || 0;
    } else if (field === 'unitPrice') {
      newItems[index].unitPrice = Number(value) || 0;
    } else if (field === 'salePrice') {
      newItems[index].salePrice = Number(value) || 0;
    }
    setItems(newItems);
    calculateTotal(newItems);
  };

  const calculateTotal = (itemList: NFItem[]) => {
    const total = itemList.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    setTotalValue(total);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setPdfFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCaptured = useCallback((pages: string[], templateId: string, accessKey?: string, ocrResult?: OcrResult) => {
    setCapturedPages(pages);
    setSelectedTemplate(templateId);
    if (accessKey) setAccessKey(accessKey);

    // Auto-fill form from OCR results
    if (ocrResult?.parsed) {
      const parsed = ocrResult.parsed;
      if (parsed.supplier?.name) setSupplierName(parsed.supplier.name);
      if (parsed.supplier?.cnpj) setSupplierCNPJ(parsed.supplier.cnpj);
      if (parsed.documentNumber) setNfNumber(parsed.documentNumber);
      if (parsed.total) setTotalValue(parsed.total);
      if (parsed.items.length > 0) {
        const mappedItems: NFItem[] = parsed.items.map((it: NFRecordItem) => ({
          productName: it.productName,
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0,
          salePrice: it.salePrice && it.salePrice > 0 ? it.salePrice : it.unitPrice || 0,
        }));
        setItems(mappedItems);
      }
    }

    setIsCaptureOpen(false);
  }, []);

  const clearCaptured = useCallback(() => setCapturedPages([]), []);

  /** Zera o formulário + fase de confirmação (declarado antes de persistNF). */
  const resetForm = () => {
    setNfNumber('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setSupplierName('');
    setSupplierCNPJ('');
    setItems([{ productName: '', quantity: 1, unitPrice: 0, salePrice: 0 }]);
    setTotalValue(0);
    setNote('');
    setAccessKey('');
    setPdfFile(null);
    setCapturedPages([]);
    setSelectedTemplate('danfe');
    setIsCaptureOpen(false);
    setPhase('form');
    setConfirmPlan([]);
    setIsSaving(false);
  };

  /**
   * Grava os itens da NF no estoque usando o plano de confirmação:
   * - Produto existente (match exato ou fuzzy aprovado) → soma a quantidade (updateStock).
   * - Produto novo (sem match ou "criar como novo") → cria com costPrice = unitPrice,
   *   salePrice = preço de venda informado (fallback: unitPrice).
   * Cada item é isolado em try/catch: falha em um não bloqueia os demais nem a NF.
   */
  const addToInventoryFromPlan = useCallback(async () => {
    const operatorName = 'NF Scanner';
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const row = confirmPlan[i];
      const name = item.productName?.trim();
      const qty = item.quantity || 0;
      if (!name || qty <= 0 || !row) continue;

      const target = row.forceNew ? null : row.matchedProduct;
      try {
        if (target) {
          await storageService.updateStock(
            target.id,
            qty,
            `Entrada NF ${supplierName || 'Fornecedor'} - ${name}`,
            operatorName,
          );
        } else {
          const newProd: Product = {
            id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            barcode: '',
            name,
            category: 'Geral',
            unit: 'un',
            costPrice: item.unitPrice || 0,
            salePrice: item.salePrice && item.salePrice > 0 ? item.salePrice : item.unitPrice || 0,
            currentStock: qty,
            minStock: 0,
            maxStock: 0,
            imageUrl: '',
            active: true,
            updatedAt: new Date().toISOString(),
          };
          storageService.saveProduct(newProd);
        }
      } catch (e: any) {
        // Não bloqueia a NF: registra e segue (colaborador sem permissão etc.)
        console.warn(`[NF] Falha ao gravar item '${name}' no estoque:`, e?.message);
      }
    }
  }, [items, confirmPlan, supplierName]);

  /** Salva o registro da NF (dados + fotos/PDF no Storage). */
  const persistNF = useCallback(async () => {
    const nfId = `nf-${Date.now()}`;
    const allImages = [...capturedPages, ...(pdfFile ? [pdfFile] : [])];
    const nfRecord: NFRecord = {
      id: nfId,
      scanDate: issueDate,
      nfNumber,
      supplierName,
      items,
      totalValue,
      note,
      source: capturedPages.length ? 'camera' : 'manual',
      accessKey,
      documentNumber: nfNumber,
      status: 'pending',
      observation: note,
      supplierSnapshot: { name: supplierName, cnpj: supplierCNPJ },
      templateId: selectedTemplate || undefined,
      images: [],
    };

    await storageService.saveNFRecordWithImages(nfRecord, allImages);
    posAudio.chime();
    onSave();
    resetForm();
    onClose();
  }, [capturedPages, pdfFile, issueDate, nfNumber, supplierName, items, totalValue, note, accessKey, supplierCNPJ, selectedTemplate, onSave, resetForm, onClose]);

  const handleSaveNF = async () => {
    if (!nfNumber.trim()) {
      alert('Número da NF é obrigatório.');
      return;
    }

    // Com o toggle "adicionar ao estoque" ligado, passa pela fase de confirmação
    // (match exato/fuzzy + preço de venda) antes de gravar.
    if (addToInventory && items.length > 0) {
      const products = storageService.getProducts();
      const plan = planInventoryImport(items, products).map((row) => ({ ...row, forceNew: false }));
      const hasValidItems = plan.some((row) => row.item.quantity > 0);
      if (hasValidItems) {
        setConfirmPlan(plan);
        setPhase('confirm');
        return;
      }
    }

    await persistNF();
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await addToInventoryFromPlan();
      await persistNF();
    } catch (e: any) {
      console.warn('[NF] Erro ao finalizar NF:', e?.message);
      alert('Erro ao finalizar a NF. Verifique o console e tente novamente.');
    } finally {
      setIsSaving(false);
    }
  };

  /** Atualiza uma linha do plano de confirmação (escolher candidato, criar novo...). */
  const updatePlanRow = (index: number, patch: Partial<ConfirmRow>) => {
    setConfirmPlan((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const handleWhatsAppShare = (phone: string, nfIds: string[]) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = `📄 Nota Fiscal${nfIds.length > 1 ? 's' : ''}: ${nfIds.join(', ')}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  // ── FASE DE CONFIRMAÇÃO: conferir match + preços antes de gravar no estoque ──
  if (phase === 'confirm') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-xl">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">Confirmar Itens no Estoque</h2>
                <p className="text-xs text-slate-500">Confira o match e o preço de venda de cada item</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); onClose(); }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {/* Fornecedor (resumo) */}
            <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <p className="text-xs font-bold text-indigo-800 dark:text-indigo-300 truncate">
                  Fornecedor: {supplierName || '(sem nome)'} — NF #{nfNumber}
                </p>
              </div>
            </div>

            {/* Itens */}
            {confirmPlan.map((row, idx) => {
              const item = items[idx] || { productName: '', quantity: 0, unitPrice: 0, salePrice: 0 };
              const isNew = !row.matchedProduct || row.forceNew;
              const badge = isNew
                ? { label: 'Novo produto', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' }
                : row.fuzzy
                  ? { label: 'Revisar (similar)', cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' }
                  : { label: 'Encontrado', cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' };
              return (
                <div key={idx} className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white flex-1 truncate">
                      {item.productName}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Qtd + custo + preço de venda */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold text-slate-500">Qtd:</span>
                    <button
                      onClick={() => handleItemChange(idx, 'quantity', Math.max(0, (item.quantity || 0) - 1))}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-[#27272a] hover:bg-slate-300 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <input
                      type="number" min="0" step="1" value={item.quantity}
                      onChange={(e) => handleItemChange(idx, 'quantity', Math.max(0, Number(e.target.value) || 0))}
                      className="w-16 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-sm font-bold text-slate-900 dark:text-white text-center"
                    />
                    <button
                      onClick={() => handleItemChange(idx, 'quantity', (item.quantity || 0) + 1)}
                      className="w-7 h-7 rounded-lg bg-slate-200 dark:bg-[#27272a] hover:bg-slate-300 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-200 flex items-center justify-center transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] text-slate-400">
                      Custo: R$ {(item.unitPrice || 0).toFixed(2)}
                    </span>
                    <label className="flex items-center gap-1 ml-auto">
                      <span className="text-[11px] font-bold text-slate-500">Venda:</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={item.salePrice || ''}
                        placeholder={(item.unitPrice || 0).toFixed(2)}
                        onChange={(e) => handleItemChange(idx, 'salePrice', e.target.value)}
                        className="w-20 px-2 py-1 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs font-bold text-slate-900 dark:text-white text-right"
                      />
                    </label>
                  </div>

                  {/* Status do match */}
                  {isNew ? (
                    <div className="flex items-center gap-2 text-[11px]">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-slate-500">
                        Não encontrado no estoque — será criado com o preço de venda acima.
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="text-slate-600 dark:text-slate-300">
                        Somar em: <b>{row.matchedProduct?.name}</b> (estoque atual{' '}
                        {row.matchedProduct?.currentStock} {row.matchedProduct?.unit}) — preço de venda do produto
                        não será alterado.
                      </span>
                    </div>
                  )}

                  {/* Candidatos similares (match fuzzy) */}
                  {!isNew && row.candidates.length > 0 && (
                    <div className="pt-1">
                      <p className="text-[10px] font-bold text-slate-400 mb-1">Outros similares:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {row.candidates.slice(0, 4).map((c) => (
                          <button
                            key={c.id}
                            onClick={() => updatePlanRow(idx, { matchedProduct: c, forceNew: false })}
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors ${
                              row.matchedProduct?.id === c.id
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                                : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-slate-300'
                            }`}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!isNew && (
                    <button
                      onClick={() => updatePlanRow(idx, { forceNew: true })}
                      className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                    >
                      Criar como novo produto em vez disso
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-6 py-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex gap-2">
            <button
              onClick={() => { setPhase('form'); setIsSaving(false); }}
              disabled={isSaving}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
            >
              Voltar
            </button>
            <button
              onClick={handleConfirmSave}
              disabled={isSaving}
              className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Gravando...</>
              ) : (
                <><Check className="w-4 h-4" /> Confirmar e Salvar NF</>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">Adicionar Nota Fiscal</h2>
              <p className="text-xs text-slate-500">Preencha os dados ou capture via câmera</p>
            </div>
          </div>
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* NF Number and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
                <FileText className="w-3.5 h-3.5 inline mr-1" />
                Número da NF *
              </label>
              <input
                type="text"
                value={nfNumber}
                onChange={(e) => setNfNumber(e.target.value)}
                placeholder="Ex: 12345"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
                <Calendar className="w-3.5 h-3.5 inline mr-1" />
                Data de Emissão
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Access Key */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
              🔑 Chave de Acesso
            </label>
            <input
              type="text"
              value={accessKey}
              onChange={(e) => setAccessKey(e.target.value)}
              placeholder="44 dígitos da chave de acesso"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400"
            />
          </div>

          {/* Supplier */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
                <Building2 className="w-3.5 h-3.5 inline mr-1" />
                Fornecedor
              </label>
              <input
                type="text"
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                placeholder="Nome do fornecedor"
                list="suppliers-list"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
              <datalist id="suppliers-list">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
                🏢 CNPJ
              </label>
              <input
                type="text"
                value={supplierCNPJ}
                onChange={(e) => setSupplierCNPJ(e.target.value)}
                placeholder="00.000.000/0000-00"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-mono text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] text-xs">
                <Package className="w-3.5 h-3.5 inline mr-1" />
                Itens da NF
              </label>
              <button
                type="button"
                onClick={handleAddItem}
                className="text-xs text-indigo-600 dark:text-indigo-400 font-bold hover:underline flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                Adicionar Item
              </button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.map((item, index) => (
                <div key={index} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-[#09090b] rounded-xl">
                  <input
                    type="text"
                    value={item.productName}
                    onChange={(e) => handleItemChange(index, 'productName', e.target.value)}
                    placeholder="Produto"
                    className="flex-1 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400"
                  />
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                    placeholder="Qtd"
                    className="w-16 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                    placeholder="Valor"
                    className="w-20 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={item.salePrice}
                    onChange={(e) => handleItemChange(index, 'salePrice', e.target.value)}
                    placeholder="Venda"
                    className="w-20 px-2 py-1.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(index)}
                      className="p-1 text-rose-500 hover:bg-rose-500/10 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total Value */}
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                <DollarSign className="w-3.5 h-3.5 inline mr-1" />
                Valor Total
              </span>
              <span className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                R$ {totalValue.toFixed(2)}
              </span>
            </div>
          </div>

          {/* Note */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">
              <StickyNote className="w-3.5 h-3.5 inline mr-1" />
              Observações
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Observações adicionais..."
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white placeholder:text-slate-400 resize-none"
            />
          </div>

          {/* Photo/PDF Upload */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-2 text-xs">
              📄 Foto / PDF da NF
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsCaptureOpen(true)}
                className="flex-1 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
              >
                <Camera className="w-4 h-4" />
                Capturar fotos (várias páginas)
              </button>
              <label className="flex-1 py-3 px-4 bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer">
                <Upload className="w-4 h-4" />
                Enviar Arquivo
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            {pdfFile && (
              <div className="mt-2 p-2 bg-slate-50 dark:bg-[#09090b] rounded-xl flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-slate-700 dark:text-slate-300 flex-1">Arquivo anexado</span>
                <button
                  onClick={() => setPdfFile(null)}
                  className="p-1 text-rose-500 hover:bg-rose-500/10 rounded"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {capturedPages.length > 0 && (
              <div className="mt-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Fotos capturadas: {capturedPages.length}
                  </span>
                  <button
                    type="button"
                    onClick={clearCaptured}
                    className="text-[11px] text-rose-500 font-bold hover:underline"
                  >
                    Limpar
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {capturedPages.slice(0, 4).map((p, i) => (
                    <img
                      key={i}
                      src={p}
                      alt={`Página ${i + 1}`}
                      className="w-full h-16 object-cover rounded-lg border border-slate-200 dark:border-[#27272a]"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Multi-page capture modal (Fase 2) */}
          <NFMultiCaptureModal
            isOpen={isCaptureOpen}
            onClose={() => setIsCaptureOpen(false)}
            onCaptured={handleCaptured}
            initialTemplate={selectedTemplate}
          />

          {/* Add to inventory toggle */}
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 flex items-center gap-2">
            <input
              type="checkbox"
              id="addToInventory"
              checked={addToInventory}
              onChange={(e) => setAddToInventory(e.target.checked)}
              className="w-4 h-4 accent-emerald-600"
            />
            <label htmlFor="addToInventory" className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1 cursor-pointer">
              <PackagePlus className="w-3.5 h-3.5" />
              Adicionar itens ao estoque
            </label>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 ml-auto">
              cria/atualiza produtos automaticamente
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b]/50 flex gap-2">
          <button
            onClick={() => { resetForm(); onClose(); }}
            className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSaveNF}
            className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <Save className="w-4 h-4" />
            Salvar NF
          </button>
        </div>
      </div>
    </div>
  );
};

export default NFAddModal;
