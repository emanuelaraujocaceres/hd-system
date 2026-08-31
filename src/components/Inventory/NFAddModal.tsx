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
} from 'lucide-react';
import { Supplier, NFRecord, NFRecordItem } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { NFMultiCaptureModal } from './NFMultiCaptureModal';
import type { OcrResult } from '../../services/ocrService';
import type { Product } from '../../types';

interface NFItem {
  productName: string;
  quantity: number;
  unitPrice: number;
}

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
    { productName: '', quantity: 1, unitPrice: 0 },
  ]);
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
    setItems([...items, { productName: '', quantity: 1, unitPrice: 0 }]);
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
        }));
        setItems(mappedItems);
      }
    }

    setIsCaptureOpen(false);
  }, []);

  const clearCaptured = useCallback(() => setCapturedPages([]), []);

  /**
   * Adiciona itens da NF ao estoque:
   * - Faz match por nome (normalizado) contra produtos existentes
   * - Produto existente → soma a quantidade (updateStock)
   * - Produto novo → cria com costPrice = unitPrice do item e salva
   */
  const addItemsToInventory = useCallback(async (itemsToAdd: NFItem[]) => {
    const existing = storageService.getProducts();
    const norm = (s: string) => (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const operatorName = 'NF Scanner';

    for (const item of itemsToAdd) {
      const name = item.productName?.trim();
      if (!name || item.quantity <= 0) continue;

      // Match por nome normalizado
      const match = existing.find((p: Product) => norm(p.name) === norm(name));
      if (match) {
        await storageService.updateStock(match.id, item.quantity, 'Entrada via NF', operatorName);
      } else {
        // Cria produto novo (sem barcode, sem categoria específica)
        const newProd: Product = {
          id: `prod-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          barcode: '',
          name,
          category: 'Geral',
          unit: 'un',
          costPrice: item.unitPrice || 0,
          salePrice: item.unitPrice || 0,
          currentStock: item.quantity,
          minStock: 0,
          maxStock: 0,
          imageUrl: '',
          active: true,
          updatedAt: new Date().toISOString(),
        };
        storageService.saveProduct(newProd);
      }
    }
  }, []);

  const handleSaveNF = async () => {
    if (!nfNumber.trim()) {
      alert('Número da NF é obrigatório.');
      return;
    }

    // Adicionar itens ao estoque antes de salvar o registro da NF
    if (addToInventory && items.length > 0) {
      try {
        await addItemsToInventory(items);
      } catch (e: any) {
        console.warn('[NF] Erro ao adicionar itens ao estoque:', e?.message);
      }
    }

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

    // Faz upload das fotos capturadas + arquivo anexado para o Storage; grava os paths em images.
    await storageService.saveNFRecordWithImages(nfRecord, allImages);
    posAudio.chime();
    onSave();
    resetForm();
    onClose();
  };

  const resetForm = () => {
    setNfNumber('');
    setIssueDate(new Date().toISOString().split('T')[0]);
    setSupplierName('');
    setSupplierCNPJ('');
    setItems([{ productName: '', quantity: 1, unitPrice: 0 }]);
    setTotalValue(0);
    setNote('');
    setAccessKey('');
    setPdfFile(null);
    setCapturedPages([]);
    setSelectedTemplate('danfe');
    setIsCaptureOpen(false);
  };

  const handleWhatsAppShare = (phone: string, nfIds: string[]) => {
    const cleanPhone = phone.replace(/\D/g, '');
    const message = `📄 Nota Fiscal${nfIds.length > 1 ? 's' : ''}: ${nfIds.join(', ')}`;
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

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
