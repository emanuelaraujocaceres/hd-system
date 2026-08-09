/**
 * CRMView - Página de CRM unificada
 * 
 * Mostra todos os clientes (walkin + delivery) em tempo real
 * Filtros por tipo, busca por nome/email/telefone
 * Detalhes do cliente com histórico de pedidos
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, User, Phone, Mail, MapPin, Calendar, ShoppingBag, X, ChevronDown } from 'lucide-react';
import { Customer, DeliveryOrder } from '../../types';
import { storageService } from '../../services/storageService';

interface CRMViewProps {
  user: any;
}

type CustomerFilter = 'all' | 'walkin' | 'delivery' | 'both';

export const CRMView: React.FC<CRMViewProps> = ({ user }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<CustomerFilter>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<DeliveryOrder[]>([]);

  useEffect(() => {
    loadCustomers();
    const unsub = storageService.subscribe(loadCustomers);
    return () => { unsub(); };
  }, []);

  const loadCustomers = () => {
    const all = storageService.getCustomers();
    // Filtrar por filial se não for superadmin
    const filtered = user.superadmin 
      ? all 
      : all.filter(c => c.storeBranchId === user.storeBranchId);
    setCustomers(filtered);
  };

  const filteredCustomers = useMemo(() => {
    let result = customers;
    
    // Filtro por tipo
    if (filterType !== 'all') {
      result = result.filter(c => c.customerType === filterType);
    }
    
    // Busca
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        (c.whatsapp && c.whatsapp.includes(term))
      );
    }
    
    return result.sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, filterType, searchTerm]);

  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    // Buscar pedidos do cliente
    const orders = storageService.getDeliveryOrdersByCustomer(customer.id);
    setCustomerOrders(orders);
  };

  const getCustomerTypeBadge = (type?: string) => {
    switch (type) {
      case 'delivery':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20">DELIVERY</span>;
      case 'both':
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/10 text-violet-600 border border-violet-500/20">AMBOS</span>;
      default:
        return <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">WALK-IN</span>;
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-italic text-2xl font-light tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            👥 CRM
            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 font-sans font-bold uppercase tracking-wider">
              {filteredCustomers.length} clientes
            </span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
            Clientes walk-in e delivery em tempo real
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome, e-mail, telefone..."
            className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          {(['all', 'walkin', 'delivery', 'both'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                filterType === type
                  ? 'bg-indigo-500 text-white'
                  : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400'
              }`}
            >
              {type === 'all' && 'Todos'}
              {type === 'walkin' && 'Walk-in'}
              {type === 'delivery' && 'Delivery'}
              {type === 'both' && 'Ambos'}
            </button>
          ))}
        </div>
      </div>

      {/* Lista de Clientes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredCustomers.map((customer) => (
          <div
            key={customer.id}
            onClick={() => handleSelectCustomer(customer)}
            className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer hover:border-indigo-500/30 transition-all"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <User className="w-5 h-5 text-indigo-500" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white">{customer.name}</p>
                  {getCustomerTypeBadge(customer.customerType)}
                </div>
              </div>
            </div>
            <div className="space-y-1 mt-3">
              {customer.whatsapp && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                  <Phone className="w-3 h-3" />
                  <span>{customer.whatsapp}</span>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                  <Mail className="w-3 h-3" />
                  <span className="truncate">{customer.email}</span>
                </div>
              )}
              {(customer.addressCity || customer.city) && (
                <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate">{customer.addressCity || customer.city}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredCustomers.length === 0 && (
        <div className="text-center py-12">
          <User className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-[#71717a]">Nenhum cliente encontrado</p>
        </div>
      )}

      {/* Modal de Detalhes do Cliente */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="p-5 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-indigo-500" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">{selectedCustomer.name}</h3>
                  {getCustomerTypeBadge(selectedCustomer.customerType)}
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-xl">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            {/* Conteúdo */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Dados Pessoais */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Dados Pessoais</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Mail className="w-3 h-3" /> {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Phone className="w-3 h-3" /> {selectedCustomer.phone}
                    </div>
                  )}
                  {selectedCustomer.whatsapp && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Phone className="w-3 h-3" /> {selectedCustomer.whatsapp}
                    </div>
                  )}
                  {selectedCustomer.birthDate && (
                    <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                      <Calendar className="w-3 h-3" /> {new Date(selectedCustomer.birthDate).toLocaleDateString('pt-BR')}
                    </div>
                  )}
                </div>
              </div>

              {/* Endereço */}
              {(selectedCustomer.addressStreet || selectedCustomer.addressCity) && (
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Endereço</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {[
                      selectedCustomer.addressStreet,
                      selectedCustomer.addressNumber,
                      selectedCustomer.addressComplement,
                      selectedCustomer.addressNeighborhood,
                      selectedCustomer.addressCity,
                      selectedCustomer.addressState,
                      selectedCustomer.addressZip
                    ].filter(Boolean).join(', ')}
                  </p>
                </div>
              )}

              {/* Histórico de Pedidos */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pedidos Delivery ({customerOrders.length})
                </h4>
                {customerOrders.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {customerOrders.map((order) => (
                      <div key={order.id} className="p-2 rounded-lg bg-slate-50 dark:bg-[#09090b] text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-700 dark:text-slate-300">#{order.orderNumber}</span>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                            order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-600' :
                            order.status === 'cancelled' ? 'bg-rose-500/10 text-rose-600' :
                            'bg-amber-500/10 text-amber-600'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <p className="text-slate-500 mt-1">R$ {order.total.toFixed(2)} — {new Date(order.createdAt).toLocaleDateString('pt-BR')}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Nenhum pedido delivery</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
