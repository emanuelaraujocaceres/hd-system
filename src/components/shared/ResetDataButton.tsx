import React, { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

/**
 * Botão "Resetar todos os dados" com dupla proteção:
 * 1) ConfirmDialog pedindo confirmação explícita;
 * 2) exigência de digitar a palavra "RESET" para habilitar o botão destrutivo;
 * 3) backup automático do localStorage antes de apagar (storageService).
 * 4) Apenas o administrador que clicou no botão permanece no sistema.
 */
export const ResetDataButton: React.FC = () => {
  const { addToast } = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleConfirm = () => {
    const result = storageService.resetDemoData();
    setIsConfirmOpen(false);
    if (result) {
      posAudio.chime();
      addToast('success', 'Todos os dados foram resetados. Apenas o administrador atual permanece no sistema. Um backup automático foi salvo.');
    } else {
      addToast('info', 'Nenhum dado local encontrado para resetar.');
    }
  };

  return (
    <>
      <button
        onClick={() => setIsConfirmOpen(true)}
        title="Resetar todos os dados do sistema"
        className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs lg:text-[11px] font-medium text-slate-400 dark:text-[#71717a] hover:text-rose-400 hover:bg-rose-500/10 dark:hover:text-rose-400 dark:hover:bg-rose-500/10 border border-slate-800/60 dark:border-[#27272a] transition-colors min-h-[44px]"
      >
        <RefreshCw className="w-3 h-3" />
        <span>Resetar todos os dados</span>
      </button>

      <ConfirmDialog
        isOpen={isConfirmOpen}
        title="Apagar todos os dados?"
        message="Isso apaga TODOS os produtos, vendas, clientes, fornecedores, colaboradores, administradores, financeiro, caixa e configurações. Apenas o administrador que clicou neste botão permanecerá no sistema. Um backup automático será salvo antes."
        confirmLabel="Resetar Tudo"
        danger
        typeToConfirm="RESET"
        onConfirm={handleConfirm}
        onCancel={() => setIsConfirmOpen(false)}
      />
    </>
  );
};
