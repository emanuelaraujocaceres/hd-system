import React, { useState } from 'react';
import { X, Plus, Edit2, Trash2, Tag, Check, AlertCircle } from 'lucide-react';
import { Category } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface CategoryManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: Category[];
}

export const CategoryManagerModal: React.FC<CategoryManagerModalProps> = ({
  isOpen,
  onClose,
  categories,
}) => {
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [editingDesc, setEditingDesc] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null);

  if (!isOpen) return null;

  const isDuplicateName = (name: string, ignoreId?: string) =>
    categories.some(
      (c) => c.name.trim().toLowerCase() === name.trim().toLowerCase() && c.id !== ignoreId
    );

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    // Dedupe: impede categoria duplicada (case-insensitive) e duplo toque no botão
    if (isDuplicateName(newCatName)) {
      posAudio.error();
      return;
    }
    if (isCreating) return;
    setIsCreating(true);

    const newCategory: Category = {
      id: `cat-${Date.now()}`,
      name: newCatName.trim(),
      description: newCatDesc.trim() || 'Categoria de produtos',
    };

    storageService.saveCategory(newCategory);
    posAudio.chime();
    setNewCatName('');
    setNewCatDesc('');
    setIsCreating(false);
  };

  const handleStartEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditingName(cat.name);
    setEditingDesc(cat.description || '');
  };

  const handleSaveEdit = (catId: string) => {
    if (!editingName.trim()) return;
    // Dedupe: impede renomear para um nome que já existe
    if (isDuplicateName(editingName, catId)) {
      posAudio.error();
      return;
    }

    const updated: Category = {
      id: catId,
      name: editingName.trim(),
      description: editingDesc.trim(),
    };

    storageService.saveCategory(updated);
    posAudio.chime();
    setEditingId(null);
  };

  const handleConfirmDeleteCategory = () => {
    const cat = confirmDeleteCat;
    if (!cat) return;
    setConfirmDeleteCat(null);
    storageService.deleteCategory(cat.id);
    posAudio.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between bg-slate-50 dark:bg-[#09090b]/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Gerenciar Categorias de Produtos
              </h3>
              <p className="text-xs text-slate-500">Adicione, edite ou remova categorias do seu catálogo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Add Category Form */}
          <form onSubmit={handleCreateCategory} className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Plus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Nova Categoria</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <input
                type="text"
                required
                placeholder="Nome da categoria (ex: Bebidas)"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <input
                type="text"
                placeholder="Descrição (opcional)"
                value={newCatDesc}
                onChange={(e) => setNewCatDesc(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <button
              type="submit"
              disabled={isCreating}
              className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isCreating ? 'Cadastrando...' : 'Cadastrar Categoria'}</span>
            </button>
          </form>

          {/* Categories List */}
          <div className="space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-[#71717a]">
              Categorias Existentes ({categories.length})
            </h4>

            {categories.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhuma categoria cadastrada.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-[#27272a] border border-slate-200 dark:border-[#27272a] rounded-xl overflow-hidden bg-white dark:bg-[#18181b]">
                {categories.map((cat) => (
                  <div key={cat.id} className="p-3 flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-[#27272a]/40 transition-colors">
                    {editingId === cat.id ? (
                      <div className="flex-1 flex flex-col sm:flex-row items-center gap-2">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          className="w-full sm:w-1/2 px-2.5 py-1 bg-slate-50 dark:bg-[#09090b] border border-indigo-500 rounded-lg font-bold"
                        />
                        <input
                          type="text"
                          value={editingDesc}
                          onChange={(e) => setEditingDesc(e.target.value)}
                          className="w-full sm:w-1/2 px-2.5 py-1 bg-slate-50 dark:bg-[#09090b] border border-slate-300 rounded-lg"
                        />
                        <button
                          onClick={() => handleSaveEdit(cat.id)}
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                          title="Salvar"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 bg-slate-200 dark:bg-slate-800 text-slate-600 rounded-lg"
                          title="Cancelar"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                            <Tag className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{cat.name}</span>
                          </p>
                          {cat.description && (
                            <p className="text-[11px] text-slate-400 dark:text-[#71717a]">{cat.description}</p>
                          )}
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleStartEdit(cat)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-lg transition-colors"
                            title="Editar Categoria"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteCat(cat)}
                            className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors"
                            title="Excluir Categoria"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 dark:bg-[#09090b]/80 border-t border-slate-200 dark:border-[#27272a] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs"
          >
            Concluir
          </button>
        </div>

        {/* Confirm: excluir categoria */}
        <ConfirmDialog
          isOpen={confirmDeleteCat !== null}
          title="Excluir categoria?"
          message="Os produtos desta categoria não serão apagados, apenas a categoria."
          itemName={confirmDeleteCat?.name}
          confirmLabel="Excluir"
          onConfirm={handleConfirmDeleteCategory}
          onCancel={() => setConfirmDeleteCat(null)}
        />
      </div>
    </div>
  );
};
