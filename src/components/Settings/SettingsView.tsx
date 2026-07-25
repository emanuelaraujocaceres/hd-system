import React, { useState } from 'react';
import {
  Settings,
  Building2,
  Printer,
  Store,
  Save,
  Plus,
  Trash2,
  Edit2,
  Users,
  Check,
  CheckCircle,
  X,
  Lock,
  Mail,
  UserPlus,
  Sparkles,
  CreditCard,
  Calendar,
  Zap,
  Download,
  Clock,
  Receipt,
  QrCode,
  RefreshCw,
} from 'lucide-react';
import { SystemSettings, StoreBranch, UserProfile, Role, UserPermissions, SubscriptionInfo, SubscriptionInvoice } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface SettingsViewProps {
  settings: SystemSettings;
  branches: StoreBranch[];
  user: UserProfile;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, branches, user }) => {
  const isAdmin = user.role === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<'fiscal' | 'branches' | 'collaborators' | 'subscription'>('fiscal');

  // Subscription & Stripe State
  const [subscription, setSubscription] = useState<SubscriptionInfo>(() => storageService.getSubscription());
  const [isStripeModalOpen, setIsStripeModalOpen] = useState(false);
  const [stripePaymentMethod, setStripePaymentMethod] = useState<'card' | 'pix'>('card');
  const [isProcessingStripe, setIsProcessingStripe] = useState(false);
  const [selectedInvoiceForReceipt, setSelectedInvoiceForReceipt] = useState<SubscriptionInvoice | null>(null);
  const [paymentSuccessAlert, setPaymentSuccessAlert] = useState(false);

  // Fiscal & General Settings State
  const [tradeName, setTradeName] = useState(settings.tradeName);
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [cnpj, setCnpj] = useState(settings.cnpj);
  const [ie, setIe] = useState(settings.ie);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [pixKey, setPixKey] = useState(settings.pixKey);
  const [printerPaperSize, setPrinterPaperSize] = useState<'80mm' | '58mm'>(settings.printerPaperSize || '80mm');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(settings.autoPrintReceipt);

  // Branch Modal / Edit State
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<StoreBranch | null>(null);
  const [branchName, setBranchName] = useState('');
  const [branchCode, setBranchCode] = useState('');
  const [branchCnpj, setBranchCnpj] = useState('');
  const [branchCity, setBranchCity] = useState('');
  const [branchState, setBranchState] = useState('');
  const [branchAddress, setBranchAddress] = useState('');
  const [branchPhone, setBranchPhone] = useState('');
  const [branchIsHQ, setBranchIsHQ] = useState(false);

  // Collaborator Modal / Edit State
  const [usersList, setUsersList] = useState<UserProfile[]>(storageService.getUsers());
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userRole, setUserRole] = useState<Role>('collaborator');
  const [userBranchId, setUserBranchId] = useState(branches[0]?.id || 'br-01');
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({
    pdv: true,
    inventory: true,
    crm: true,
    finance: false,
    dashboard: false,
    settings: false,
  });
  const [userPassword, setUserPassword] = useState('');

  const refreshUsersList = () => {
    setUsersList(storageService.getUsers());
  };

  const handleSaveFiscal = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: SystemSettings = {
      ...settings,
      tradeName,
      companyName,
      cnpj,
      ie,
      address,
      phone,
      pixKey,
      printerPaperSize,
      autoPrintReceipt,
    };

    storageService.saveSettings(updated);
    posAudio.chime();
    alert('Configurações salvas com sucesso!');
  };

  // Branch Handlers
  const handleOpenBranchModal = (branch?: StoreBranch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchName(branch.name);
      setBranchCode(branch.code || '');
      setBranchCnpj(branch.cnpj || '');
      setBranchCity(branch.city || '');
      setBranchState(branch.state || '');
      setBranchAddress(branch.address || '');
      setBranchPhone(branch.phone || '');
      setBranchIsHQ(branch.isHeadquarters || false);
    } else {
      setEditingBranch(null);
      setBranchName('');
      setBranchCode(`FIL-${branches.length + 1}`);
      setBranchCnpj(settings.cnpj || '');
      setBranchCity('São Paulo');
      setBranchState('SP');
      setBranchAddress('');
      setBranchPhone(settings.phone || '');
      setBranchIsHQ(false);
    }
    setIsBranchModalOpen(true);
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const newBranch: StoreBranch = {
      id: editingBranch ? editingBranch.id : `br-${Date.now()}`,
      name: branchName,
      code: branchCode,
      cnpj: branchCnpj,
      city: branchCity,
      state: branchState,
      address: branchAddress,
      phone: branchPhone,
      isHeadquarters: branchIsHQ,
      active: true,
    };

    storageService.saveBranch(newBranch);
    setIsBranchModalOpen(false);
    posAudio.chime();
  };

  const handleDeleteBranch = (id: string) => {
    if (branches.length <= 1) {
      alert('O sistema precisa de pelo menos 1 filial cadastrada.');
      return;
    }
    if (confirm('Tem certeza que deseja excluir esta filial?')) {
      storageService.deleteBranch(id);
    }
  };

  // User / Collaborator Handlers
  const handleOpenUserModal = (u?: UserProfile) => {
    if (u) {
      setEditingUser(u);
      setUserName(u.name);
      setUserEmail(u.email);
      setUserRole(u.role);
      setUserBranchId(u.storeBranchId);
      setUserPermissions(u.permissions || {
        pdv: true,
        inventory: true,
        crm: true,
        finance: false,
        dashboard: false,
        settings: false,
      });
      setUserPassword(u.password || '');
    } else {
      setEditingUser(null);
      setUserName('');
      setUserEmail('');
      setUserRole('collaborator');
      setUserBranchId(branches[0]?.id || 'br-01');
      setUserPermissions({
        pdv: true,
        inventory: true,
        crm: true,
        finance: false,
        dashboard: false,
        settings: false,
      });
      setUserPassword('');
    }
    setIsUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.includes('@')) {
      alert('Por favor, informe um e-mail do Google válido.');
      return;
    }

    const newUser: UserProfile = {
      id: editingUser ? editingUser.id : `usr-${Date.now()}`,
      name: userName,
      email: userEmail.trim().toLowerCase(),
      role: userRole,
      avatarUrl: editingUser?.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
      organizationId: 'org-nexus-01',
      storeBranchId: userBranchId,
      permissions: userRole === 'admin' ? {
        pdv: true,
        inventory: true,
        crm: true,
        finance: true,
        dashboard: true,
        settings: true,
      } : userPermissions,
      active: true,
      createdAt: editingUser?.createdAt || new Date().toISOString().split('T')[0],
      password: userPassword || editingUser?.password || undefined,
    };

    storageService.saveUser(newUser);
    refreshUsersList();
    setIsUserModalOpen(false);
    posAudio.chime();
  };

  const handleDeleteUser = (id: string) => {
    if (id === user.id) {
      alert('Você não pode excluir sua própria conta atualmente logada.');
      return;
    }
    if (confirm('Tem certeza que deseja excluir este colaborador da empresa?')) {
      storageService.deleteUser(id);
      refreshUsersList();
    }
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setUserPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Stripe Payment Handlers
  const handleInitiateStripeCheckout = async () => {
    setIsProcessingStripe(true);
    try {
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planCode: subscription.planCode,
          userEmail: user.email,
          successUrl: window.location.href,
          cancelUrl: window.location.href,
        }),
      });
      const data = await res.json();
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
        return;
      }
      setIsStripeModalOpen(true);
    } catch (err) {
      console.error('Erro ao conectar com API Stripe backend:', err);
      setIsStripeModalOpen(true);
    } finally {
      setIsProcessingStripe(false);
    }
  };

  const handleConfirmStripeRenewal = () => {
    setIsProcessingStripe(true);
    setTimeout(() => {
      const methodText = stripePaymentMethod === 'card'
        ? 'Cartão de Crédito (Stripe Checkout) **** 4242'
        : 'PIX Instantâneo (Stripe QrCode)';
      const updated = storageService.renewSubscriptionViaStripe(methodText);
      setSubscription(updated);
      setIsProcessingStripe(false);
      setIsStripeModalOpen(false);
      setPaymentSuccessAlert(true);
      posAudio.chime();
      setTimeout(() => setPaymentSuccessAlert(false), 8000);
    }, 1200);
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Configurações Globais do HD-System ERP
          </h2>
          <p className="text-xs text-slate-500">
            Gerencie dados fiscais, filiais, equipe do sistema e sua assinatura Stripe
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-200/80 dark:bg-[#18181b] p-1 rounded-2xl border border-slate-300 dark:border-[#27272a] text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveSubTab('fiscal')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'fiscal'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Dados & Impressora</span>
          </button>

          <button
            onClick={() => setActiveSubTab('branches')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'branches'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Filiais ({branches.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('collaborators')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'collaborators'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-500" />
            <span>Equipe ({usersList.length})</span>
          </button>

          <button
            onClick={() => setActiveSubTab('subscription')}
            className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'subscription'
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md font-bold'
                : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/50'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Assinatura & Stripe</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500 text-white animate-pulse">
              {subscription.daysRemaining}d
            </span>
          </button>
        </div>
      </div>

      {/* --- TAB 1: FISCAL & GENERAL --- */}
      {activeSubTab === 'fiscal' && (
        <form onSubmit={handleSaveFiscal} className="space-y-6">
          {/* Company Info Box */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-[#27272a] pb-3">
              <Building2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Dados da Empresa Emitente (CNPJ & Fiscal)</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Nome Fantasia
                </label>
                <input
                  type="text"
                  required
                  value={tradeName}
                  onChange={(e) => setTradeName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Razão Social
                </label>
                <input
                  type="text"
                  required
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  CNPJ
                </label>
                <input
                  type="text"
                  required
                  value={cnpj}
                  onChange={(e) => setCnpj(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Inscrição Estadual (IE)
                </label>
                <input
                  type="text"
                  required
                  value={ie}
                  onChange={(e) => setIe(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Endereço Completo
                </label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Telefone de Contato / Suporte
                </label>
                <input
                  type="text"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* Payment & Printer Settings */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-[#27272a] pb-3">
              <Printer className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Chave PIX & Impressão de Comprovantes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Chave PIX Principal para QR Code
                </label>
                <input
                  type="text"
                  required
                  value={pixKey}
                  onChange={(e) => setPixKey(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Largura do Papel da Impressora Térmica
                </label>
                <select
                  value={printerPaperSize}
                  onChange={(e) => setPrinterPaperSize(e.target.value as '80mm' | '58mm')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                >
                  <option value="80mm">80mm (Bobina Larga de Caixa)</option>
                  <option value="58mm">58mm (Bobina Estreita / Mini Printer)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="autoPrint"
                checked={autoPrintReceipt}
                onChange={(e) => setAutoPrintReceipt(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
              <label htmlFor="autoPrint" className="text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] cursor-pointer">
                Abrir modal de comprovante automaticamente ao finalizar venda
              </label>
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Salvar Parâmetros do Sistema</span>
            </button>
          </div>
        </form>
      )}

      {/* --- TAB 2: BRANCHES (FILIAIS) --- */}
      {activeSubTab === 'branches' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>Gestão da Rede de Filiais</span>
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre e edite as filiais da empresa. Cada venda e operador pode ser vinculado a uma filial específica.
              </p>
            </div>

            <button
              onClick={() => handleOpenBranchModal()}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nova Filial</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {branches.map((b) => (
              <div
                key={b.id}
                onClick={() => handleOpenBranchModal(b)}
                className="p-5 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm flex flex-col justify-between space-y-4 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:shadow-md transition-all"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-300 font-bold">
                        {b.code || 'MATRIZ'}
                      </span>
                      <h4 className="text-base font-bold text-slate-900 dark:text-white mt-1">
                        {b.name}
                      </h4>
                    </div>

                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 ${
                        b.isHeadquarters
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                          : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30'
                      }`}
                    >
                      {b.isHeadquarters ? 'Matriz Principal' : 'Filial'}
                    </span>
                  </div>

                  <div className="text-xs space-y-1 text-slate-600 dark:text-[#a1a1aa] pt-1">
                    <p>📍 {b.address || `${b.city} - ${b.state}`}</p>
                    <p>📄 CNPJ: <span className="font-mono">{b.cnpj}</span></p>
                    <p>📞 {b.phone || 'Sem telefone registrado'}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-[#27272a]">
                  <span className="text-[10px] font-semibold text-emerald-500 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    Ativa para Vendas
                  </span>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenBranchModal(b)}
                      className="p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                      title="Editar Filial"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteBranch(b.id)}
                        className="p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-500 transition-colors"
                        title="Excluir Filial"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- TAB 3: COLLABORATORS & GOOGLE PERMISSIONS --- */}
      {activeSubTab === 'collaborators' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-emerald-500" />
                <span>Gestão de Colaboradores & Autenticação Google</span>
              </h3>
              <p className="text-xs text-slate-500">
                Cadastre o e-mail da conta do Google do colaborador e configure as permissões restritas (PDV, Estoque, CRM, Financeiro).
              </p>
            </div>

            <button
              onClick={() => handleOpenUserModal()}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Adicionar Colaborador Google</span>
            </button>
          </div>

          {/* Desktop Table (md+) */}
          <div className="hidden md:block bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#09090b] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-[#27272a]">
                  <tr>
                    <th className="px-5 py-3.5">Colaborador</th>
                    <th className="px-5 py-3.5">Conta Google</th>
                    <th className="px-5 py-3.5">Cargo</th>
                    <th className="px-5 py-3.5">Permissões de Acesso</th>
                    <th className="px-5 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                  {usersList.map((u) => {
                    const isAdmin = u.role === 'admin';
                    const perms = u.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true };
                    return (
                      <tr
                        key={u.id}
                        onClick={() => handleOpenUserModal(u)}
                        className="hover:bg-slate-50/50 dark:hover:bg-[#27272a]/30 transition-colors cursor-pointer"
                      >
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <img
                              src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={u.name}
                              className="w-9 h-9 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-800"
                            />
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white text-xs">{u.name}</p>
                              <span className="text-[10px] text-slate-400">
                                Cadastrado em {u.createdAt || '2026-01-01'}
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-5 py-4 font-mono font-medium text-slate-700 dark:text-slate-300">
                          <div className="flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{u.email}</span>
                          </div>
                        </td>

                        <td className="px-5 py-4">
                          <span
                            className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border ${
                              isAdmin
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isAdmin ? 'ADMINISTRADOR' : 'COLABORADOR'}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          {isAdmin ? (
                            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Acesso Total Liberado
                            </span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {perms.pdv && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                  PDV / Vendas
                                </span>
                              )}
                              {perms.inventory && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                                  Estoque & Produtos
                                </span>
                              )}
                              {perms.crm && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                                  Clientes & CRM
                                </span>
                              )}
                              {perms.finance && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                                  Financeiro
                                </span>
                              )}
                              {perms.dashboard && (
                                <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                                  Dashboard
                                </span>
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => handleOpenUserModal(u)}
                              className="p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                              title="Editar Permissões"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-500 transition-colors"
                                title="Excluir Colaborador"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards (below md) */}
          <div className="block md:hidden space-y-3">
            {usersList.map((u) => {
              const isAdmin = u.role === 'admin';
              const perms = u.permissions || { pdv: true, inventory: true, crm: true, finance: true, dashboard: true, settings: true };
              return (
                <div
                  key={u.id}
                  onClick={() => handleOpenUserModal(u)}
                  className="p-4 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-2xl shadow-sm space-y-3 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:shadow-md transition-all"
                >
                  <div className="flex items-center gap-3">
                    <img
                      src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                      alt={u.name}
                      className="w-10 h-10 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-800"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-900 dark:text-white text-sm truncate">{u.name}</p>
                      <div className="flex items-center gap-1 text-slate-500">
                        <Mail className="w-3 h-3" />
                        <span className="text-[11px] truncate">{u.email}</span>
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-extrabold px-2.5 py-1 rounded-full border shrink-0 ${
                        isAdmin
                          ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                          : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                      }`}
                    >
                      {isAdmin ? 'ADMIN' : 'COLAB'}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {isAdmin ? (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" /> Acesso Total
                      </span>
                    ) : (
                      <>
                        {perms.pdv && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                            PDV
                          </span>
                        )}
                        {perms.inventory && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                            Estoque
                          </span>
                        )}
                        {perms.crm && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                            CRM
                          </span>
                        )}
                        {perms.finance && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                            Financeiro
                          </span>
                        )}
                        {perms.dashboard && (
                          <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-purple-500/10 text-purple-600 dark:text-purple-400">
                            Dashboard
                          </span>
                        )}
                      </>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-[#27272a]" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenUserModal(u)}
                      className="flex-1 flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors text-[11px] font-bold"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDeleteUser(u.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-500 transition-colors text-[11px] font-bold"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* --- TAB 4: ASSINATURA & PAGAMENTO STRIPE --- */}
      {activeSubTab === 'subscription' && (
        <div className="space-y-6">
          {/* Success Banner */}
          {paymentSuccessAlert && (
            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                <div>
                  <h4 className="font-bold text-sm">Pagamento Confirmado via Stripe!</h4>
                  <p className="text-xs">
                    Sua assinatura do HD-System Pró foi renovada com sucesso por mais 30 dias.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPaymentSuccessAlert(false)}
                className="p-1 rounded-lg hover:bg-emerald-500/20 text-emerald-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Top Status & Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Metric 1: Status & Plan */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Plano Ativo
                  </span>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mt-0.5">
                    {subscription.status === 'trial' ? 'Versão Demonstração' : 'Versão Pró'}
                  </h3>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-[10px] font-extrabold uppercase flex items-center gap-1.5 border ${
                    subscription.status === 'active'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      subscription.status === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                    }`}
                  ></span>
                  {subscription.status === 'active' ? 'Ativa (Em Dia)' : 'Vencida'}
                </span>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-[#27272a] flex items-center justify-between text-xs">
                <span className="text-slate-500">Valor Recorrente:</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  R$ {subscription.priceMonthly?.toFixed(2).replace('.', ',')} / mês
                </span>
              </div>
            </div>

            {/* Metric 2: Days Remaining & Next Billing */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm flex flex-col justify-between space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Tempo Restante para Pagar
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                      {subscription.daysRemaining} {subscription.daysRemaining === 1 ? 'Dia' : 'Dias'}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">restantes</span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <Clock className="w-5 h-5" />
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1">
                <div className="w-full bg-slate-100 dark:bg-[#27272a] h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      subscription.daysRemaining > 10
                        ? 'bg-emerald-500'
                        : subscription.daysRemaining > 3
                        ? 'bg-amber-500'
                        : 'bg-rose-500'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(5, (subscription.daysRemaining / 30) * 100))}%` }}
                  ></div>
                </div>
                <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                  <span>Próximo vencimento: {subscription.nextBillingDate}</span>
                  <span>Ciclo Mensal</span>
                </div>
              </div>
            </div>

            {/* Metric 3: Quick Stripe Payment CTA */}
            <div className="p-5 rounded-3xl bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 text-white shadow-lg flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-1">
                    <Zap className="w-3.5 h-3.5 text-amber-400" /> Gateway Stripe Ativo
                  </span>
                  <span className="text-[10px] font-mono bg-white/10 px-2 py-0.5 rounded text-indigo-200">
                    Stripe Live
                  </span>
                </div>
                <h3 className="text-sm font-bold text-white mt-1">
                  Renovação & Pagamento Online
                </h3>
                <p className="text-xs text-indigo-200/80 mt-1">
                  Pague com cartão ou PIX e garanta o funcionamento sem interrupções do HD-System.
                </p>
              </div>

              <button
                onClick={handleInitiateStripeCheckout}
                disabled={isProcessingStripe}
                className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-xs shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingStripe ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Conectando ao Stripe...</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" />
                    <span>Pagar Assinatura via Stripe</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Details & Invoices Section */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Invoices History Table (Left 2 cols) */}
            <div className="lg:col-span-2 bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#27272a] pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Receipt className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    <span>Histórico de Faturas & Comprovantes</span>
                  </h3>
                  <p className="text-xs text-slate-500">
                    Acompanhe suas mensalidades pagas e emita recibos do HD-System ERP
                  </p>
                </div>
                <span className="text-xs font-bold text-slate-400">
                  {subscription.invoices?.length || 0} Faturas
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-[#09090b] text-slate-500 font-bold uppercase tracking-wider border-b border-slate-200 dark:border-[#27272a]">
                    <tr>
                      <th className="px-4 py-3">Fatura</th>
                      <th className="px-4 py-3">Data</th>
                      <th className="px-4 py-3">Valor</th>
                      <th className="px-4 py-3">Método</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Comprovante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                    {subscription.invoices?.map((inv) => (
                      <tr key={inv.id} className="hover:bg-slate-50/50 dark:hover:bg-[#27272a]/30 transition-colors">
                        <td className="px-4 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                          {inv.id}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-400">
                          {inv.date}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">
                          R$ {inv.amount.toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300">
                          {inv.paymentMethod}
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                            PAGO
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <button
                            onClick={() => setSelectedInvoiceForReceipt(inv)}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-300 hover:text-indigo-600 text-xs font-bold transition-all flex items-center gap-1.5 ml-auto cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>Ver Recibo</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Plan Included Features Card (Right 1 col) */}
            <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-sm space-y-4">
              <div className="border-b border-slate-100 dark:border-[#27272a] pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <span>Benefícios do Seu Plano Pró</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Recursos liberais para sua empresa crescer
                </p>
              </div>

              <ul className="space-y-3 text-xs">
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>PDV com Frente de Caixa Ilimitado</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Gestão de Múltiplas Filiais & Estoque</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Copilot de Inteligência Artificial Gemini 3.6</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Colaboradores com Login Google Ilimitados</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Financeiro, DRE Gerencial & Clientes CRM</span>
                </li>
                <li className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <span>Suporte Técnico Prioritário Stripe 24/7</span>
                </li>
              </ul>

              <div className="pt-4 border-t border-slate-100 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] p-3.5 rounded-2xl text-[11px] text-slate-500">
                <p className="font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Identificador de Contrato Stripe
                </p>
                <p className="font-mono text-[10px] break-all">{subscription.stripeSubscriptionId}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- STRIPE CHECKOUT MODAL --- */}
      {isStripeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5">
            {/* Header Stripe */}
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#27272a] pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-md">
                  S
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-900 dark:text-white">
                    Stripe Checkout HD-System
                  </h3>
                  <p className="text-[11px] text-slate-500">Pagamento seguro de assinatura</p>
                </div>
              </div>
              <button
                onClick={() => setIsStripeModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Total Summary Box */}
            <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/40 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">
                  Renovação de Assinatura (30 Dias)
                </p>
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Plano Pró
                </p>
              </div>
              <span className="text-xl font-black text-slate-900 dark:text-white">
                R$ 99,90
              </span>
            </div>

            {/* Payment Method Selector */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Selecione a forma de pagamento:
              </label>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStripePaymentMethod('card')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    stripePaymentMethod === 'card'
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-white ring-2 ring-indigo-500/20'
                      : 'border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4" />
                  <span>Cartão de Crédito</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStripePaymentMethod('pix')}
                  className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    stripePaymentMethod === 'pix'
                      ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-white ring-2 ring-emerald-500/20'
                      : 'border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                  <span>PIX Instantâneo</span>
                </button>
              </div>
            </div>

            {/* Dynamic Card Form or PIX QrCode */}
            {stripePaymentMethod === 'card' ? (
              <div className="space-y-3 p-3 bg-slate-50 dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-[#27272a] text-xs">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">
                    Número do Cartão de Crédito (Stripe Teste)
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="4242 •••• •••• 4242"
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] font-mono text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      Validade
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="12/28"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] font-mono text-slate-900 dark:text-white font-bold text-center"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">
                      CVC
                    </label>
                    <input
                      type="text"
                      readOnly
                      value="123"
                      className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-300 dark:border-[#27272a] font-mono text-slate-900 dark:text-white font-bold text-center"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-[#27272a] text-center space-y-2">
                <div className="w-32 h-32 bg-white p-2 mx-auto rounded-xl border border-slate-300 flex items-center justify-center shadow-inner">
                  <QrCode className="w-28 h-28 text-slate-900" />
                </div>
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Escaneie o QrCode com o aplicativo do seu banco
                </p>
                <p className="text-[10px] text-slate-400 font-mono">
                  Chave Stripe PIX: 00020126580014br.gov.bcb.pix0136stripe-hd-system-2026
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-[#27272a]">
              <button
                type="button"
                onClick={() => setIsStripeModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#27272a] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmStripeRenewal}
                disabled={isProcessingStripe}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md shadow-emerald-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isProcessingStripe ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Processando no Stripe...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Confirmar Pagamento de R$ 99,90</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- INVOICE RECEIPT MODAL --- */}
      {selectedInvoiceForReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-[#27272a] pb-3">
              <h3 className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <Receipt className="w-4 h-4 text-indigo-600" />
                <span>Recibo de Pagamento SaaS</span>
              </h3>
              <button
                onClick={() => setSelectedInvoiceForReceipt(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-[#09090b] rounded-2xl border border-slate-200 dark:border-[#27272a] space-y-3 text-xs">
              <div className="text-center border-b border-slate-200 dark:border-[#27272a] pb-3">
                <h4 className="font-bold text-sm text-slate-900 dark:text-white">HD-System ERP PDV</h4>
                <p className="text-[10px] text-slate-500">Comprovante de Licença de Uso SaaS</p>
                <p className="text-[10px] font-mono text-slate-400 mt-1">Nº {selectedInvoiceForReceipt.id}</p>
              </div>

              <div className="space-y-1.5 text-slate-700 dark:text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-500">Empresa:</span>
                  <span className="font-bold">{settings.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">CNPJ:</span>
                  <span className="font-mono">{settings.cnpj}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Data de Emissão:</span>
                  <span>{selectedInvoiceForReceipt.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Forma de Pagamento:</span>
                  <span>{selectedInvoiceForReceipt.paymentMethod}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-[#27272a]">
                  <span className="font-bold text-slate-900 dark:text-white">Valor Pago:</span>
                  <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                    R$ {selectedInvoiceForReceipt.amount.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              <div className="pt-3 text-center text-[10px] text-slate-400">
                Processado via Stripe Gateway. Assinatura Válida.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir Recibo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL BRANCH (FILIAL) --- */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <span>{editingBranch ? 'Editar Filial' : 'Cadastrar Nova Filial'}</span>
              </h3>
              <button
                onClick={() => setIsBranchModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nome da Filial / Loja:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: HD-System Filial 02 - Campinas Centro"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Código de Identificação:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ex: SP-02"
                    value={branchCode}
                    onChange={(e) => setBranchCode(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    CNPJ da Filial:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="00.000.000/0002-00"
                    value={branchCnpj}
                    onChange={(e) => setBranchCnpj(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Cidade:
                  </label>
                  <input
                    type="text"
                    required
                    value={branchCity}
                    onChange={(e) => setBranchCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Estado (UF):
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={2}
                    value={branchState}
                    onChange={(e) => setBranchState(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white uppercase font-bold"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Endereço Completo:
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Av. Principal, 500 - Bairro"
                    value={branchAddress}
                    onChange={(e) => setBranchAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Telefone de Contato:
                  </label>
                  <input
                    type="text"
                    placeholder="(11) 99999-0000"
                    value={branchPhone}
                    onChange={(e) => setBranchPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center gap-2">
                <input
                  type="checkbox"
                  id="hqCheck"
                  checked={branchIsHQ}
                  onChange={(e) => setBranchIsHQ(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600"
                />
                <label htmlFor="hqCheck" className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                  Definir como Matriz Principal do Grupo
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold"
                >
                  Salvar Filial
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL COLLABORATOR (COLABORADOR GOOGLE) --- */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-500" />
                <span>{editingUser ? 'Editar Colaborador Google' : 'Novo Colaborador Google'}</span>
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo do Colaborador:
                </label>
                <input
                  type="text"
                  required
                  placeholder="ex: João Silva Santos"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  E-mail da Conta do Google (Google Login):
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="email"
                    required
                    placeholder="ex: joao.operador@gmail.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-mono font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  O colaborador usará este e-mail do Google para fazer login no sistema.
                </p>
              </div>

              {/* Password field - only shown when admin is editing another user or creating new */}
              {isAdmin && (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Senha de Acesso (Opcional):
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                    <input
                      type="password"
                      placeholder="Deixe vazio para manter a atual"
                      value={userPassword}
                      onChange={(e) => setUserPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-medium"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Senha para login via e-mail. Se preenchida, o colaborador poderá usar tanto o Google quanto esta senha.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nível de Acesso (Cargo):
                  </label>
                  <select
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as Role)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="collaborator">Colaborador (Permissões Restritas)</option>
                    <option value="admin">Administrador (Acesso Total)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Filial Vinculada:
                  </label>
                  <select
                    value={userBranchId}
                    onChange={(e) => setUserBranchId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {userRole === 'collaborator' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2.5">
                  <label className="block font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider text-[11px]">
                    Módulos Liberados para o Colaborador:
                  </label>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.pdv}
                        onChange={() => togglePermission('pdv')}
                        className="rounded text-emerald-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Frente de Caixa (PDV)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.inventory}
                        onChange={() => togglePermission('inventory')}
                        className="rounded text-indigo-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Estoque & Produtos</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.crm}
                        onChange={() => togglePermission('crm')}
                        className="rounded text-amber-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Clientes & CRM</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.finance}
                        onChange={() => togglePermission('finance')}
                        className="rounded text-blue-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Financeiro & DRE</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer col-span-2">
                      <input
                        type="checkbox"
                        checked={userPermissions.dashboard}
                        onChange={() => togglePermission('dashboard')}
                        className="rounded text-purple-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Painel Executivo / Dashboard</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Salvar Colaborador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
