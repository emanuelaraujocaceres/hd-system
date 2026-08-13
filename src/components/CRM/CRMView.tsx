/**
 * CRMView - Página de CRM unificada
 * 
 * Clientes walk-in + delivery em tempo real
 * Fornecedores vinculados ao estoque
 * Filtros, busca, histórico de pedidos
 * Botões de adicionar cliente e fornecedor com formulários completos
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Filter,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  ShoppingBag,
  X,
  ChevronDown,
  Plus,
  Building2,
  Save,
  Users,
  Truck,
} from 'lucide-react';
import { Customer, Supplier, Sale } from '../../types';
import { storageService } from '../../services/storageService';
import { useToast } from '../shared/Toast';
import { MoneyInput, parseBrlToNumber } from '../shared/MoneyInput';
import { posAudio } from '../../services/audioService';

interface CRMViewProps {
  user: any;
}

type CRMTab = 'customers' | 'suppliers';
type CustomerFilter = 'all' | 'walkin' | 'delivery' | 'both';

export const CRMView: React.FC<CRMViewProps> = ({ user }) => {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<CRMTab>('customers');

  // ─── Clientes ──────────────────────────────────────────────
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<CustomerFilter>('all');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);

  // ─── Fornecedores ──────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);

  // ─── Modal de Cliente ──────────────────────────────────────
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [formCustomerName, setFormCustomerName] = useState('');
  const [formCustomerCpf, setFormCustomerCpf] = useState('');
  const [formCustomerEmail, setFormCustomerEmail] = useState('');
  const [formCustomerPhone, setFormCustomerPhone] = useState('');
  const [formCustomerWhatsapp, setFormCustomerWhatsapp] = useState('');
  const [formCustomerBirthDate, setFormCustomerBirthDate] = useState('');
  const [formCustomerType, setFormCustomerType] = useState<'walkin' | 'delivery' | 'both'>('walkin');
  const [formCustomerCreditLimit, setFormCustomerCreditLimit] = useState('');
  const [formCustomerAddress, setFormCustomerAddress] = useState('');
  const [formCustomerCity, setFormCustomerCity] = useState('');
  const [formCustomerState, setFormCustomerState] = useState('');
  const [formCustomerNeighborhood, setFormCustomerNeighborhood] = useState('');
  const [formCustomerZip, setFormCustomerZip] = useState('');

  // ─── Modal de Fornecedor ───────────────────────────────────
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formSupplierName, setFormSupplierName] = useState('');
  const [formSupplierTradeName, setFormSupplierTradeName] = useState('');
  const [formSupplierCnpj, setFormSupplierCnpj] = useState('');
  const [formSupplierContact, setFormSupplierContact] = useState('');
  const [formSupplierEmail, setFormSupplierEmail] = useState('');
  const [formSupplierPhone, setFormSupplierPhone] = useState('');
  const [formSupplierAddress, setFormSupplierAddress] = useState('');

  // ─── Carregar dados ────────────────────────────────────────
  useEffect(() => {
    loadData();
    const unsub = storageService.subscribe(loadData);
    return () => { unsub(); };
  }, []);

  const loadData = () => {
    const allCustomers = storageService.getCustomers();
    const filtered = user.superadmin
      ? allCustomers
      : allCustomers.filter(c => c.storeBranchId === user.storeBranchId);
    setCustomers(filtered);

    const allSuppliers = storageService.getSuppliers();
    const filteredSuppliers = user.superadmin
      ? allSuppliers
      : allSuppliers.filter(s => s.storeBranchId === user.storeBranchId);
    setSuppliers(filteredSuppliers);
  };

  // ─── Filtrar clientes ──────────────────────────────────────
  const filteredCustomers = useMemo(() => {
    let result = customers;
    if (filterType !== 'all') {
      result = result.filter(c => c.customerType === filterType);
    }
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

  // ─── Filtrar fornecedores ──────────────────────────────────
  const filteredSuppliers = useMemo(() => {
    if (!supplierSearch.trim()) return suppliers;
    const term = supplierSearch.toLowerCase();
    return suppliers.filter(s =>
      s.companyName.toLowerCase().includes(term) ||
      s.tradeName.toLowerCase().includes(term) ||
      s.cnpj.includes(term) ||
      s.contactName.toLowerCase().includes(term)
    );
  }, [suppliers, supplierSearch]);

  // ─── Selecionar cliente → carregar vendas ──────────────────
  const handleSelectCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    const allSales = storageService.getSales();
    const customerSalesList = allSales.filter(s => s.customerId === customer.id);
    setCustomerSales(customerSalesList);
  };

  // ─── Abrir modal de criar cliente ──────────────────────────
  const handleOpenNewCustomer = () => {
    setEditingCustomer(null);
    setFormCustomerName('');
    setFormCustomerCpf('');
    setFormCustomerEmail('');
    setFormCustomerPhone('');
    setFormCustomerWhatsapp('');
    setFormCustomerBirthDate('');
    setFormCustomerType('walkin');
    setFormCustomerCreditLimit('');
    setFormCustomerAddress('');
    setFormCustomerCity('');
    setFormCustomerState('');
    setFormCustomerNeighborhood('');
    setFormCustomerZip('');
    setIsCustomerModalOpen(true);
  };

  // ─── Abrir modal de editar cliente ─────────────────────────
  const handleOpenEditCustomer = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormCustomerName(customer.name);
    setFormCustomerCpf(customer.cpfCnpj || '');
    setFormCustomerEmail(customer.email || '');
    setFormCustomerPhone(customer.phone || '');
    setFormCustomerWhatsapp(customer.whatsapp || '');
    setFormCustomerBirthDate(customer.birthDate || '');
    setFormCustomerType(customer.customerType || 'walkin');
    setFormCustomerCreditLimit(customer.creditLimit ? String(customer.creditLimit) : '');
    setFormCustomerAddress(customer.addressStreet || '');
    setFormCustomerCity(customer.addressCity || customer.city || '');
    setFormCustomerState(customer.addressState || customer.state || '');
    setFormCustomerNeighborhood(customer.addressNeighborhood || '');
    setFormCustomerZip(customer.addressZip || '');
    setIsCustomerModalOpen(true);
  };

  // ─── Salvar cliente ────────────────────────────────────────
  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCustomerName.trim()) {
      addToast('error', 'Informe o nome do cliente.');
      return;
    }
    try {
      const id = editingCustomer?.id || `cust-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const customer: Customer = {
        id,
        name: formCustomerName.trim(),
        cpfCnpj: formCustomerCpf.trim(),
        email: formCustomerEmail.trim(),
        phone: formCustomerPhone.trim(),
        whatsapp: formCustomerWhatsapp.trim(),
        birthDate: formCustomerBirthDate || undefined,
        customerType: formCustomerType,
        creditLimit: parseBrlToNumber(formCustomerCreditLimit),
        currentBalance: editingCustomer?.currentBalance || 0,
        loyaltyPoints: editingCustomer?.loyaltyPoints || 0,
        city: formCustomerCity.trim(),
        state: formCustomerState.trim(),
        addressStreet: formCustomerAddress.trim(),
        addressCity: formCustomerCity.trim(),
        addressState: formCustomerState.trim(),
        addressNeighborhood: formCustomerNeighborhood.trim(),
        addressZip: formCustomerZip.trim(),
        createdAt: editingCustomer?.createdAt || new Date().toISOString(),
        storeBranchId: editingCustomer?.storeBranchId || storageService.getSelectedBranchId() || undefined,
        organizationId: storageService.getCurrentOrgId(),
      };
      storageService.saveCustomer(customer);
      posAudio.chime();
      setIsCustomerModalOpen(false);
      addToast('success', editingCustomer ? `Cliente "${customer.name}" atualizado.` : `Cliente "${customer.name}" cadastrado.`);
      loadData();
    } catch (err: any) {
      addToast('error', err.message || 'Erro ao salvar cliente.');
      posAudio.error();
    }
  };

  // ─── Abrir modal de criar fornecedor ───────────────────────
  const handleOpenNewSupplier = () => {
    setEditingSupplier(null);
    setFormSupplierName('');
    setFormSupplierTradeName('');
    setFormSupplierCnpj('');
    setFormSupplierContact('');
    setFormSupplierEmail('');
    setFormSupplierPhone('');
    setFormSupplierAddress('');
    setIsSupplierModalOpen(true);
  };

  // ─── Abrir modal de editar fornecedor ──────────────────────
  const handleOpenEditSupplier = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormSupplierName(supplier.companyName || '');
    setFormSupplierTradeName(supplier.tradeName || '');
    setFormSupplierCnpj(supplier.cnpj || '');
    setFormSupplierContact(supplier.contactName || '');
    setFormSupplierEmail(supplier.email || '');
    setFormSupplierPhone(supplier.phone || '');
    setFormSupplierAddress('');
    setIsSupplierModalOpen(true);
  };

  // ─── Salvar fornecedor ─────────────────────────────────────
  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSupplierName.trim()) {
      addToast('error', 'Informe o nome / razão social do fornecedor.');
      return;
    }
    try {
      const id = editingSupplier?.id || `sup-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
      const supplier: Supplier = {
        id,
        companyName: formSupplierName.trim(),
        tradeName: formSupplierTradeName.trim(),
        cnpj: formSupplierCnpj.trim(),
        contactName: formSupplierContact.trim(),
        email: formSupplierEmail.trim(),
        phone: formSupplierPhone.trim(),
        storeBranchId: editingSupplier?.storeBranchId || storageService.getSelectedBranchId() || undefined,
        organizationId: storageService.getCurrentOrgId(),
      };
      storageService.saveSupplier(supplier);
      posAudio.chime();
      setIsSupplierModalOpen(false);
      addToast('success', editingSupplier ? `Fornecedor "${supplier.companyName}" atualizado.` : `Fornecedor "${supplier.companyName}" cadastrado.`);
      loadData();
    } catch (err: any) {
      addToast('error', err.message || 'Erro ao salvar fornecedor.');
      posAudio.error();
    }
  };

  // ─── Badge de tipo de cliente ──────────────────────────────
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

  // ─── Total de vendas do cliente ────────────────────────────
  const getCustomerTotalSpent = (sales: Sale[]) =>
    sales.reduce((sum, s) => {
      if (s.total > 0) return sum + s.total;
      const itemsTotal = s.items?.reduce((acc, item) => acc + (item.total || 0), 0) || 0;
      return sum + itemsTotal;
    }, 0);

  return (
    <div className="p-3 sm:p-4 md:p-6 space-y-4 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="font-serif-italic text-2xl font-light tracking-tight text-slate-900 dark:text-white flex items-center gap-3">
            👥 CRM
          </h2>
          <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
            Gestão de clientes, fornecedores e relacionamento
          </p>
        </div>
      </div>

      {/* Tabs: Clientes / Fornecedores */}
      <div className="flex items-center gap-2 p-1 bg-slate-200 dark:bg-slate-800 rounded-xl w-fit">
        <button
          onClick={() => setActiveTab('customers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'customers'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Clientes
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">
            {customers.length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('suppliers')}
          className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
            activeTab === 'suppliers'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          Fornecedores
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700">
            {suppliers.length}
          </span>
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════
           TAB: CLIENTES
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'customers' && (
        <>
          {/* Toolbar: Busca + Filtros + Botão Adicionar */}
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
            <button
              onClick={handleOpenNewCustomer}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Adicionar Cliente
            </button>
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
                {customer.creditLimit > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 dark:border-[#27272a]">
                    <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      Limite: R$ {customer.creditLimit.toFixed(2)}
                    </span>
                  </div>
                )}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setSelectedCustomer(null); handleOpenEditCustomer(selectedCustomer); }}
                      className="px-3 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold transition-colors hover:bg-indigo-500/20"
                    >
                      Editar
                    </button>
                    <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-xl">
                      <X className="w-4 h-4 text-slate-500" />
                    </button>
                  </div>
                </div>

                {/* Conteúdo */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                  {/* Dados Pessoais */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Dados Pessoais</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      {selectedCustomer.cpfCnpj && (
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                          <span className="font-bold">CPF/CNPJ:</span> {selectedCustomer.cpfCnpj}
                        </div>
                      )}
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
                          <Phone className="w-3 h-3" /> WhatsApp: {selectedCustomer.whatsapp}
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

                  {/* Crédito / Limite */}
                  {selectedCustomer.creditLimit > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Crédito</h4>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                          <span className="text-slate-500">Limite</span>
                          <p className="font-bold text-emerald-600 dark:text-emerald-400">R$ {selectedCustomer.creditLimit.toFixed(2)}</p>
                        </div>
                        <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                          <span className="text-slate-500">Saldo Devedor</span>
                          <p className="font-bold text-rose-600 dark:text-rose-400">R$ {(selectedCustomer.currentBalance || 0).toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Histórico de Vendas */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Vendas Realizadas ({customerSales.length})
                    </h4>
                    {customerSales.length > 0 ? (
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/30">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold">Total Gasto:</span>
                          <p className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">R$ {getCustomerTotalSpent(customerSales).toFixed(2)}</p>
                        </div>
                        {customerSales.slice(0, 10).map((sale) => (
                          <div key={sale.id} className="p-2 rounded-lg bg-slate-50 dark:bg-[#09090b] text-xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-700 dark:text-slate-300">{sale.code}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                sale.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                                sale.status === 'cancelled' ? 'bg-rose-500/10 text-rose-600' :
                                'bg-amber-500/10 text-amber-600'
                              }`}>
                                {sale.status === 'completed' ? 'Concluída' : sale.status === 'cancelled' ? 'Cancelada' : 'Pendente'}
                              </span>
                            </div>
                            <p className="text-slate-500 mt-1">
                              R$ {(sale.total > 0 ? sale.total : (sale.items?.reduce((sum, i) => sum + (i.total || 0), 0) || 0)).toFixed(2)}
                              {' — '}
                              {new Date(sale.date).toLocaleDateString('pt-BR')}
                            </p>
                            {/* Sub-itens */}
                            {sale.items && sale.items.length > 0 && (
                              <div className="mt-1.5 pl-2 border-l-2 border-slate-200 dark:border-[#27272a] space-y-0.5">
                                {sale.items.map((item, idx) => (
                                  <p key={idx} className="text-[10px] text-slate-400 dark:text-[#71717a]">
                                    {item.quantity}x {item.productName} — R$ {item.total.toFixed(2)}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">Nenhuma venda realizada</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           TAB: FORNECEDORES
           ═══════════════════════════════════════════════════════ */}
      {activeTab === 'suppliers' && (
        <>
          {/* Toolbar: Busca + Botão Adicionar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={supplierSearch}
                onChange={(e) => setSupplierSearch(e.target.value)}
                placeholder="Buscar por nome, CNPJ, contato..."
                className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <button
              onClick={handleOpenNewSupplier}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2 whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Adicionar Fornecedor
            </button>
          </div>

          {/* Lista de Fornecedores */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredSuppliers.map((supplier) => (
              <div
                key={supplier.id}
                onClick={() => handleOpenEditSupplier(supplier)}
                className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer hover:border-indigo-500/30 transition-all"
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-900 dark:text-white truncate">{supplier.companyName}</p>
                    {supplier.tradeName && supplier.tradeName !== supplier.companyName && (
                      <p className="text-[10px] text-slate-400 dark:text-[#71717a] truncate">{supplier.tradeName}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1 mt-3">
                  {supplier.cnpj && (
                    <div className="text-[10px] text-slate-500 dark:text-[#71717a]">
                      CNPJ: {supplier.cnpj}
                    </div>
                  )}
                  {supplier.contactName && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                      <User className="w-3 h-3" />
                      <span>{supplier.contactName}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                      <Phone className="w-3 h-3" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-[#71717a]">
                      <Mail className="w-3 h-3" />
                      <span className="truncate">{supplier.email}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {filteredSuppliers.length === 0 && (
            <div className="text-center py-12">
              <Building2 className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500 dark:text-[#71717a]">Nenhum fornecedor encontrado</p>
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════
           MODAL: ADICIONAR / EDITAR CLIENTE
           ═══════════════════════════════════════════════════════ */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsCustomerModalOpen(false)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente'}
              </h3>
              <button onClick={() => setIsCustomerModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-xl">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={formCustomerName}
                  onChange={(e) => setFormCustomerName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">CPF / CNPJ</label>
                  <input
                    type="text"
                    value={formCustomerCpf}
                    onChange={(e) => setFormCustomerCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Tipo</label>
                  <select
                    value={formCustomerType}
                    onChange={(e) => setFormCustomerType(e.target.value as any)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="walkin">Walk-in</option>
                    <option value="delivery">Delivery</option>
                    <option value="both">Ambos</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={formCustomerPhone}
                    onChange={(e) => setFormCustomerPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">WhatsApp</label>
                  <input
                    type="tel"
                    value={formCustomerWhatsapp}
                    onChange={(e) => setFormCustomerWhatsapp(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">E-mail</label>
                  <input
                    type="email"
                    value={formCustomerEmail}
                    onChange={(e) => setFormCustomerEmail(e.target.value)}
                    placeholder="email@exemplo.com"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Data de Nascimento</label>
                  <input
                    type="date"
                    value={formCustomerBirthDate}
                    onChange={(e) => setFormCustomerBirthDate(e.target.value)}
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Limite de Crédito (R$)</label>
                <MoneyInput
                  value={formCustomerCreditLimit}
                  onChange={setFormCustomerCreditLimit}
                  placeholder="0,00"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Endereço */}
              <div className="border-t border-slate-200 dark:border-[#27272a] pt-3 space-y-3">
                <h4 className="text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase">Endereço</h4>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Rua / Avenida</label>
                  <input
                    type="text"
                    value={formCustomerAddress}
                    onChange={(e) => setFormCustomerAddress(e.target.value)}
                    placeholder="Rua Exemplo, 123"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Bairro</label>
                    <input
                      type="text"
                      value={formCustomerNeighborhood}
                      onChange={(e) => setFormCustomerNeighborhood(e.target.value)}
                      placeholder="Centro"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Cidade</label>
                    <input
                      type="text"
                      value={formCustomerCity}
                      onChange={(e) => setFormCustomerCity(e.target.value)}
                      placeholder="São Paulo"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Estado</label>
                    <input
                      type="text"
                      value={formCustomerState}
                      onChange={(e) => setFormCustomerState(e.target.value)}
                      placeholder="SP"
                      maxLength={2}
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">CEP</label>
                    <input
                      type="text"
                      value={formCustomerZip}
                      onChange={(e) => setFormCustomerZip(e.target.value)}
                      placeholder="00000-000"
                      className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#27272a] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {editingCustomer ? 'Atualizar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════
           MODAL: ADICIONAR / EDITAR FORNECEDOR
           ═══════════════════════════════════════════════════════ */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setIsSupplierModalOpen(false)}>
          <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingSupplier ? 'Editar Fornecedor' : 'Novo Fornecedor'}
              </h3>
              <button onClick={() => setIsSupplierModalOpen(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-xl">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Razão Social *</label>
                <input
                  type="text"
                  required
                  value={formSupplierName}
                  onChange={(e) => setFormSupplierName(e.target.value)}
                  placeholder="Ex: Ambev S.A."
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  value={formSupplierTradeName}
                  onChange={(e) => setFormSupplierTradeName(e.target.value)}
                  placeholder="Ex: Ambev"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">CNPJ</label>
                <input
                  type="text"
                  value={formSupplierCnpj}
                  onChange={(e) => setFormSupplierCnpj(e.target.value)}
                  placeholder="00.000.000/0001-00"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Pessoa de Contato</label>
                  <input
                    type="text"
                    value={formSupplierContact}
                    onChange={(e) => setFormSupplierContact(e.target.value)}
                    placeholder="Nome do representante"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={formSupplierPhone}
                    onChange={(e) => setFormSupplierPhone(e.target.value)}
                    placeholder="(00) 0000-0000"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">E-mail</label>
                <input
                  type="email"
                  value={formSupplierEmail}
                  onChange={(e) => setFormSupplierEmail(e.target.value)}
                  placeholder="contato@fornecedor.com.br"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 dark:text-[#71717a] uppercase mb-1">Endereço</label>
                <input
                  type="text"
                  value={formSupplierAddress}
                  onChange={(e) => setFormSupplierAddress(e.target.value)}
                  placeholder="Rua, número, bairro, cidade - UF"
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-[#27272a] transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
                >
                  <Save className="w-3.5 h-3.5" />
                  {editingSupplier ? 'Atualizar' : 'Cadastrar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
