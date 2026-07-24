import React, { useState } from 'react';
import {
  Users,
  Building,
  Plus,
  Search,
  UserCheck,
  CreditCard,
  Award,
  Phone,
  Mail,
  X,
} from 'lucide-react';
import { Customer, Supplier } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface CRMViewProps {
  customers: Customer[];
  suppliers: Supplier[];
}

export const CRMView: React.FC<CRMViewProps> = ({ customers, suppliers }) => {
  const [activeTab, setActiveTab] = useState<'customers' | 'suppliers'>('customers');
  const [searchTerm, setSearchTerm] = useState('');

  // Customer Modal state
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custCpfCnpj, setCustCpfCnpj] = useState('');
  const [custEmail, setCustEmail] = useState('');
  const [custPhone, setCustPhone] = useState('');
  const [custLimit, setCustLimit] = useState<number>(1000);

  // Supplier Modal state
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [supCompanyName, setSupCompanyName] = useState('');
  const [supTradeName, setSupTradeName] = useState('');
  const [supCnpj, setSupCnpj] = useState('');
  const [supContact, setSupContact] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supPhone, setSupPhone] = useState('');

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    const newCust: Customer = {
      id: `cli-${Date.now()}`,
      name: custName,
      cpfCnpj: custCpfCnpj,
      email: custEmail,
      phone: custPhone,
      creditLimit: custLimit,
      currentBalance: 0,
      loyaltyPoints: 50,
      city: 'São Paulo',
      state: 'SP',
      createdAt: new Date().toISOString().slice(0, 10),
    };

    storageService.saveCustomer(newCust);
    posAudio.chime();
    setIsCustomerModalOpen(false);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    const newSup: Supplier = {
      id: `sup-${Date.now()}`,
      companyName: supCompanyName,
      tradeName: supTradeName,
      cnpj: supCnpj,
      contactName: supContact,
      email: supEmail,
      phone: supPhone,
    };

    storageService.saveSupplier(newSup);
    posAudio.chime();
    setIsSupplierModalOpen(false);
  };

  const filteredCustomers = customers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.cpfCnpj.includes(searchTerm)
  );

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.companyName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.tradeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.cnpj.includes(searchTerm)
  );

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header & Tab Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Gestão de Clientes & Fornecedores (CRM)
          </h2>
          <p className="text-xs text-slate-500">
            Cadastro unificado de clientes, limites de crédito fiado e parceiros fornecedores
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex bg-slate-200 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
            <button
              onClick={() => setActiveTab('customers')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'customers'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Clientes ({customers.length})
            </button>
            <button
              onClick={() => setActiveTab('suppliers')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                activeTab === 'suppliers'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              Fornecedores ({suppliers.length})
            </button>
          </div>

          <button
            onClick={() =>
              activeTab === 'customers' ? setIsCustomerModalOpen(true) : setIsSupplierModalOpen(true)
            }
            className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>{activeTab === 'customers' ? 'Novo Cliente' : 'Novo Fornecedor'}</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 dark:text-[#71717a] absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={`Buscar ${activeTab === 'customers' ? 'cliente por nome ou CPF/CNPJ...' : 'fornecedor por razão social ou CNPJ...'}`}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* CUSTOMERS TAB */}
      {activeTab === 'customers' && (
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Nome do Cliente</th>
                <th className="py-3.5 px-4">CPF / CNPJ</th>
                <th className="py-3.5 px-4">Contato</th>
                <th className="py-3.5 px-4">Limite de Crédito</th>
                <th className="py-3.5 px-4">Saldo Devedor (Fiado)</th>
                <th className="py-3.5 px-4">Pontos Fidelidade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
              {filteredCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors">
                  <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">{c.name}</td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-[#a1a1aa]">{c.cpfCnpj}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-[#71717a]">
                    <p>{c.email}</p>
                    <p className="font-semibold text-slate-700 dark:text-[#a1a1aa]">{c.phone}</p>
                  </td>
                  <td className="py-3 px-4 font-bold text-indigo-600 dark:text-indigo-400">
                    R$ {c.creditLimit.toFixed(2)}
                  </td>
                  <td className="py-3 px-4 font-bold text-rose-600 dark:text-rose-400">
                    R$ {c.currentBalance.toFixed(2)}
                  </td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold">
                      <Award className="w-3.5 h-3.5 text-amber-500" />
                      {c.loyaltyPoints} pts
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* SUPPLIERS TAB */}
      {activeTab === 'suppliers' && (
        <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-[#09090b]/80 border-b border-slate-200 dark:border-[#27272a] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider">
                <th className="py-3.5 px-4">Razão Social / Nome Fantasia</th>
                <th className="py-3.5 px-4">CNPJ</th>
                <th className="py-3.5 px-4">Contato Principal</th>
                <th className="py-3.5 px-4">Email / Telefone</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
              {filteredSuppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 dark:hover:bg-[#27272a]/30 transition-colors">
                  <td className="py-3 px-4">
                    <p className="font-bold text-slate-900 dark:text-white">{s.tradeName}</p>
                    <p className="text-[10px] text-slate-400 dark:text-[#71717a]">{s.companyName}</p>
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-600 dark:text-[#a1a1aa]">{s.cnpj}</td>
                  <td className="py-3 px-4 font-semibold text-slate-700 dark:text-[#a1a1aa]">{s.contactName}</td>
                  <td className="py-3 px-4 text-slate-500 dark:text-[#71717a]">
                    <p>{s.email}</p>
                    <p className="font-semibold text-slate-700 dark:text-[#a1a1aa]">{s.phone}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* NEW CUSTOMER MODAL */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cadastrar Novo Cliente</h3>

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Nome Completo / Razão Social</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Maria Fernandes Oliveira"
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">CPF ou CNPJ</label>
                <input
                  type="text"
                  required
                  placeholder="000.000.000-00"
                  value={custCpfCnpj}
                  onChange={(e) => setCustCpfCnpj(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">Telefone / WhatsApp</label>
                  <input
                    type="text"
                    required
                    placeholder="(11) 98888-7777"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>

                <div>
                  <label className="block font-bold mb-1">Limite Crédito Fiado (R$)</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={custLimit}
                    onChange={(e) => setCustLimit(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold mb-1">E-mail</label>
                <input
                  type="email"
                  placeholder="cliente@email.com"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomerModalOpen(false)}
                  className="px-4 py-2 rounded-xl border font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  Salvar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW SUPPLIER MODAL */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Cadastrar Novo Fornecedor</h3>

            <form onSubmit={handleSaveSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold mb-1">Nome Fantasia</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Atacadão Distribuidora"
                  value={supTradeName}
                  onChange={(e) => setSupTradeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold mb-1">Razão Social</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Atacadão Comercio Ltda"
                  value={supCompanyName}
                  onChange={(e) => setSupCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold mb-1">CNPJ</label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000/0001-00"
                    value={supCnpj}
                    onChange={(e) => setSupCnpj(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold mb-1">Contato Vendedor</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Carlos Santos"
                    value={supContact}
                    onChange={(e) => setSupContact(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border rounded-xl"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 rounded-xl border font-bold"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 text-white font-bold"
                >
                  Salvar Fornecedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
