import React from 'react';
import { ClipboardList } from 'lucide-react';

/**
 * ComandaView — Comandas/Mesas (Fase 1 stub).
 * Pedidos originados do Cardápio Digital agrupados por mesa.
 */
export const ComandaView: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-12 text-center space-y-4">
      <div className="w-16 h-16 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 flex items-center justify-center">
        <ClipboardList className="w-8 h-8" />
      </div>
      <h3 className="text-lg font-bold text-slate-900 dark:text-white">Comandas / Mesas</h3>
      <p className="text-sm text-slate-500 dark:text-[#a1a1aa] max-w-md">
        Gerencie comandas abertas por mesa. Pedidos do cardápio digital aparecem aqui em tempo real.
      </p>
      <p className="text-xs text-slate-400 dark:text-[#71717a]">Em desenvolvimento — Fase 1</p>
    </div>
  );
};
