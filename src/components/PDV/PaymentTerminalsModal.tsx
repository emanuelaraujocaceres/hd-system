import React, { useEffect, useState } from 'react';
import {
  X,
  Settings,
  Star,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Check,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { PaymentTerminal, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { useEscapeKey } from '../../hooks/useKeyboardShortcuts';

interface PaymentTerminalsModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
}

/**
 * Cadastro de maquininhas/terminais de pagamento, acessível a partir do PDV.
 * Lista APENAS os terminais do usuário logado na filial atual
 * (isolamento por usuário + filial — cada colaborador cadastra SUA maquininha).
 * O `handle` (InfinitePay) é sempre mascarado e nunca é reexibido após salvo.
 */
export const PaymentTerminalsModal: React.FC<PaymentTerminalsModalProps> = ({
  isOpen,
  onClose,
  user,
}) => {
  const branchId = storageService.getSelectedBranchId();
  const [list, setList] = useState<PaymentTerminal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing state
  const [editing, setEditing] = useState<PaymentTerminal | 'new' | null>(null);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [showHandle, setShowHandle] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEscapeKey(onClose, isOpen);

  const refresh = () => {
    const mine = storageService
      .getPaymentTerminals(branchId)
      .filter((t) => t.userId === user.id);
    setList(mine);
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setEditing(null);
      setConfirmDeleteId(null);
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const myDefault = list.find((t) => t.isDefault);

  const startNew = () => {
    setEditing('new');
    setName('');
    setHandle('');
    setEnabled(true);
    setShowHandle(false);
    setError(null);
  };

  const startEdit = (t: PaymentTerminal) => {
    setEditing(t);
    setName(t.name);
    setHandle('');
    setEnabled(t.enabled);
    setShowHandle(false);
    setError(null);
  };

  const cancelEdit = () => {
    setEditing(null);
    setError(null);
  };

  const persistDefault = (targetId: string) => {
    // Marca o alvo como padrão e desmarca os demais do mesmo user+branch+provider.
    const orgId = storageService.getCurrentOrgId();
    list.forEach((t) => {
      const next = {
        ...t,
        organizationId: orgId,
        isDefault: t.id === targetId,
      };
      storageService.savePaymentTerminal(next);
    });
  };

  const handleSave = () => {
    const trimmedName = name.trim();
    setError(null);
    if (!trimmedName) {
      setError('Informe um nome para a maquininha.');
      return;
    }

    if (editing === 'new') {
      const trimmedHandle = handle.trim();
      if (!trimmedHandle) {
        setError('Informe a chave/handle da maquininha (ex.: seu @InfiniteTag).');
        return;
      }
      // Se ainda não há nenhum terminal deste usuário+filial, o primeiro vira padrão.
      const isFirst = list.length === 0;
      const terminal: PaymentTerminal = {
        id: crypto.randomUUID(),
        organizationId: storageService.getCurrentOrgId(),
        storeBranchId: branchId,
        userId: user.id,
        provider: 'infinitepay',
        name: trimmedName,
        config: { handle: trimmedHandle },
        isDefault: isFirst,
        enabled,
      };
      storageService.savePaymentTerminal(terminal);
    } else if (editing) {
      // Edição: preserva o handle antigo se o campo ficar em branco (mascarado).
      const nextConfig =
        handle.trim() !== ''
          ? { ...editing.config, handle: handle.trim() }
          : editing.config;
      const terminal: PaymentTerminal = {
        ...editing,
        name: trimmedName,
        config: nextConfig,
        enabled,
      };
      storageService.savePaymentTerminal(terminal);
    }

    refresh();
    cancelEdit();
  };

  const handleDelete = () => {
    if (!confirmDeleteId) return;
    storageService.deletePaymentTerminal(confirmDeleteId);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleSetDefault = (id: string) => {
    persistDefault(id);
    refresh();
  };

  const handleEnabled = () => {
    if (!editing || editing === 'new') return;
    setEnabled((v) => !v);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#18181b] shadow-2xl border border-slate-200 dark:border-[#27272a]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-[#27272a]">
          <div className="flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Settings className="w-5 h-5" />
            </span>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                ⚙️ Maquininhas
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
                Suas maquininhas nesta filial (operação via InfinitePay)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form (add/edit) */}
          {editing !== null && (
            <div className="rounded-xl border border-slate-200 dark:border-[#27272a] p-4 space-y-3 bg-slate-50 dark:bg-[#212124]">
              <p className="text-xs font-extrabold text-slate-700 dark:text-slate-300">
                {editing === 'new' ? 'Adicionar Maquininha' : 'Editar Maquininha'}
              </p>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1">
                  Nome*
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Maquininha do Caixa 1"
                  className="w-full px-3 py-2 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#3f3f46] rounded-xl text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1">
                  Chave/Handle (InfinitePay)*
                </label>
                <div className="relative">
                  <input
                    type={showHandle ? 'text' : 'password'}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder={editing === 'new' ? 'Ex.: seuinfinite' : '•••••••• (deixe em branco para manter)'}
                    autoComplete="new-password"
                    className="w-full px-3 py-2 pr-10 bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#3f3f46] rounded-xl text-sm text-slate-900 dark:text-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowHandle((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label={showHandle ? 'Ocultar handle' : 'Mostrar handle'}
                  >
                    {showHandle ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {editing !== 'new' && (
                  <p className="mt-1 text-[10px] text-slate-400 dark:text-[#71717a]">
                    A chave fica mascarada. Preencha apenas se quiser trocar.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-500 dark:text-[#a1a1aa] mb-1">
                  Ativa
                </label>
                <button
                  type="button"
                  onClick={handleEnabled}
                  className={`w-full px-3 py-2 rounded-xl border text-xs font-bold transition-colors min-h-[44px] ${
                    enabled
                      ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-700 dark:text-emerald-400'
                      : 'bg-slate-100 dark:bg-[#18181b] border-slate-300 dark:border-[#3f3f46] text-slate-500'
                  }`}
                >
                  {enabled ? '✓ Ativa' : 'Inativa'}
                </button>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="min-h-[44px] px-4 flex-1 rounded-xl border border-slate-300 dark:border-[#3f3f46] text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#27272a] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={loading}
                  className="min-h-[44px] px-4 flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Salvar
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!editing && list.length === 0 && (
            <div className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-[#3f3f46] text-center">
              <p className="text-xs font-bold text-slate-600 dark:text-slate-300">
                Nenhuma maquininha cadastrada
              </p>
              <p className="mt-1 text-[11px] text-slate-400 dark:text-[#71717a]">
                Cadastre sua primeira maquininha para receber PIX/cartão no PDV.
              </p>
            </div>
          )}

          {/* List */}
          {!editing && list.length > 0 && (
            <div className="space-y-2">
              {list.map((t) => {
                const isDefault = t.isDefault;
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${
                      isDefault
                        ? 'border-indigo-500/50 bg-indigo-500/5'
                        : 'border-slate-200 dark:border-[#27272a] bg-slate-50 dark:bg-[#212124]'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-extrabold truncate ${
                            isDefault
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {t.name}
                        </span>
                        {isDefault && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-extrabold px-1.5 py-0.5 rounded-md bg-indigo-600 text-white">
                            <Star className="w-3 h-3" />
                            Padrão
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-[#27272a] text-slate-600 dark:text-slate-300">
                          <ShieldCheck className="w-3 h-3" />
                          InfinitePay
                        </span>
                        <span
                          className={`text-[10px] font-semibold ${
                            t.enabled
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {t.enabled ? 'Ativa' : 'Inativa'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {!isDefault && (
                        <button
                          type="button"
                          onClick={() => handleSetDefault(t.id)}
                          title="Definir como padrão"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                        >
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      {confirmDeleteId === t.id ? (
                        <button
                          type="button"
                          onClick={handleDelete}
                          className="min-h-[44px] px-3 rounded-xl bg-rose-600 text-white text-[10px] font-bold transition-colors"
                        >
                          Confirmar?
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(t.id)}
                          title="Excluir"
                          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(t)}
                        title="Editar"
                        className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add button */}
          {!editing && (
            <button
              type="button"
              onClick={startNew}
              className="w-full min-h-[44px] rounded-xl border-2 border-dashed border-slate-300 dark:border-[#3f3f46] text-slate-500 dark:text-[#a1a1aa] text-xs font-bold hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Adicionar Maquininha
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentTerminalsModal;
