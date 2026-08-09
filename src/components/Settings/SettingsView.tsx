import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Settings,
  Building2,
  Printer as PrinterIcon,
  Store,
  Save,
  Plus,
  Trash2,
  Edit2,
  Users,
  Check,
  CheckCircle,
  AlertCircle,
  X,
  Lock,
  Mail,
  UserPlus,
  MessageCircle,
  Tv,
  Smartphone,
  Copy,
  Megaphone,
  ArrowUp,
  ArrowDown,
  Circle,
  Star,
  Loader2,
  MonitorPlay,
  Palette,
  UtensilsCrossed,
  QrCode,
  Eye,
  FileText,
  Download,
} from 'lucide-react';
import { SystemSettings, StoreBranch, UserProfile, Role, UserPermissions, FooterMessage, Printer, PrinterRole, MediaDevice, BranchTheme, Category, Table, DigitalMenuConfig } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { printTestPage } from '../../services/printService';
import { callServerApi } from '../../lib/serverApi';
import { friendlyErrorMessage } from '../../lib/friendlyError';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { BranchCheck } from '../Admin/BranchCheck';

interface SettingsViewProps {
  settings: SystemSettings;
  branches: StoreBranch[];
  categories: Category[];
  user: UserProfile;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, branches, categories, user }) => {
  const isAdmin = user.role === 'admin';
  const [activeSubTab, setActiveSubTab] = useState<'fiscal' | 'branches' | 'collaborators' | 'tv' | 'appearance' | 'cardapio'>(() => {
    const saved = sessionStorage.getItem('settings_active_tab');
    return (saved as typeof activeSubTab) || 'fiscal';
  });

  // Persist tab on change
  const handleSetActiveSubTab = (tab: typeof activeSubTab) => {
    setActiveSubTab(tab);
    sessionStorage.setItem('settings_active_tab', tab);
  };

  // Inline message state (replaces browser alert())
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (successMessage) {
      const t = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(t);
    }
  }, [successMessage]);

  useEffect(() => {
    if (errorMessage) {
      const t = setTimeout(() => setErrorMessage(null), 4000);
      return () => clearTimeout(t);
    }
  }, [errorMessage]);

  // Fiscal & General Settings State
  const [tradeName, setTradeName] = useState(settings.tradeName);
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [cnpj, setCnpj] = useState(settings.cnpj);
  const [ie, setIe] = useState(settings.ie);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [printerPaperSize, setPrinterPaperSize] = useState<'80mm' | '58mm'>(settings.printerPaperSize || '80mm');
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(settings.autoPrintReceipt);

  // Loading states
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [savingBranch, setSavingBranch] = useState(false);
  const [savingUser, setSavingUser] = useState(false);
  const [savingTv, setSavingTv] = useState(false);

  // TV Showcase Settings State
  const [tvSlideSpeed, setTvSlideSpeed] = useState(settings.tvSlideSpeed || 6);
  const [tvDisplayMode, setTvDisplayMode] = useState<'single' | 'grid'>(settings.tvDisplayMode || 'single');

  // Appearance / Theme State (paleta por filial)
  const existingTheme = storageService.getBranchTheme();
  const [themePrimary, setThemePrimary] = useState(existingTheme?.primaryColor || '#4f46e5');
  const [themeSecondary, setThemeSecondary] = useState(existingTheme?.secondaryColor || '#6366f1');
  const [themeAccent, setThemeAccent] = useState(existingTheme?.accentColor || '#f59e0b');
  const [themeBg, setThemeBg] = useState(existingTheme?.bgColor || '#09090b');
  const [savingTheme, setSavingTheme] = useState(false);

  // Cardápio Digital / Mesas State
  const [tables, setTables] = useState<Table[]>(storageService.getTables());
  const [menuConfig, setMenuConfig] = useState<DigitalMenuConfig | null>(storageService.getDigitalMenuConfig());
  const [tableName, setTableName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [savingTable, setSavingTable] = useState(false);
  const [savingMenuConfig, setSavingMenuConfig] = useState(false);
  const [menuTitle, setMenuTitle] = useState(menuConfig?.title || 'Cardápio Digital');
  const [menuSubtitle, setMenuSubtitle] = useState(menuConfig?.subtitle || '');
  const [menuLayout, setMenuLayout] = useState<'grid' | 'list'>(menuConfig?.layoutMode || 'grid');
  const [menuShowPrices, setMenuShowPrices] = useState(menuConfig?.showPrices !== false);

  // Rodapé da TV — mensagens sincronizadas (tabela footer_messages)
  const [footerMessages, setFooterMessages] = useState<FooterMessage[]>(storageService.getFooterMessages());
  const [newFooterMessage, setNewFooterMessage] = useState('');

  // ── Dispositivos de TV / vitrine (media_devices) ────────────────────
  const [mediaDevicesList, setMediaDevicesList] = useState<MediaDevice[]>(storageService.getMediaDevices());
  const [tvDeviceName, setTvDeviceName] = useState('');
  const [tvDeviceType, setTvDeviceType] = useState<'tv' | 'vitrine'>('tv');
  const [editingFooterId, setEditingFooterId] = useState<string | null>(null);
  const [editingFooterText, setEditingFooterText] = useState('');

  // Impressoras térmicas (tabela printers)
  const [printersList, setPrintersList] = useState<Printer[]>(storageService.getPrinters());
  const [printerName, setPrinterName] = useState('');
  const [printerModel, setPrinterModel] = useState('');
  const [printerTransport, setPrinterTransport] = useState<Printer['transport']>('webusb');
  const [printerRole, setPrinterRole] = useState<PrinterRole>('caixa');
  const [printerCategory, setPrinterCategory] = useState<string>('');
  const [printerIp, setPrinterIp] = useState('');
  const [printerPort, setPrinterPort] = useState('');
  const [printerIsDefault, setPrinterIsDefault] = useState(false);
  const [testingPrinterId, setTestingPrinterId] = useState<string | null>(null);

  // ── PIX Config per branch ───────────────────────────────────
  const currentBranchId = storageService.getSelectedBranchId();

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
  const [userWhatsapp, setUserWhatsapp] = useState('');
  const [userBranchId, setUserBranchId] = useState(branches[0]?.id || 'br-01');

  // Holerite Modal State
  const [isHoleriteModalOpen, setIsHoleriteModalOpen] = useState(false);
  const [holeriteUser, setHoleriteUser] = useState<UserProfile | null>(null);
  const [holeriteSalary, setHoleriteSalary] = useState(0);
  const [holeriteTransportation, setHoleriteTransportation] = useState(0);
  const [holeriteMeal, setHoleriteMeal] = useState(0);
  const [holeriteOtherBenefits, setHoleriteOtherBenefits] = useState(0);
  const [holeriteInss, setHoleriteInss] = useState(0);
  const [holeriteIr, setHoleriteIr] = useState(0);
  const [holeriteOtherDiscounts, setHoleriteOtherDiscounts] = useState(0);
  const [userPermissions, setUserPermissions] = useState<UserPermissions>({
    pdv: true,
    inventory: true,
    crm: true,
    finance: false,
    dashboard: false,
    settings: false,
    comanda: false,
    kds: false,
    cardapioDigital: false,
  });
  const [userPassword, setUserPassword] = useState('');
  // Senha gerada pelo servidor ao criar um usuário novo (exibida UMA vez)
  const [createdUserPassword, setCreatedUserPassword] = useState<string | null>(null);

  const branchFirstInputRef = useRef<HTMLInputElement>(null);
  const userFirstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isBranchModalOpen && branchFirstInputRef.current) {
      branchFirstInputRef.current.focus();
    }
  }, [isBranchModalOpen]);

  useEffect(() => {
    if (isUserModalOpen && userFirstInputRef.current) {
      userFirstInputRef.current.focus();
    }
  }, [isUserModalOpen]);

  const refreshUsersList = () => {
    setUsersList(storageService.getUsers());
  };

  const handleSaveFiscal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tradeName.trim() || !cnpj.trim()) {
      setErrorMessage('Nome fantasia e CNPJ são obrigatórios.');
      return;
    }
    setSavingFiscal(true);
    try {
      const updated: SystemSettings = {
        ...settings,
        tradeName: tradeName.trim(),
        companyName: companyName.trim(),
        cnpj: cnpj.trim(),
        ie: ie.trim(),
        address: address.trim(),
        phone: phone.trim(),
        printerPaperSize,
        autoPrintReceipt,
      };

      storageService.saveSettings(updated);
      posAudio.chime();
      setSuccessMessage('Configurações salvas com sucesso!');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar as configurações. Tente novamente.'));
      posAudio.error();
    } finally {
      setSavingFiscal(false);
    }
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

  const handleSaveBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) {
      setErrorMessage('Nome da filial é obrigatório.');
      return;
    }
    if (!branchCode.trim()) {
      setErrorMessage('Código da filial é obrigatório.');
      return;
    }
    setSavingBranch(true);
    try {
      const orgId = storageService.getCurrentOrgId();
      const newBranch: StoreBranch = {
        id: editingBranch ? editingBranch.id : `br-${Date.now()}`,
        name: branchName.trim(),
        code: branchCode.trim(),
        cnpj: branchCnpj.trim(),
        city: branchCity.trim(),
        state: branchState.trim(),
        address: branchAddress.trim(),
        phone: branchPhone.trim(),
        isHeadquarters: branchIsHQ,
        active: true,
        organizationId: editingBranch?.organizationId || orgId,
      };

      // Filial NOVA: cria PRIMEIRO no Supabase via Pages Function
      // (service role — funciona para qualquer org, sem depender de RLS).
      // Só salva localmente se o cloud confirmar; senão mostra o erro.
      if (!editingBranch) {
        const { data, error } = await callServerApi<{
          success: boolean;
          branch_id?: string;
          message?: string;
        }>('/api/admin/create-branch', {
          name: newBranch.name,
          code: newBranch.code,
          organization_id: orgId,
          cnpj: newBranch.cnpj || null,
          city: newBranch.city || null,
          state: newBranch.state || null,
          address: newBranch.address || null,
          phone: newBranch.phone || null,
          is_headquarters: newBranch.isHeadquarters,
          active: newBranch.active,
        });
        if (!data?.success) {
          setErrorMessage(`Não foi possível criar a filial no Supabase: ${error || data?.message || 'erro desconhecido'}`);
          posAudio.error();
          return;
        }
        if (data.branch_id) newBranch.id = data.branch_id;
      }

      storageService.saveBranch(newBranch);
      setIsBranchModalOpen(false);
      posAudio.chime();
      setSuccessMessage(`Filial "${newBranch.name}" salva com sucesso.`);
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar a filial. Tente novamente.'));
      posAudio.error();
    } finally {
      setSavingBranch(false);
    }
  };

  const [confirmDeleteBranch, setConfirmDeleteBranch] = useState<StoreBranch | null>(null);
  const handleConfirmDeleteBranch = () => {
    const branch = confirmDeleteBranch;
    if (!branch) return;
    setConfirmDeleteBranch(null);
    if (branches.length <= 1) {
      setErrorMessage('O sistema precisa de pelo menos 1 filial cadastrada.');
      return;
    }
    try {
      storageService.deleteBranch(branch.id);
      posAudio.chime();
      setSuccessMessage('Filial excluída.');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível excluir a filial. Tente novamente.'));
      posAudio.error();
    }
  };

  // User / Collaborator Handlers
  const handleOpenUserModal = (u?: UserProfile) => {
    setCreatedUserPassword(null);
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

  // ── Holerite Modal ─────────────────────────────────────────────
  const handleOpenHoleriteModal = (u: UserProfile) => {
    setHoleriteUser(u);
    setHoleriteSalary(u.salary || 0);
    setHoleriteTransportation(u.transportationAllowance || 0);
    setHoleriteMeal(u.mealAllowance || 0);
    setHoleriteOtherBenefits(u.otherBenefits || 0);
    setHoleriteInss(u.inssDiscount || 0);
    setHoleriteIr(u.irDiscount || 0);
    setHoleriteOtherDiscounts(u.otherDiscounts || 0);
    setIsHoleriteModalOpen(true);
  };

  const handleSaveHolerite = () => {
    if (!holeriteUser) return;
    const updated: UserProfile = {
      ...holeriteUser,
      salary: holeriteSalary,
      transportationAllowance: holeriteTransportation,
      mealAllowance: holeriteMeal,
      otherBenefits: holeriteOtherBenefits,
      inssDiscount: holeriteInss,
      irDiscount: holeriteIr,
      otherDiscounts: holeriteOtherDiscounts,
    };
    storageService.saveUserProfile(updated);
    setIsHoleriteModalOpen(false);
    setHoleriteUser(null);
    refreshUsersList();
    posAudio.chime();
    addToast('success', `Holerite de ${updated.name} salvo com sucesso.`);
  };

  const handleShareWhatsApp = () => {
    if (!holeriteUser?.whatsapp) {
      addToast('error', 'WhatsApp não cadastrado para este colaborador.');
      return;
    }
    const totalBenefits = holeriteSalary + holeriteTransportation + holeriteMeal + holeriteOtherBenefits;
    const totalDiscounts = holeriteInss + holeriteIr + holeriteOtherDiscounts;
    const netValue = totalBenefits - totalDiscounts;
    const msg = `*Holerite - ${holeriteUser.name}*\n\n` +
      `💰 Salário: R$ ${holeriteSalary.toFixed(2)}\n` +
      `🚌 VT: R$ ${holeriteTransportation.toFixed(2)}\n` +
      `🍽️ VR: R$ ${holeriteMeal.toFixed(2)}\n` +
      `📦 Outros: R$ ${holeriteOtherBenefits.toFixed(2)}\n` +
      `─────────────────\n` +
      `➕ Total Bruto: R$ ${totalBenefits.toFixed(2)}\n` +
      `➖ Descontos: R$ ${totalDiscounts.toFixed(2)}\n` +
      `─────────────────\n` +
      `💵 Líquido: R$ ${netValue.toFixed(2)}`;
    const url = `https://wa.me/55${holeriteUser.whatsapp}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  const handleGeneratePDF = () => {
    if (!holeriteUser) return;
    const totalBenefits = holeriteSalary + holeriteTransportation + holeriteMeal + holeriteOtherBenefits;
    const totalDiscounts = holeriteInss + holeriteIr + holeriteOtherDiscounts;
    const netValue = totalBenefits - totalDiscounts;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Holerite - ${holeriteUser.name}</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
          h1 { color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px; }
          .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
          .section { margin-bottom: 20px; }
          .section h2 { color: #059669; font-size: 14px; margin-bottom: 10px; }
          .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
          .row:last-child { border-bottom: none; }
          .label { color: #6b7280; }
          .value { font-weight: bold; }
          .total-bruto { color: #059669; }
          .total-descontos { color: #dc2626; }
          .liquido { color: #059669; font-size: 18px; border-top: 2px solid #059669; padding-top: 10px; margin-top: 20px; }
          .footer { margin-top: 40px; text-align: center; color: #9ca3af; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>🧾 Holerite</h1>
        <div class="header">
          <div><strong>Colaborador:</strong> ${holeriteUser.name}</div>
          <div><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</div>
        </div>
        <div class="section">
          <h2>BENEFÍCIOS</h2>
          <div class="row"><span class="label">Salário Base</span><span class="value">R$ ${holeriteSalary.toFixed(2)}</span></div>
          <div class="row"><span class="label">Vale Transporte</span><span class="value">R$ ${holeriteTransportation.toFixed(2)}</span></div>
          <div class="row"><span class="label">Vale Refeição</span><span class="value">R$ ${holeriteMeal.toFixed(2)}</span></div>
          <div class="row"><span class="label">Outros Benefícios</span><span class="value">R$ ${holeriteOtherBenefits.toFixed(2)}</span></div>
        </div>
        <div class="section">
          <h2>DESCONTOS</h2>
          <div class="row"><span class="label">INSS</span><span class="value">- R$ ${holeriteInss.toFixed(2)}</span></div>
          <div class="row"><span class="label">Imposto de Renda</span><span class="value">- R$ ${holeriteIr.toFixed(2)}</span></div>
          <div class="row"><span class="label">Outros Descontos</span><span class="value">- R$ ${holeriteOtherDiscounts.toFixed(2)}</span></div>
        </div>
        <div class="liquido">
          <div class="row"><span class="label">Total Bruto</span><span class="value total-bruto">R$ ${totalBenefits.toFixed(2)}</span></div>
          <div class="row"><span class="label">Total Descontos</span><span class="value total-descontos">- R$ ${totalDiscounts.toFixed(2)}</span></div>
          <div class="row"><span class="label">LÍQUIDO A RECEBER</span><span class="value">R$ ${netValue.toFixed(2)}</span></div>
        </div>
        <div class="footer">
          <p>Documento gerado automaticamente pelo HD-System</p>
        </div>
      </body>
      </html>
    `;
    
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => {
        printWindow.print();
      }, 500);
    }
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim()) {
      setErrorMessage('Nome do usuário é obrigatório.');
      return;
    }
    if (!userEmail.includes('@')) {
      setErrorMessage('Por favor, informe um e-mail de usuário válido.');
      return;
    }

    setSavingUser(true);
    try {
      const orgId = storageService.getCurrentOrgId();
      const newUser: UserProfile = {
        id: editingUser ? editingUser.id : `usr-${Date.now()}`,
        name: userName.trim(),
        email: userEmail.trim().toLowerCase(),
        role: userRole,
        avatarUrl: editingUser?.avatarUrl || `https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150`,
        organizationId: orgId,
        storeBranchId: userBranchId,
        whatsapp: userWhatsapp.trim() || undefined,
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

      // Usuário NOVO: cria PRIMEIRO no Supabase via Pages Function
      // (Supabase Auth + system_users com service role — ignora RLS).
      // Só salva localmente se o cloud confirmar; senão mostra o erro.
      if (!editingUser) {
        // Filial vinculada precisa ser UUID válido (ex.: sem filial cadastrada
        // o fallback "br-01" era rejeitado pelo banco em silêncio).
        let branchId = userBranchId;
        if (branchId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(branchId)) {
          const matched = branches.find((b) => b.code === branchId || b.id === branchId);
          branchId = matched?.id || '';
        }
        if (!branchId) {
          setErrorMessage('Cadastre pelo menos uma filial nesta organização antes de criar usuários.');
          posAudio.error();
          return;
        }

        const { data, error } = await callServerApi<{
          success: boolean;
          user_id?: string;
          password?: string;
          message?: string;
        }>('/api/admin/create-user', {
          name: newUser.name,
          email: newUser.email,
          role: newUser.role,
          organization_id: orgId,
          store_branch_id: branchId,
        });
        if (!data?.success) {
          setErrorMessage(`Não foi possível criar o usuário no Supabase: ${error || data?.message || 'erro desconhecido'}`);
          posAudio.error();
          return;
        }
        if (data.user_id) newUser.id = data.user_id;
        if (data.password) {
          setCreatedUserPassword(data.password);
          return; // mantém o modal aberto para o usuário copiar a senha
        }
      }

      storageService.saveUser(newUser);
      refreshUsersList();
      setIsUserModalOpen(false);
      posAudio.chime();
      setSuccessMessage(`Usuário "${newUser.name}" salvo com sucesso.`);
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar o usuário. Tente novamente.'));
      posAudio.error();
    } finally {
      setSavingUser(false);
    }
  };

  const [confirmDeleteUser, setConfirmDeleteUser] = useState<UserProfile | null>(null);
  const handleConfirmDeleteUser = () => {
    const target = confirmDeleteUser;
    if (!target) return;
    setConfirmDeleteUser(null);
    if (target.id === user.id) {
      setErrorMessage('Você não pode excluir sua própria conta atualmente logada.');
      return;
    }
    try {
      storageService.deleteUser(target.id);
      refreshUsersList();
      posAudio.chime();
      setSuccessMessage('Usuário excluído.');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível excluir o usuário. Tente novamente.'));
      posAudio.error();
    }
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setUserPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSaveTv = () => {
    setSavingTv(true);
    try {
      const updated: SystemSettings = {
        ...settings,
        tvSlideSpeed,
        tvDisplayMode,
      };
      storageService.saveSettings(updated);
      posAudio.chime();
      setSuccessMessage('Configurações da TV salvas!');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar as configurações da TV.'));
      posAudio.error();
    } finally {
      setSavingTv(false);
    }
  };

  // ── Tema / Paleta de cores por filial ───────────────────────────
  const handleSaveTheme = () => {
    setSavingTheme(true);
    try {
      storageService.saveBranchTheme({
        id: existingTheme?.id || crypto.randomUUID(),
        primaryColor: themePrimary,
        secondaryColor: themeSecondary,
        accentColor: themeAccent,
        bgColor: themeBg,
        logoUrl: existingTheme?.logoUrl || undefined,
        faviconUrl: existingTheme?.faviconUrl || undefined,
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
        updatedAt: new Date().toISOString(),
      });
      posAudio.chime();
      setSuccessMessage('Paleta de cores salva! Recarregue para ver o efeito completo.');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar a paleta de cores.'));
      posAudio.error();
    } finally {
      setSavingTheme(false);
    }
  };

  // ── Cardápio Digital: CRUD de mesas ─────────────────────────────
  const handleAddTable = () => {
    if (!tableName.trim()) {
      setErrorMessage('Informe o nome/número da mesa.');
      return;
    }
    setSavingTable(true);
    try {
      const newTable: Table = {
        id: crypto.randomUUID(),
        name: tableName.trim(),
        number: tableNumber ? parseInt(tableNumber) : undefined,
        qrToken: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        status: 'active',
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storageService.saveTable(newTable);
      setTables(storageService.getTables());
      setTableName('');
      setTableNumber('');
      posAudio.chime();
      setSuccessMessage(`Mesa "${newTable.name}" adicionada!`);
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível adicionar a mesa.'));
      posAudio.error();
    } finally {
      setSavingTable(false);
    }
  };

  const handleDeleteTable = (id: string) => {
    try {
      // Encontrar a mesa antes de deletar para pegar o token
      const table = tables.find((t) => t.id === id);
      if (table) {
        // Usar o método do storageService para deletar (sync com cloud)
        storageService.deleteTable(id);
        setTables(storageService.getTables());
        posAudio.chime();
        setSuccessMessage(`Mesa "${table.name}" removida.`);
      }
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível remover a mesa.'));
      posAudio.error();
    }
  };

  // ── Imprimir QR Code da mesa ──────────────────────────────────
  const [qrModalTable, setQrModalTable] = useState<Table | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  // Generate QR code when modal opens
  useEffect(() => {
    if (qrModalTable) {
      const baseUrl = window.location.origin + window.location.pathname;
      const menuUrl = `${baseUrl}#/mesa/${qrModalTable.qrToken}`;
      QRCode.toDataURL(menuUrl, { width: 300, margin: 2 })
        .then((url: string) => setQrCodeDataUrl(url))
        .catch(() => setQrCodeDataUrl(''));
    }
  }, [qrModalTable]);

  const handlePrintQRCode = (table: Table) => {
    setQrModalTable(table);
  };

  const handlePrintFromModal = () => {
    if (!qrModalTable) return;
    const baseUrl = window.location.origin + window.location.pathname;
    const menuUrl = `${baseUrl}#/mesa/${qrModalTable.qrToken}`;
    const printWindow = window.open('', '_blank', 'width=400,height=500');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html><html><head><title>QR - ${qrModalTable.name}</title>
        <style>body{font-family:sans-serif;text-align:center;padding:20px}.qr-box{border:2px dashed #ccc;padding:20px;border-radius:12px}</style>
        </head><body>
        <h2>${qrModalTable.name}</h2>
        <div class="qr-box">
          <img src="${qrCodeDataUrl}" width="200" height="200" />
          <p style="font-size:10px;word-break:break-all">${menuUrl}</p>
        </div>
        <p>Escaneie para acessar o cardápio</p>
        <script>window.onload=function(){window.print()}</script>
        </body></html>
      `);
      printWindow.document.close();
    }
    setQrModalTable(null);
  };

  // ── Imprimir todos os QR Codes (folha A4) ──────────────────────
  const handlePrintAllQRCodes = () => {
    if (tables.length === 0) return;
    const baseUrl = window.location.origin + window.location.pathname;

    // Generate QR codes using api.qrserver.com
    const qrCodeSize = 150;
    const qrCodeCells = tables.map((table) => {
      const menuUrl = `${baseUrl}#/mesa/${table.qrToken}`;
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=${qrCodeSize}x${qrCodeSize}&data=${encodeURIComponent(menuUrl)}`;
      return `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px;border:1px dashed #ccc;border-radius:8px;break-inside:avoid;">
          <img src="${qrUrl}" width="${qrCodeSize}" height="${qrCodeSize}" alt="QR" />
          <p style="font-size:11px;font-weight:bold;margin:8px 0 4px;">${table.name}</p>
          <p style="font-size:9px;color:#666;margin:0;">Escaneie para acessar o cardápio</p>
        </div>
      `;
    }).join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Todos os QR Codes</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: sans-serif; margin: 0; padding: 0; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; max-width: 100%; }
          @media print { .grid { page-break-inside: auto; } }
        </style>
      </head>
      <body>
        <div class="grid">${qrCodeCells}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(html);
      printWindow.document.close();
    }
  };

  // ── Cardápio Digital: configuração ──────────────────────────────
  const handleSaveMenuConfig = () => {
    setSavingMenuConfig(true);
    try {
      const config: DigitalMenuConfig = {
        id: menuConfig?.id || crypto.randomUUID(),
        title: menuTitle || 'Cardápio Digital',
        subtitle: menuSubtitle || undefined,
        layoutMode: menuLayout,
        showPrices: menuShowPrices,
        storeBranchId: user.storeBranchId,
        organizationId: user.organizationId,
        updatedAt: new Date().toISOString(),
      };
      storageService.saveDigitalMenuConfig(config);
      setMenuConfig(config);
      posAudio.chime();
      setSuccessMessage('Configurações do cardápio salvas!');
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível salvar as configurações.'));
      posAudio.error();
    } finally {
      setSavingMenuConfig(false);
    }
  };

  // ── Mensagens do rodapé da TV (footer_messages) ──────────────────────
  const refreshFooterMessages = () => setFooterMessages(storageService.getFooterMessages());

  const handleAddFooterMessage = () => {
    const text = newFooterMessage.trim();
    if (!text) {
      setErrorMessage('Digite o texto da mensagem.');
      return;
    }
    const msg: FooterMessage = {
      id: crypto.randomUUID(),
      message: text,
      active: true,
      sortOrder: storageService.getFooterMessages().length * 10,
    };
    storageService.saveFooterMessage(msg);
    setNewFooterMessage('');
    refreshFooterMessages();
    posAudio.chime();
    setSuccessMessage('Mensagem do rodapé adicionada!');
  };

  const handleStartEditFooter = (m: FooterMessage) => {
    setEditingFooterId(m.id);
    setEditingFooterText(m.message);
  };

  const handleSaveEditFooter = () => {
    const text = editingFooterText.trim();
    if (!text) return;
    const target = footerMessages.find((m) => m.id === editingFooterId);
    if (target) {
      storageService.saveFooterMessage({ ...target, message: text });
      posAudio.chime();
    }
    setEditingFooterId(null);
    refreshFooterMessages();
  };

  const handleToggleFooterMessage = (m: FooterMessage) => {
    storageService.saveFooterMessage({ ...m, active: !m.active });
    refreshFooterMessages();
  };

  const handleDeleteFooterMessage = (id: string) => {
    storageService.deleteFooterMessage(id);
    if (editingFooterId === id) setEditingFooterId(null);
    refreshFooterMessages();
    posAudio.chime();
    setSuccessMessage('Mensagem removida.');
  };

  const handleMoveFooter = (idx: number, dir: -1 | 1) => {
    const sorted = [...footerMessages].sort((a, b) => a.sortOrder - b.sortOrder);
    const target = idx + dir;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[target];
    const aOrder = a.sortOrder;
    storageService.saveFooterMessage({ ...a, sortOrder: b.sortOrder });
    storageService.saveFooterMessage({ ...b, sortOrder: aOrder });
    refreshFooterMessages();
  };

  // ── Dispositivos de TV / vitrine (media_devices) ────────────────────
  const refreshMediaDevices = () => setMediaDevicesList(storageService.getMediaDevices());

  const handleAddMediaDevice = () => {
    const name = tvDeviceName.trim();
    if (!name) {
      setErrorMessage('Informe o nome do dispositivo (ex.: TV do Balcão).');
      return;
    }
    // Gera código de pareamento de 6 dígitos único na organização.
    const existing = storageService.getMediaDevices().map((d) => d.pairingCode);
    let code = '';
    do {
      code = String(Math.floor(100000 + Math.random() * 900000));
    } while (existing.includes(code));

    const device: MediaDevice = {
      id: crypto.randomUUID(),
      name,
      deviceType: tvDeviceType,
      pairingCode: code,
      active: true,
      status: 'pending',
    };
    storageService.saveMediaDevice(device);
    setTvDeviceName('');
    refreshMediaDevices();
    posAudio.chime();
    setSuccessMessage(`TV cadastrada! Código de pareamento: ${code} — digite-o na tela "Conectar TV".`);
  };

  const handleDeleteMediaDevice = (id: string) => {
    storageService.deleteMediaDevice(id);
    refreshMediaDevices();
    posAudio.chime();
    setSuccessMessage('Dispositivo de TV removido.');
  };

  const handleCopyPairingCode = (code: string) => {
    navigator.clipboard.writeText(code).catch(() => {});
    posAudio.click();
    setSuccessMessage(`Código ${code} copiado — digite-o na tela "Conectar TV".`);
  };

  // ── Impressoras térmicas (printers) ─────────────────────────────────
  const PRINTER_TRANSPORT_LABELS: Record<string, string> = {
    webusb: 'USB (WebUSB)',
    serial: 'Serial / USB-CDC',
    network: 'Rede (IP)',
    os: 'Sistema',
  };

  const refreshPrinters = () => setPrintersList(storageService.getPrinters());

  const handleAddPrinter = () => {
    if (!printerName.trim()) {
      setErrorMessage('Informe o nome da impressora.');
      return;
    }
    const p: Printer = {
      id: crypto.randomUUID(),
      name: printerName.trim(),
      model: printerModel.trim() || undefined,
      transport: printerTransport,
      role: printerRole,
      categoryId: printerCategory || undefined,
      ipAddress: printerTransport === 'network' ? printerIp.trim() : undefined,
      port: printerTransport === 'network' && printerPort ? parseInt(printerPort) : undefined,
      // A primeira impressora da filial vira padrão automaticamente.
      isDefault: printerIsDefault || printersList.length === 0,
      status: 'offline',
    };
    storageService.savePrinter(p);
    setPrinterName('');
    setPrinterModel('');
    setPrinterIp('');
    setPrinterPort('');
    setPrinterIsDefault(false);
    setPrinterRole('caixa');
    setPrinterCategory('');
    refreshPrinters();
    posAudio.chime();
    setSuccessMessage('Impressora cadastrada!');
  };

  const handleDeletePrinter = (id: string) => {
    storageService.deletePrinter(id);
    refreshPrinters();
    posAudio.chime();
    setSuccessMessage('Impressora removida.');
  };

  const handleSetDefaultPrinter = (p: Printer) => {
    // Só uma impressora padrão por filial (constraint no banco) — desmarca as demais.
    storageService
      .getPrinters()
      .filter((x) => x.id !== p.id && x.isDefault)
      .forEach((x) => storageService.savePrinter({ ...x, isDefault: false }));
    if (!p.isDefault) {
      storageService.savePrinter({ ...p, isDefault: true });
    }
    refreshPrinters();
    posAudio.chime();
    setSuccessMessage('Impressora padrão atualizada!');
  };

  const handleTestPrinter = async (p: Printer) => {
    setTestingPrinterId(p.id);
    try {
      await printTestPage(p);
      setSuccessMessage('Página de teste enviada para a impressora!');
      posAudio.chime();
    } catch (err: any) {
      setErrorMessage(friendlyErrorMessage(err, 'Não foi possível imprimir o teste.'));
      posAudio.error();
    } finally {
      setTestingPrinterId(null);
    }
  };

  return (
    <div className="p-3 sm:p-4 md:p-6 max-w-6xl mx-auto space-y-4 sm:space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
              Configurações
            </h2>
          <p className="text-xs text-slate-500">
            Gerencie dados fiscais, filiais e equipe do sistema
          </p>
        </div>

        {/* Sub-tab pills */}
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-200/80 dark:bg-[#18181b] p-1 rounded-2xl border border-slate-300 dark:border-[#27272a] text-xs font-bold shrink-0">
          <button
            onClick={() => handleSetActiveSubTab('fiscal')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'fiscal'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>Dados & Impressora</span>
          </button>

          <button
            onClick={() => handleSetActiveSubTab('branches')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'branches'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Filiais ({branches.length})</span>
          </button>

          <button
            onClick={() => handleSetActiveSubTab('collaborators')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'collaborators'
                ? 'bg-white dark:bg-[#27272a] text-indigo-600 dark:text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-500" />
            <span>Equipe ({usersList.length})</span>
          </button>

          <button
            onClick={() => handleSetActiveSubTab('tv')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'tv'
                ? 'bg-white dark:bg-[#27272a] text-amber-600 dark:text-amber-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Tv className="w-4 h-4" />
            <span>TV / Vitrine</span>
          </button>
          <button
            onClick={() => handleSetActiveSubTab('appearance')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'appearance'
                ? 'bg-white dark:bg-[#27272a] text-pink-600 dark:text-pink-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Aparência</span>
          </button>
          <button
            onClick={() => handleSetActiveSubTab('cardapio')}
            className={`min-h-[44px] px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 ${
              activeSubTab === 'cardapio'
                ? 'bg-white dark:bg-[#27272a] text-teal-600 dark:text-teal-400 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <UtensilsCrossed className="w-4 h-4" />
            <span>Cardápio / Mesas</span>
          </button>
        </div>
      </div>

      {/* Inline Success / Error Messages */}
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2 mb-4">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}
      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

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
              <PrinterIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Impressão de Comprovantes</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
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

          {/* ── PRINTERS (impressoras térmicas) ─────────────────────── */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white border-b border-slate-200 dark:border-[#27272a] pb-3">
              <PrinterIcon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Impressoras Térmicas</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 ml-auto">
                Sincroniza em tempo real
              </span>
            </div>

            {/* Formulário de cadastro */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Nome da Impressora
                </label>
                <input
                  type="text"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                  placeholder="Ex.: Balcão Principal"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Setor (Roteamento)
                </label>
                <select
                  value={printerRole}
                  onChange={(e) => setPrinterRole(e.target.value as PrinterRole)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                >
                  <option value="caixa">Caixa</option>
                  <option value="cozinha">Cozinha</option>
                  <option value="bar">Bar</option>
                  <option value="outro">Outro</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Conexão
                </label>
                <select
                  value={printerTransport}
                  onChange={(e) => setPrinterTransport(e.target.value as Printer['transport'])}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                >
                  <option value="webusb">USB (WebUSB)</option>
                  <option value="serial">Serial / USB-CDC</option>
                  <option value="network">Rede (IP)</option>
                  <option value="os">Sistema (janela de impressão)</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                  Categoria (opcional)
                </label>
                <select
                  value={printerCategory}
                  onChange={(e) => setPrinterCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                >
                  <option value="">Todas as categorias</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
              </div>

              {printerTransport === 'network' ? (
                <>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                      Endereço IP
                    </label>
                    <input
                      type="text"
                      value={printerIp}
                      onChange={(e) => setPrinterIp(e.target.value)}
                      placeholder="192.168.0.50"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                      Porta
                    </label>
                    <input
                      type="number"
                      value={printerPort}
                      onChange={(e) => setPrinterPort(e.target.value)}
                      placeholder="9100"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </>
              ) : (
                <div>
                  <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">
                    Modelo (opcional)
                  </label>
                  <input
                    type="text"
                    value={printerModel}
                    onChange={(e) => setPrinterModel(e.target.value)}
                    placeholder="Ex.: Elgin i9"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] cursor-pointer">
                <input
                  type="checkbox"
                  checked={printerIsDefault}
                  onChange={(e) => setPrinterIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
                />
                Definir como padrão desta filial
              </label>
              <button
                type="button"
                onClick={handleAddPrinter}
                disabled={!printerName.trim()}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar Impressora
              </button>
            </div>

            {/* Lista de impressoras */}
            <div className="space-y-2">
              {printersList.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                  <div className="relative">
                    <PrinterIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ${
                      p.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
                    }`} title={p.status === 'online' ? 'Conectada' : 'Desconectada'} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      {p.name}
                      {p.isDefault && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                          Padrão
                        </span>
                      )}
                      {p.role && p.role !== 'caixa' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30 uppercase">
                          {p.role}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-[#71717a] truncate">
                      {PRINTER_TRANSPORT_LABELS[p.transport] || p.transport}
                      {p.model ? ` • ${p.model}` : ''}
                      {p.ipAddress ? ` • ${p.ipAddress}:${p.port || 9100}` : ''}
                      {p.categoryId ? ` • Categoria específica` : ''}
                    </p>
                  </div>

                  {!p.isDefault && (
                    <button
                      onClick={() => handleSetDefaultPrinter(p)}
                      className="p-2 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-500/10"
                      title="Tornar impressora padrão"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    onClick={() => handleTestPrinter(p)}
                    disabled={testingPrinterId === p.id}
                    className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-500/10 disabled:opacity-50"
                    title="Imprimir página de teste"
                  >
                    {testingPrinterId === p.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <PrinterIcon className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => handleDeletePrinter(p.id)}
                    className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"
                    title="Excluir impressora"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}

              {printersList.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-[#71717a] py-3 text-center">
                  Nenhuma impressora cadastrada — a venda usa a janela de impressão do navegador.
                </p>
              )}
            </div>

            <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
              <strong>Dica:</strong> para impressão direta, cadastre uma impressora USB (WebUSB) ou Serial e clique no
              teste ao lado — o navegador pede o pareamento na primeira vez (Chrome/Edge). No primeiro clique de "Imprimir
              Recibo", a térmica é usada; sem impressora pareada, abre a janela de impressão do sistema.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingFiscal}
              className="min-h-[44px] px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>{savingFiscal ? 'Salvando...' : 'Salvar Parâmetros do Sistema'}</span>
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
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2 shrink-0"
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
                      className="min-h-[44px] min-w-[44px] p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                      title="Editar Filial"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDeleteBranch(b)}
                        className="min-h-[44px] min-w-[44px] p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-500 transition-colors"
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
              className="min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-600/20 transition-all flex items-center gap-2 shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Adicionar Colaborador Google</span>
            </button>
          </div>

          {/* Tabela responsiva - scroll horizontal em telas menores */}
          <div className="bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="bg-slate-50 dark:bg-[#09090b] text-slate-500 dark:text-[#71717a] font-bold uppercase tracking-wider border-b border-slate-200 dark:border-[#27272a]">
                  <tr>
                    <th className="px-4 py-3.5">Colaborador</th>
                    <th className="px-4 py-3.5">E-mail</th>
                    <th className="px-4 py-3.5">Cargo</th>
                    <th className="px-4 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#27272a]">
                  {usersList.map((u) => {
                    const isAdmin = u.role === 'admin';
                    return (
                      <tr
                        key={u.id}
                        className="hover:bg-slate-50/50 dark:hover:bg-[#27272a]/30 transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <img
                              src={u.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100'}
                              alt={u.name}
                              className="w-8 h-8 rounded-full object-cover ring-2 ring-slate-200 dark:ring-slate-800"
                            />
                            <span className="font-bold text-slate-900 dark:text-white whitespace-nowrap">{u.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-[#a1a1aa]">
                          <span className="truncate max-w-[150px] block">{u.email}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-[9px] font-extrabold px-2 py-1 rounded-full border ${
                              isAdmin
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isAdmin ? 'ADMIN' : 'COLAB'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenHoleriteModal(u)}
                              className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors"
                              title="Holerite"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleOpenUserModal(u)}
                              className="p-2 rounded-lg bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors"
                              title="Editar"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            {isAdmin && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConfirmDeleteUser({ id: u.id, name: u.name });
                                }}
                                className="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 transition-colors"
                                title="Excluir"
                              >
                                <Trash2 className="w-4 h-4" />
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
                      className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-indigo-500/10 text-slate-700 dark:text-slate-200 hover:text-indigo-600 transition-colors text-[11px] font-bold"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => setConfirmDeleteUser(u)}
                        className="flex-1 min-h-[44px] flex items-center justify-center gap-1.5 p-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-rose-500/10 text-slate-700 dark:text-slate-200 hover:text-rose-500 transition-colors text-[11px] font-bold"
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
                    ref={branchFirstInputRef}
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
                  className="min-h-[44px] px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingBranch}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold disabled:opacity-60"
                >
                  {savingBranch ? 'Salvando...' : 'Salvar Filial'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL COLLABORATOR --- */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-500" />
                <span>{editingUser ? 'Editar Colaborador/Administrador' : 'Novo Colaborador/Administrador'}</span>
              </h3>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {createdUserPassword ? (
              <div className="space-y-4 text-xs">
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">✅ Usuário criado com sucesso!</p>
                  <p className="text-xs text-slate-500 dark:text-[#a1a1aa] mt-1">
                    O usuário <strong>{userName}</strong> pode logar em qualquer dispositivo com a senha abaixo.
                  </p>
                </div>
                <div className="space-y-2.5 bg-slate-50 dark:bg-[#09090b] rounded-2xl p-4 border border-slate-200 dark:border-[#27272a]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 dark:text-[#71717a]">Senha temporária:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-lg">{createdUserPassword}</span>
                      <button
                        type="button"
                        onClick={() => { navigator.clipboard?.writeText(createdUserPassword); setSuccessMessage('Senha copiada!'); }}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-[#27272a] transition-colors"
                      >
                        <Copy className="w-3.5 h-3.5 text-slate-400" />
                      </button>
                    </div>
                  </div>
                </div>
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-400 space-y-1">
                  <p>⚠️ A senha <strong>não fica salva</strong> — copie agora e envie para o usuário.</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setIsUserModalOpen(false); refreshUsersList(); }}
                  className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-all"
                >
                  Fechar
                </button>
              </div>
            ) : (
            <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nome Completo do Colaborador:
                </label>
                <input
                  ref={userFirstInputRef}
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
                  E-mail:
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
                  E-mail para login no sistema.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  WhatsApp (com DDD):
                </label>
                <div className="relative">
                  <MessageCircle className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="ex: 11999999999"
                    value={userWhatsapp || ''}
                    onChange={(e) => setUserWhatsapp(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Número do WhatsApp para compartilhar holerite.
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

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.comanda}
                        onChange={() => togglePermission('comanda')}
                        className="rounded text-orange-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Comandas / Mesas</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={userPermissions.kds}
                        onChange={() => togglePermission('kds')}
                        className="rounded text-red-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">KDS (Cozinha)</span>
                    </label>

                    <label className="flex items-center gap-2 p-2 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] cursor-pointer col-span-2">
                      <input
                        type="checkbox"
                        checked={userPermissions.cardapioDigital}
                        onChange={() => togglePermission('cardapioDigital')}
                        className="rounded text-teal-600"
                      />
                      <span className="font-semibold text-slate-900 dark:text-white">Cardápio Digital</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="min-h-[44px] px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-[#27272a]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="min-h-[44px] px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold disabled:opacity-60"
                >
                  {savingUser ? 'Salvando...' : 'Salvar Colaborador'}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL HOLERITE --- */}
      {isHoleriteModalOpen && holeriteUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] pb-3">
              <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-500" />
                <span>Holerite - {holeriteUser.name}</span>
              </h3>
              <button
                onClick={() => setIsHoleriteModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* WhatsApp */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
              <p className="text-[10px] text-slate-400 mb-1">WhatsApp</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{holeriteUser.whatsapp || 'Não cadastrado'}</p>
            </div>

            {/* Benefícios */}
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">BENEFÍCIOS</p>
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Salário Base (R$)</label>
                  <input
                    type="number"
                    value={holeriteSalary}
                    onChange={(e) => setHoleriteSalary(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Vale Transporte (R$)</label>
                    <input
                      type="number"
                      value={holeriteTransportation}
                      onChange={(e) => setHoleriteTransportation(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Vale Refeição (R$)</label>
                    <input
                      type="number"
                      value={holeriteMeal}
                      onChange={(e) => setHoleriteMeal(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">Outros Benefícios (R$)</label>
                  <input
                    type="number"
                    value={holeriteOtherBenefits}
                    onChange={(e) => setHoleriteOtherBenefits(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                  />
                </div>
              </div>
            </div>

            {/* Descontos */}
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">DESCONTOS</p>
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">INSS (R$)</label>
                    <input
                      type="number"
                      value={holeriteInss}
                      onChange={(e) => setHoleriteInss(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">IR (R$)</label>
                    <input
                      type="number"
                      value={holeriteIr}
                      onChange={(e) => setHoleriteIr(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 mb-1">Outros (R$)</label>
                    <input
                      type="number"
                      value={holeriteOtherDiscounts}
                      onChange={(e) => setHoleriteOtherDiscounts(parseFloat(e.target.value) || 0)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-[#27272a] bg-slate-50 dark:bg-[#09090b] text-slate-900 dark:text-white font-semibold"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Resumo */}
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total Bruto:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">R$ {(holeriteSalary + holeriteTransportation + holeriteMeal + holeriteOtherBenefits).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-slate-500">Total Descontos:</span>
                <span className="font-bold text-rose-600">R$ {(holeriteInss + holeriteIr + holeriteOtherDiscounts).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-emerald-500/30 pt-2">
                <span className="font-bold text-slate-900 dark:text-white">Líquido:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">R$ {((holeriteSalary + holeriteTransportation + holeriteMeal + holeriteOtherBenefits) - (holeriteInss + holeriteIr + holeriteOtherDiscounts)).toFixed(2)}</span>
              </div>
            </div>

            {/* Botões */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-[#27272a]">
              <button
                type="button"
                onClick={handleGeneratePDF}
                className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#3f3f46] text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                PDF
              </button>
              {holeriteUser.whatsapp && (
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="px-4 py-2 rounded-xl bg-green-600 hover:bg-green-500 text-white font-bold text-xs flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsHoleriteModalOpen(false)}
                className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold hover:bg-slate-100 dark:hover:bg-[#27272a]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveHolerite}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                Salvar Holerite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 5: TV / VITRINE --- */}
      {activeSubTab === 'tv' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Tv className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Configurações da TV / Vitrine</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Controle a velocidade de rotação e o formato de exibição dos produtos na TV</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Velocidade de Rotação
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Tempo que cada produto fica na tela antes de mudar
                </p>
                <select
                  value={tvSlideSpeed}
                  onChange={(e) => setTvSlideSpeed(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value={3}>3 segundos (Rápido)</option>
                  <option value={4}>4 segundos</option>
                  <option value={6}>6 segundos (Padrão)</option>
                  <option value={8}>8 segundos</option>
                  <option value={10}>10 segundos</option>
                  <option value={15}>15 segundos (Lento)</option>
                  <option value={20}>20 segundos</option>
                </select>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Formato de Exibição
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Como os produtos aparecem na tela da TV
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTvDisplayMode('single')}
                    className={`min-h-[44px] p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                      tvDisplayMode === 'single'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-lg mb-1">🎯</div>
                    Destaque 1x
                    <p className="text-[10px] font-normal mt-0.5 opacity-70">Um produto por vez</p>
                  </button>
                  <button
                    onClick={() => setTvDisplayMode('grid')}
                    className={`min-h-[44px] p-3 rounded-xl border text-xs font-bold text-center transition-all ${
                      tvDisplayMode === 'grid'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                        : 'bg-white dark:bg-[#18181b] border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-lg mb-1">📦</div>
                    Grade 4x
                    <p className="text-[10px] font-normal mt-0.5 opacity-70">Vários produtos juntos</p>
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveTv}
              disabled={savingTv}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black font-bold text-xs shadow-md transition-colors flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" />
              {savingTv ? 'Salvando...' : 'Salvar Configurações da TV'}
            </button>
          </div>

          {/* Mensagens do Rodapé da TV */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mensagens do Rodapé da TV</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Texto em rotação no rodapé da vitrine — sincroniza em tempo real com as TVs pareadas</p>
              </div>
            </div>

            {/* Adicionar nova mensagem */}
            <div className="flex gap-2">
              <input
                value={newFooterMessage}
                onChange={(e) => setNewFooterMessage(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddFooterMessage()}
                placeholder="Nova mensagem (ex.: PIX aprovado na hora!)"
                maxLength={120}
                className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button
                onClick={handleAddFooterMessage}
                disabled={!newFooterMessage.trim()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>

            {/* Lista de mensagens */}
            <div className="space-y-2">
              {[...footerMessages]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((m, idx) => (
                  <div key={m.id} className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                    {editingFooterId === m.id ? (
                      <>
                        <input
                          value={editingFooterText}
                          onChange={(e) => setEditingFooterText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSaveEditFooter()}
                          autoFocus
                          maxLength={120}
                          className="flex-1 min-h-[36px] px-3 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                        />
                        <button onClick={handleSaveEditFooter} className="p-2 rounded-lg text-emerald-500 hover:bg-emerald-500/10" title="Salvar edição">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingFooterId(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-500/10" title="Cancelar">
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => handleMoveFooter(idx, -1)}
                          disabled={idx === 0}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 disabled:opacity-30"
                          title="Mover para cima"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleMoveFooter(idx, 1)}
                          disabled={idx === footerMessages.length - 1}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-500/10 disabled:opacity-30"
                          title="Mover para baixo"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-[#d4d4d8]">{m.message}</span>
                        <button
                          onClick={() => handleToggleFooterMessage(m)}
                          className={`p-2 rounded-lg transition-colors ${m.active ? 'text-emerald-500 hover:bg-emerald-500/10' : 'text-slate-400 hover:bg-slate-500/10'}`}
                          title={m.active ? 'Desativar mensagem' : 'Ativar mensagem'}
                        >
                          {m.active ? <CheckCircle className="w-4 h-4" /> : <Circle className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleStartEditFooter(m)} className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-500/10" title="Editar">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteFooterMessage(m.id)} className="p-2 rounded-lg text-red-500 hover:bg-red-500/10" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                ))}

              {footerMessages.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-[#71717a] py-3 text-center">
                  Nenhuma mensagem configurada — a TV exibe o rodapé padrão.
                </p>
              )}
            </div>
          </div>

          {/* Dispositivos de TV / Vitrine (media_devices) */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400">
                <MonitorPlay className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Dispositivos de TV / Vitrine</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Cadastre cada TV/vitrine, copie o código de pareamento e digite-o na tela "Conectar TV" do aparelho</p>
              </div>
            </div>

            {/* Cadastrar novo dispositivo */}
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={tvDeviceName}
                onChange={(e) => setTvDeviceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddMediaDevice()}
                placeholder="Nome (ex.: TV do Balcão)"
                maxLength={60}
                className="flex-1 min-h-[44px] px-3 py-2.5 rounded-xl bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <select
                value={tvDeviceType}
                onChange={(e) => setTvDeviceType(e.target.value as 'tv' | 'vitrine')}
                className="min-h-[44px] px-3 py-2.5 rounded-xl bg-white dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="tv">TV</option>
                <option value="vitrine">Vitrine</option>
              </select>
              <button
                onClick={handleAddMediaDevice}
                disabled={!tvDeviceName.trim()}
                className="min-h-[44px] px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Gerar Código
              </button>
            </div>

            {/* Lista de dispositivos */}
            <div className="space-y-2">
              {mediaDevicesList.map((d) => {
                const status = storageService.mediaStatusFrom(d.lastSeenAt);
                return (
                  <div key={d.id} className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                    <div className={`p-2 rounded-lg ${d.deviceType === 'tv' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}>
                      <Tv className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {d.name}
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {d.deviceType === 'tv' ? 'TV' : 'Vitrine'}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-[#71717a] font-mono mt-0.5">
                        Código: {d.pairingCode}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide ${
                        status === 'online'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                          : status === 'offline'
                            ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
                            : 'bg-slate-500/10 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Aguardando'}
                    </span>
                    <button
                      onClick={() => handleCopyPairingCode(d.pairingCode)}
                      className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-500/10"
                      title="Copiar código de pareamento"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteMediaDevice(d.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"
                      title="Excluir dispositivo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}

              {mediaDevicesList.length === 0 && (
                <p className="text-xs text-slate-500 dark:text-[#71717a] py-3 text-center">
                  Nenhuma TV cadastrada — adicione uma acima para gerar o código de pareamento.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 6: APARÊNCIA / TEMA --- */}
      {activeSubTab === 'appearance' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-pink-500/10 text-pink-600 dark:text-pink-400">
                <Palette className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Paleta de Cores da Filial</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Personalize as cores primária, secundária, de destaque e fundo da sua filial</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Cor Primária */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Cor Primária
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Cor principal do sistema (botões, links, destaques)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themePrimary}
                    onChange={(e) => setThemePrimary(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-[#27272a] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themePrimary}
                    onChange={(e) => setThemePrimary(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="#4f46e5"
                  />
                </div>
              </div>

              {/* Cor Secundária */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Cor Secundária
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Cor complementar para gradientes e variações
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeSecondary}
                    onChange={(e) => setThemeSecondary(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-[#27272a] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeSecondary}
                    onChange={(e) => setThemeSecondary(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="#6366f1"
                  />
                </div>
              </div>

              {/* Cor de Destaque */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Cor de Destaque
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Cor para alertas, badges e elementos chamativos
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeAccent}
                    onChange={(e) => setThemeAccent(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-[#27272a] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeAccent}
                    onChange={(e) => setThemeAccent(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="#f59e0b"
                  />
                </div>
              </div>

              {/* Cor de Fundo */}
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-2">
                <label className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa] block">
                  Cor de Fundo
                </label>
                <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                  Cor de fundo do modo escuro (dashboard, cards)
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={themeBg}
                    onChange={(e) => setThemeBg(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 dark:border-[#27272a] cursor-pointer"
                  />
                  <input
                    type="text"
                    value={themeBg}
                    onChange={(e) => setThemeBg(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-xs font-mono text-slate-900 dark:text-white"
                    placeholder="#09090b"
                  />
                </div>
              </div>
            </div>

            {/* Preview das cores */}
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-3">
              <p className="text-xs font-bold text-slate-700 dark:text-[#a1a1aa]">Pré-visualização</p>
              <div className="flex items-center gap-3">
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: themePrimary }} title="Primária" />
                  <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: themeSecondary }} title="Secundária" />
                  <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: themeAccent }} title="Destaque" />
                  <div className="w-8 h-8 rounded-lg border border-slate-200 dark:border-[#27272a]" style={{ backgroundColor: themeBg }} title="Fundo" />
                </div>
                <div className="flex gap-2 ml-auto">
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: themePrimary }}>Botão</span>
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: themeAccent }}>Badge</span>
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-[#27272a]">
              <button
                onClick={handleSaveTheme}
                disabled={savingTheme}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold disabled:opacity-60 flex items-center gap-2 text-xs"
              >
                {savingTheme ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4" /> Salvar Paleta</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- TAB 7: CARDÁPIO DIGITAL / MESAS --- */}
      {activeSubTab === 'cardapio' && (
        <div className="space-y-6">
          {/* Configurações do Cardápio */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Configurações do Cardápio Digital</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Personalize a aparência do cardápio visto pelos clientes</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Título do Cardápio</label>
                <input
                  type="text"
                  value={menuTitle}
                  onChange={(e) => setMenuTitle(e.target.value)}
                  placeholder="Cardápio Digital"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Subtítulo</label>
                <input
                  type="text"
                  value={menuSubtitle}
                  onChange={(e) => setMenuSubtitle(e.target.value)}
                  placeholder="Escolha seus produtos"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Layout</label>
                <select
                  value={menuLayout}
                  onChange={(e) => setMenuLayout(e.target.value as 'grid' | 'list')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
                >
                  <option value="grid">Grid (Cards)</option>
                  <option value="list">Lista</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-[#a1a1aa] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={menuShowPrices}
                    onChange={(e) => setMenuShowPrices(e.target.checked)}
                    className="w-4 h-4 rounded text-teal-600 cursor-pointer"
                  />
                  Exibir preços no cardápio
                </label>
              </div>
            </div>

            <div className="flex justify-end pt-3 border-t border-slate-200 dark:border-[#27272a]">
              <button
                onClick={handleSaveMenuConfig}
                disabled={savingMenuConfig}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-bold disabled:opacity-60 flex items-center gap-2 text-xs"
              >
                {savingMenuConfig ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                ) : (
                  <><Save className="w-4 h-4" /> Salvar Configurações</>
                )}
              </button>
            </div>
          </div>

          {/* Gerenciamento de Mesas */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Mesas ({tables.length})</h3>
                <p className="text-xs text-slate-500 dark:text-[#71717a]">Cada mesa recebe um QR Code único para o cliente acessar o cardápio</p>
              </div>
            </div>

            {/* Formulário adicionar mesa */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">Nome/Identificação</label>
                <input
                  type="text"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Ex.: Mesa 01, Varanda"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1">Número (opcional)</label>
                <input
                  type="number"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ex.: 1"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleAddTable}
                  disabled={savingTable || !tableName.trim()}
                  className="min-h-[44px] w-full px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-bold text-xs transition-colors flex items-center justify-center gap-2"
                >
                  {savingTable ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Adicionar Mesa</>
                  )}
                </button>
              </div>
            </div>

            {/* Botão imprimir todos */}
            {tables.length > 0 && (
              <button
                onClick={handlePrintAllQRCodes}
                className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition-colors"
              >
                <PrinterIcon className="w-4 h-4" />
                Imprimir Todos os QR Codes (A4)
              </button>
            )}

            {/* Lista de mesas */}
            {tables.length > 0 ? (
              <div className="space-y-2">
                {tables.sort((a, b) => (a.number || 0) - (b.number || 0)).map((table) => (
                  <div key={table.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-600 dark:text-orange-400 shrink-0">
                      <QrCode className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 dark:text-white">{table.name}</p>
                      <p className="text-[10px] text-slate-500 dark:text-[#71717a] font-mono truncate">
                        QR: ...{table.qrToken.slice(-12)}
                      </p>
                    </div>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase ${
                      table.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20'
                        : 'bg-slate-500/10 text-slate-500 border border-slate-500/20'
                    }`}>
                      {table.status === 'active' ? 'Ativa' : 'Inativa'}
                    </span>
                    <button
                      onClick={() => window.open(`${window.location.origin}${window.location.pathname}#/mesa/${table.qrToken}`, '_blank')}
                      className="p-2 rounded-lg text-teal-500 hover:bg-teal-500/10"
                      title="Ver Cardápio"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handlePrintQRCode(table)}
                      className="p-2 rounded-lg text-indigo-500 hover:bg-indigo-500/10"
                      title="Imprimir QR Code"
                    >
                      <PrinterIcon className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id)}
                      className="p-2 rounded-lg text-red-500 hover:bg-red-500/10"
                      title="Remover mesa"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-400 dark:text-[#52525b]">
                Nenhuma mesa cadastrada. Adicione a primeira mesa acima.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Confirm: excluir filial */}
      <ConfirmDialog
        isOpen={confirmDeleteBranch !== null}
        title="Excluir filial?"
        message="A filial e seus dados vinculados serão removidos."
        itemName={confirmDeleteBranch?.name}
        confirmLabel="Excluir"
        onConfirm={handleConfirmDeleteBranch}
        onCancel={() => setConfirmDeleteBranch(null)}
      />

{/* Confirm: excluir colaborador */}
<ConfirmDialog
  isOpen={confirmDeleteUser !== null}
  title="Excluir colaborador?"
  message="O colaborador perder� o acesso ao sistema."
  itemName={confirmDeleteUser?.name}
  confirmLabel="Excluir"
  onConfirm={handleConfirmDeleteUser}
  onCancel={() => setConfirmDeleteUser(null)}
/>

{/* Branch Check — verificar filial de cada usu�rio */}
<BranchCheck />

{/* QR Code Modal */}
{qrModalTable && (
  <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setQrModalTable(null)}>
    <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
      <div className="p-5 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">QR Code — {qrModalTable.name}</h3>
        <button onClick={() => setQrModalTable(null)} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100">✕</button>
      </div>
      <div className="p-5 flex flex-col items-center">
        {qrCodeDataUrl ? (
          <img
            src={qrCodeDataUrl}
            alt="QR Code"
            width="250"
            height="250"
            className="rounded-xl"
          />
        ) : (
          <div className="w-[250px] h-[250px] bg-slate-100 rounded-xl flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3 text-center">
          Escaneie para acessar o cardápio digital
        </p>
        <p className="text-[10px] text-slate-400 mt-1 text-center font-mono break-all">
          {window.location.origin}/#/mesa/{qrModalTable.qrToken}
        </p>
      </div>
      <div className="p-4 border-t border-slate-200 dark:border-[#27272a] flex justify-end gap-2">
        <button
          onClick={() => setQrModalTable(null)}
          className="px-4 py-2 rounded-xl text-slate-600 dark:text-slate-400 font-bold text-xs hover:bg-slate-100 dark:hover:bg-[#27272a]"
        >
          Fechar
        </button>
        <button
          onClick={handlePrintFromModal}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2"
        >
          <PrinterIcon className="w-4 h-4" />
          Imprimir
        </button>
      </div>
    </div>
  </div>
)}
</div>
  );
};
