import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

/**
 * Botão "Resetar Dados Demo" com dupla proteção:
 * 1) ConfirmDialog pedindo confirmação explícita;
 * 2) exigência de digitar a palavra "RESET" para habilitar o botão destrutivo;
 * 3) backup automático do localStorage antes de apagar (storageService).
 */
export const ResetDataButton: React.FC = () => {
  const { addToast } = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirm = () => {
    const result = storageService.resetDemoData();
    setIsConfirmOpen(false);
    if (result) {
      posAudio.chime();
      addToast('success', 'Dados de demonstração restaurados. Um backup automático foi salvo.');
    } else {
      addToast('info', 'Nenhum dado local encontrado para resetar.');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsConfirmOpen(true)}
        title="Restaurar dados iniciais de demonstração"
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs lg:text-[11px] font-medium text-slate-400 dark:text-[#71717a] hover:text-rose-400 hover:bg-rose-500/10 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 border border-slate-800/60 dark:border-[#27272a] transition-colors min-h-[44px]"
      >
        <RefreshCw className="w-3 h-3" />
        <span>Resetar Dados Demo</span>
      </button>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Apagar todos os dados?"
        message="Isso restaura o sistema para a demonstração inicial e apaga produtos, vendas, caixa, financeiro, clientes e configurações. Um backup automático será salvo antes."
        confirmLabel="Apagar Tudo"
        danger
        typeToConfirm="RESET"
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
};
