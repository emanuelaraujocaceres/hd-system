/**
 * EmptyState - Componente para estados vazios
 * 
 * Mostra uma mensagem amigável quando não há dados
 */

import React from 'react';
import { Package, ShoppingCart, Search, ClipboardList, Users } from 'lucide-react';

interface EmptyStateProps {
  type: 'cart' | 'search' | 'orders' | 'products' | 'customers' | 'custom';
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  icon?: React.ReactNode;
}

const ICONS = {
  cart: ShoppingCart,
  search: Search,
  orders: ClipboardList,
  products: Package,
  customers: Users,
};

export const EmptyState: React.FC<EmptyStateProps> = ({ type, title, description, action, icon }) => {
  const Icon = ICONS[type];
  
  return (
    <div className="text-center py-12 px-4">
      <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-[#27272a] flex items-center justify-center mx-auto mb-4">
        {icon || <Icon className="w-8 h-8 text-slate-400" />}
      </div>
      <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-slate-500 dark:text-[#71717a] max-w-xs mx-auto mb-4">{description}</p>
      )}
      {action && (
        <button
          onClick={action.onClick}
          className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold transition-all"
        >
          {action.label}
        </button>
      )}
    </div>
  );
};

export default EmptyState;
