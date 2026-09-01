import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Wine, X, Clock, Package, AlertTriangle } from 'lucide-react';
import { Product, OpenContainer, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { useToast } from '../shared/Toast';
import { ConfirmDialog } from '../shared/ConfirmDialog';

interface OpenContainersModalProps {
  isOpen: boolean;
  products: Product[];
  user: UserProfile;
  canCreateEdit: boolean;
  onClose: () => void;
}

/**
 * Contêineres Abertos (garrafas fracionadas / doses disponíveis).
 *
 * Lista as garrafas abertas de produtos fragmentáveis (is_fragmentable) e as
 * doses restantes (open_containers.remaining_quantity). As baixas de doses ao
 * vender uma fração são feitas pela RPC process_single_item (server-side,
 * atômico). Esta UI permite ABRIR uma garrafa manualmente (baixa 1 do estoque
 * da garrafa mãe + cria o contêiner) e DESCARTAR/fechar um contêiner.
 */
export const OpenContainersModal: React.FC<OpenContainersModalProps> = ({
  isOpen,
  products,
  user,
  canCreateEdit,
  onClose,
}) => {
  const { success, error } = useToast();
  const [containers, setContainers] = useState<OpenContainer[]>([]);
  const [fragmentables, setFragmentables] = useState<Product[]>([]);
  const [selectedGarrafaId, setSelectedGarrafaId] = useState('');
  const [discarding, setDiscarding] = useState<OpenContainer | null>(null);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen]);

  const load = () => {
    setContainers(storageService.getOpenContainers());
    // Produtos fragmentáveis com rendimento > 0 e com garrafa em estoque
    const frags = products.filter(
      (p) => p.is_fragmentable && (p.yield_count || 0) > 0 && p.currentStock > 0
    );
    setFragmentables(frags);
    setSelectedGarrafaId((prev) => frags.some((f) => f.id === prev) ? prev : (frags[0]?.id || ''));
  };

  if (!isOpen) return null;

  const productName = (id: string) => products.find((p) => p.id === id)?.name || 'Produto removido';

  const handleOpenGarrafa = async () => {
    const garrafa = fragmentables.find((f) => f.id === selectedGarrafaId);
    if (!garrafa) {
      error('Selecione uma garrafa para abrir.');
      return;
    }
    if (!garrafa.yield_count || garrafa.yield_count <= 0) {
      error('Garrafa sem rendimento (yield_count) definido.');
      return;
    }
    if (garrafa.currentStock <= 0) {
      error(`Sem garrafas de "${garrafa.name}" em estoque.`);
      return;
    }

    // 1) Baixa 1 garrafa do estoque (mesmo fluxo do ajuste de estoque: cria
    //    movimentação server-side via ajustar_estoque + feedback local)
    await storageService.updateStock(garrafa.id, -1, 'Abertura manual de garrafa', user.name || 'Sistema');

    // 2) Cria o contêiner aberto com o rendimento total da garrafa
    const container: OpenContainer = {
      id: `oc-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      productId: garrafa.id,
      remainingQuantity: garrafa.yield_count,
      openedAt: new Date().toISOString(),
      status: 'open',
      storeBranchId: storageService.getSelectedBranchId() || undefined,
    };
    storageService.saveOpenContainer(container);

    posAudio.chime();
    success(`Garrafa "${garrafa.name}" aberta — ${garrafa.yield_count} doses disponíveis.`);
    load();
  };

  const handleDiscard = (oc: OpenContainer) => {
    storageService.deleteOpenContainer(oc.id);
    posAudio.error();
    success(`Contêiner de "${productName(oc.productId)}" descartado.`);
    setDiscarding(null);
    load();
  };

  const open = containers.filter((c) => c.status === 'open');
  const empty = containers.filter((c) => c.status !== 'open');
  const totalOpenDoses = open.reduce((s, c) => s + c.remainingQuantity, 0);

  return (
    <>
    <div
      className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl max-w-[640px] w-full max-h-[85vh] shadow-2xl overflow-hidden animate-slideUp flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-[#27272a]">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wine className="w-4 h-4 text-indigo-500" />
              Contêineres Abertos
            </h3>
            <p className="text-[10px] text-slate-400 dark:text-[#52525b] mt-0.5">
              {open.length} garrafa(s) aberta(s) · {totalOpenDoses} dose(s) restante(s)
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-[#18181b]">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Abrir garrafa manualmente */}
          {canCreateEdit && fragmentables.length > 0 && (
            <div className="p-3 rounded-xl border border-indigo-500/30 bg-indigo-50 dark:bg-indigo-950/30">
              <p className="text-xs font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-indigo-500" />
                Abrir garrafa manualmente
              </p>
              <div className="flex items-center gap-2">
                <select
                  value={selectedGarrafaId}
                  onChange={(e) => setSelectedGarrafaId(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-[#27272a] text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {fragmentables.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name} — {f.yield_count} doses · {f.currentStock} garrafa(s) em estoque
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleOpenGarrafa}
                  className="px-3.5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Abrir
                </button>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-[#52525b] mt-1.5">
                Baixa 1 garrafa do estoque e libera {fragmentables.find((f) => f.id === selectedGarrafaId)?.yield_count || '—'} doses.
              </p>
            </div>
          )}

          {/* Lista */}
          {containers.length === 0 ? (
            <div className="text-center py-8 text-slate-400 dark:text-[#52525b]">
              <Wine className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">Nenhum contêiner aberto. Abra uma garrafa para começar.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {containers.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 dark:border-[#27272a] bg-white dark:bg-slate-900"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {productName(c.productId)}
                    </p>
                    <p className="text-[10px] text-slate-400 dark:text-[#52525b] flex items-center gap-1 mt-0.5">
                      <Clock className="w-3 h-3" />
                      Aberta em {new Date(c.openedAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                      {' · '}
                      {c.status === 'open' ? 'aberta' : c.status === 'empty' ? 'esgotada' : 'descartada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {c.status === 'open' ? (
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {c.remainingQuantity} dose(s)
                      </span>
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-slate-400" />
                    )}
                    {canCreateEdit && c.status === 'open' && (
                      <button
                        onClick={() => setDiscarding(c)}
                        className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-500 transition-all"
                        title="Descartar contêiner"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      </div>

      <ConfirmDialog
        isOpen={!!discarding}
        title="Descartar contêiner?"
        message={`Descartar o contêiner aberto de "${discarding ? productName(discarding.productId) : ''}"? As doses restantes serão perdidas.`}
        confirmLabel="Descartar"
        danger
        onConfirm={() => discarding && handleDiscard(discarding)}
        onCancel={() => setDiscarding(null)}
      />
    </>
  );
};
