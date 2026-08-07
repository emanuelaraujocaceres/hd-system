import React from 'react';
import { ChefHat } from 'lucide-react';

/**
 * KDSView — Kitchen Display System (Fase 1 stub).
 * Exibe pedidos por status (pendente/preparando/pronto) atualizado em tempo real.
 */
export const KDSView: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/20 text-orange-500 flex items-center justify-center">
        <ChefHat className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">KDS — Kitchen Display</h3>
      <p className="text-sm text-slate-500 dark:text-[#a1a1aa] max-w-md">
        Acompanhe pedidos da cozinha/bar em tempo real. Atualize o status com um toque.
      </p>
      <p className="text-xs text-slate-400 dark:text-[#71717a]">Em desenvolvimento — Fase 1</p>
    </div>
  );
};
