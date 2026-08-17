import React, { useState, useEffect } from 'react';
import { X, Package, Barcode, Save, AlertCircle } from 'lucide-react';
import { Product, Category, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { productSchema } from '../../validators/schemas';

interface QuickProductModalProps {
  isOpen: boolean;
  barcode: string;
  categories: Category[];
  user: UserProfile | null;
  onClose: () => void;
  onSaved: (product: Product) => void;
}

/** Cadastro rápido de produto dentro do PDV: barcode já vem preenchido
 *  do leitor/câmera e, ao salvar, o produto entra direto no carrinho. */
export const QuickProductModal: React.FC<QuickProductModalProps> = ({
  isOpen,
  barcode,
  categories,
  user,
  onClose,
  onSaved,
}) => {
  const { addToast } = useToast();
  const [name, setName] = useState('');
  const [category, setCategory] = useState(categories[0]?.name || 'Geral');
  const [unit, setUnit] = useState<Product['unit']>('un');
  const [salePrice, setSalePrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [stock, setStock] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset ao abrir com novo barcode
  useEffect(() => {
    if (isOpen) {
      setName('');
      setCategory(categories[0]?.name || 'Geral');
      setUnit('un');
      setSalePrice('');
      setCostPrice('');
      setStock('');
      setSaving(false);
    }
  }, [isOpen, barcode, categories]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Zod validation
    const result = productSchema.safeParse({
      name,
      barcode: barcode.trim(),
      salePrice: parseFloat(salePrice.replace(',', '.')) || 0,
      costPrice: parseFloat(costPrice.replace(',', '.')) || 0,
      stockQuantity: parseInt(stock, 10) || 0,
      category,
      unit,
    });

    if (!result.success) {
      const firstError = result.error.issues[0];
      addToast('error', firstError.message);
      return;
    }

    setSaving(true);
    try {
      const newProd: Product = {
        id: crypto.randomUUID(),
        barcode: barcode.trim(),
        name: name.trim(),
        category,
        unit,
        costPrice: parseFloat(costPrice.replace(',', '.')) || 0,
        salePrice: price,
        currentStock: parseInt(stock, 10) || 0,
        minStock: 0,
        maxStock: 100,
        imageUrl:
          'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?w=300&auto=format&fit=crop&q=80',
        active: true,
        updatedAt: new Date().toISOString(),
        storeBranchId: storageService.getSelectedBranchId() || user?.storeBranchId,
      };
      storageService.saveProduct(newProd);
      posAudio.chime();
      addToast('success', `Produto "${newProd.name}" cadastrado e adicionado ao carrinho.`);
      onSaved(newProd);
    } catch (err: any) {
      posAudio.error();
      addToast('error', friendlyErrorMessage(err, 'Não foi possível cadastrar o produto. Tente novamente.'));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-[400px] w-full shadow-2xl overflow-hidden animate-slideUp"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 pb-0">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/20 border-2 border-indigo-200 dark:border-indigo-800 flex items-center justify-center shrink-0">
              <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white m-0">
                Cadastrar Novo Produto
              </h3>
              <p className="text-xs text-slate-500 dark:text-[#a1a1aa] m-0 mt-0.5">
                Não encontramos este código no estoque. Preencha os dados para vender agora.
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-4 pt-2 space-y-3">
          {/* Barcode (read-only) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
              Código de Barras
            </label>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white">
              <Barcode className="w-4 h-4 text-indigo-500 shrink-0" />
              <span className="font-mono font-bold">{barcode}</span>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
              Nome do Produto *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Cerveja Skol 350ml"
              autoFocus
              className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Category + Unit */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Categoria
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>{c.name}</option>
                ))}
                {!categories.some((c) => c.name === category) && (
                  <option value={category}>{category}</option>
                )}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Unidade
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as Product['unit'])}
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white outline-none cursor-pointer"
              >
                <option value="un">Unidade</option>
                <option value="kg">Kg</option>
                <option value="cx">Caixa</option>
                <option value="lit">Litro</option>
                <option value="m">Metro</option>
              </select>
            </div>
          </div>

          {/* Prices + Stock */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Preço Venda *
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={salePrice}
                onChange={(e) => setSalePrice(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Custo
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0,00"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1 uppercase tracking-wide">
                Estoque
              </label>
              <input
                type="number"
                min="0"
                step="1"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2.5 bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Info tip */}
          <div className="flex items-start gap-2 bg-sky-50 dark:bg-sky-900/20 border border-sky-200 dark:border-sky-500/30 rounded-xl p-2.5">
            <AlertCircle className="w-4 h-4 text-sky-500 shrink-0 mt-0.5" />
            <p className="text-[11px] text-sky-700 dark:text-sky-400 leading-relaxed">
              Após salvar, o produto entra direto no carrinho para você finalizar a venda.
              Para cadastro completo (foto, NCM, fornecedor), use a tela de Estoque.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Salvando...' : 'Salvar e Vender'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
