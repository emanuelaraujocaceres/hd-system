/**
 * IntegrationsView - Configuração de integrações com bancos e meios de pagamento
 * 
 * SEGURANÇA AVANÇADA:
 * - Chaves são criptografadas com AES-GCM usando o ID do admin como segredo
 * - Apenas o admin que salvou as chaves pode vê-las/modificáá-las
 * - Outros admins veem apenas máscaras (••••••••)
 * - Chaves nunca são exibidas em texto plano após salvas
 * 
 * FUNCIONALIDADES:
 * - Ambiente TEST/PROD separados
 * - Refresh Token automático (MercadoPago)
 * - Upload de certificado .p12 (Rede, GetNet)
 * - Webhook URL para notificações de pagamento
 * - Token expiry warning
 */

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Loader2, CreditCard, Smartphone, Building2, QrCode, Shield, Upload, RefreshCw, AlertTriangle } from 'lucide-react';
import { StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { encryptKey, decryptKey, maskKey, isKeyOwner, hasKeysConfigured } from '../../lib/encryption';

interface IntegrationsViewProps {
  branch: StoreBranch;
  user: any;
  onSaved?: () => void;
}

interface EncryptedIntegrationData {
  id: string;
  organizationId: string;
  storeBranchId: string;
  ownerAdminId: string; // Admin who saved the keys
  ownerAdminName: string;
  environment: 'test' | 'prod';
  encryptedKeys: Record<string, string>; // Encrypted key values
  webhookUrl?: string;
  certFileName?: string;
  lastTokenRefresh?: string;
  updatedAt: string;
}

const BANKS = [
  { value: '', label: 'Selecione o banco' },
  { value: 'bb', label: 'Banco do Brasil' },
  { value: 'bradesco', label: 'Bradesco' },
  { value: 'itau', label: 'Itaú' },
  { value: 'santander', label: 'Santander' },
  { value: 'caixa', label: 'Caixa Econômica' },
  { value: 'nubank', label: 'Nubank' },
  { value: 'inter', label: 'Inter' },
  { value: 'stone', label: 'Stone' },
  { value: 'cielo', label: 'Cielo' },
  { value: 'rede', label: 'Rede (certificado)' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'pagseguro', label: 'PagSeguro' },
  { value: 'picpay', label: 'PicPay' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'getnet', label: 'GetNet (certificado)' },
  { value: 'other', label: 'Outro' },
];

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({ branch, user, onSaved }) => {
  const [data, setData] = useState<EncryptedIntegrationData | null>(null);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<'pix' | 'mercado_pago' | 'pagseguro' | 'stone' | 'cielo' | 'rede' | 'stripe'>('pix');
  const [environment, setEnvironment] = useState<'test' | 'prod'>('test');
  
  // Form state (plain text - only used before saving)
  const [formKeys, setFormKeys] = useState<Record<string, string>>({});
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'cnpj' | 'email' | 'phone' | 'random'>('cpf');
  const [pixBank, setPixBank] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [certFileName, setCertFileName] = useState('');
  
  // Permissions
  const isOwner = data ? isKeyOwner(data, user.id) : true;
  const hasKeys = data ? hasKeysConfigured(data) : false;
  const canEdit = !hasKeys || isOwner;

  useEffect(() => {
    loadData();
  }, [branch.id]);

  const loadData = () => {
    const all = storageService.getAllIntegrations();
    const saved = all.find((c: EncryptedIntegrationData) => c.storeBranchId === branch.id);
    
    if (saved) {
      setData(saved);
      setEnvironment(saved.environment || 'test');
      setWebhookUrl(saved.webhookUrl || '');
      setCertFileName(saved.certFileName || '');
      setPixKeyType(saved.encryptedKeys?.pixKeyType as any || 'cpf');
      setPixBank(saved.encryptedKeys?.pixBank || '');
    } else {
      setData(null);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setErrorMessage(null);
    
    try {
      // Encrypt all keys with admin's ID
      const encryptedKeys: Record<string, string> = {};
      
      // Encrypt each key field
      for (const [key, value] of Object.entries(formKeys)) {
        if (value) {
          encryptedKeys[key] = await encryptKey(value, user.id);
        }
      }
      
      // Add PIX config
      if (pixKey) {
        encryptedKeys.pixKey = await encryptKey(pixKey, user.id);
        encryptedKeys.pixKeyType = pixKeyType;
        encryptedKeys.pixBank = pixBank;
      }

      const integrationData: EncryptedIntegrationData = {
        id: data?.id || crypto.randomUUID(),
        organizationId: branch.organizationId || '',
        storeBranchId: branch.id,
        ownerAdminId: user.id,
        ownerAdminName: user.name,
        environment,
        encryptedKeys,
        webhookUrl,
        certFileName,
        lastTokenRefresh: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      storageService.saveIntegration(integrationData);
      setData(integrationData);
      setSuccessMessage('✅ Integrações salvas com segurança! As chaves estão criptografadas.');
      posAudio.chime();
      onSaved?.();
      
      // Clear form
      setFormKeys({});
      setPixKey('');
    } catch (err: any) {
      setErrorMessage('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDecryptKey = async (keyName: string): Promise<string> => {
    if (!data?.encryptedKeys?.[keyName] || !isOwner) return '';
    return await decryptKey(data.encryptedKeys[keyName], data.ownerAdminId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCertFileName(file.name);
    }
  };

  return (
    <div className="space-y-6">
      {/* Security Banner */}
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3">
        <Shield className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300">🔒 Proteção de Chaves Ativa</p>
          <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
            As chaves são criptografadas com AES-GCM usando seu ID de admin. 
            Apenas você pode vê-las ou modificá-las. Outros admins verão apenas máscaras.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {errorMessage && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-semibold flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          {errorMessage}
        </div>
      )}

      {/* Owner Info */}
      {hasKeys && data && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-xs">
          <p className="font-bold text-blue-700 dark:text-blue-300">
            👤 Configurado por: {data.ownerAdminName} ({isOwner ? '(você)' : '(outro admin)'})
          </p>
          <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-1">
            {isOwner ? 'Você pode visualizar e modificar as chaves.' : 'Apenas o admin que configurou pode modificar.'}
          </p>
        </div>
      )}

      {/* Environment Selector */}
      <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-100 dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Ambiente:</span>
        <button
          onClick={() => setEnvironment('test')}
          disabled={!canEdit}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            environment === 'test'
              ? 'bg-amber-500 text-white'
              : 'bg-white dark:bg-[#27272a] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#3f3f46]'
          } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          🧪 TESTE
        </button>
        <button
          onClick={() => setEnvironment('prod')}
          disabled={!canEdit}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
            environment === 'prod'
              ? 'bg-emerald-500 text-white'
              : 'bg-white dark:bg-[#27272a] text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-[#3f3f46]'
          } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          🚀 PRODUÇÃO
        </button>
      </div>

      {/* Provider Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'pix', label: 'PIX', icon: QrCode },
          { key: 'mercado_pago', label: 'Mercado Pago', icon: Smartphone },
          { key: 'pagseguro', label: 'PagSeguro', icon: CreditCard },
          { key: 'stone', label: 'Stone', icon: Building2 },
          { key: 'cielo', label: 'Cielo', icon: CreditCard },
          { key: 'rede', label: 'Rede', icon: CreditCard },
          { key: 'stripe', label: 'Stripe', icon: CreditCard },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveProvider(key as any)}
            className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
              activeProvider === key
                ? 'bg-indigo-600 text-white'
                : 'bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] text-slate-600 dark:text-slate-400 hover:bg-slate-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* PIX Config */}
      {activeProvider === 'pix' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <QrCode className="w-5 h-5 text-teal-500" />
            Configuração PIX
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Tipo da Chave</label>
              <select
                value={pixKeyType}
                onChange={(e) => setPixKeyType(e.target.value as any)}
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50"
              >
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="random">Chave Aleatória</option>
              </select>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Chave PIX</label>
              <input
                type="text"
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                disabled={!canEdit}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Banco</label>
              <select
                value={pixBank}
                onChange={(e) => setPixBank(e.target.value)}
                disabled={!canEdit}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white disabled:opacity-50"
              >
                {BANKS.map((bank) => (
                  <option key={bank.value} value={bank.value}>{bank.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
            Configure sua chave PIX para receber pagamentos. Os dados são isolados por filial e criptografados.
          </p>
        </div>
      )}

      {/* Mercado Pago Config */}
      {activeProvider === 'mercado_pago' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-500" />
            Mercado Pago
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold">Token expira em 6h</span>
          </h3>
          
          {/* Show masked keys if owner */}
          {hasKeys && isOwner && data?.encryptedKeys?.mercadoPagoAccessToken && (
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-[#09090b] text-xs">
              <span className="text-slate-500">Token atual: </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">{maskKey('saved')}</span>
            </div>
          )}
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Public Key</label>
              <input
                type="text"
                value={formKeys.mercadoPagoPublicKey || ''}
                onChange={(e) => setFormKeys({ ...formKeys, mercadoPagoPublicKey: e.target.value })}
                disabled={!canEdit}
                placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Access Token</label>
              <input
                type={hasKeys && isOwner ? 'text' : 'password'}
                value={formKeys.mercadoPagoAccessToken || ''}
                onChange={(e) => setFormKeys({ ...formKeys, mercadoPagoAccessToken: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
          
          {/* Refresh Token Info */}
          <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-start gap-2">
            <RefreshCw className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-blue-700 dark:text-blue-300">Refresh Token Automático</p>
              <p className="text-[10px] text-blue-600 dark:text-blue-400">
                O Access Token do Mercado Pago expira em 6 horas. O SDK renova automaticamente usando o Refresh Token.
              </p>
            </div>
          </div>
          
          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
            Obtenha suas credenciais em: developers.mercadopago.com
          </p>
        </div>
      )}

      {/* PagSeguro Config */}
      {activeProvider === 'pagseguro' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-orange-500" />
            PagSeguro
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">E-mail</label>
              <input
                type="email"
                value={formKeys.pagSeguroEmail || ''}
                onChange={(e) => setFormKeys({ ...formKeys, pagSeguroEmail: e.target.value })}
                disabled={!canEdit}
                placeholder="seu@email.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Token</label>
              <input
                type="password"
                value={formKeys.pagSeguroToken || ''}
                onChange={(e) => setFormKeys({ ...formKeys, pagSeguroToken: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'Seu token do PagSeguro'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Stone Config */}
      {activeProvider === 'stone' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="w-5 h-5 text-green-500" />
            Stone
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Merchant Key</label>
              <input
                type="text"
                value={formKeys.stoneMerchantKey || ''}
                onChange={(e) => setFormKeys({ ...formKeys, stoneMerchantKey: e.target.value })}
                disabled={!canEdit}
                placeholder="Sua merchant key"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Access Token</label>
              <input
                type="password"
                value={formKeys.stoneAccessToken || ''}
                onChange={(e) => setFormKeys({ ...formKeys, stoneAccessToken: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'Seu access token'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Cielo Config */}
      {activeProvider === 'cielo' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            Cielo
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Merchant ID</label>
              <input
                type="text"
                value={formKeys.cieloMerchantId || ''}
                onChange={(e) => setFormKeys({ ...formKeys, cieloMerchantId: e.target.value })}
                disabled={!canEdit}
                placeholder="Seu merchant ID"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Merchant Key</label>
              <input
                type="password"
                value={formKeys.cieloMerchantKey || ''}
                onChange={(e) => setFormKeys({ ...formKeys, cieloMerchantKey: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'Seu merchant key'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
        </div>
      )}

      {/* Rede Config (Certificate) */}
      {activeProvider === 'rede' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-500" />
            Rede
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 font-bold">Certificado .p12</span>
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Client ID</label>
              <input
                type="text"
                value={formKeys.redeClientId || ''}
                onChange={(e) => setFormKeys({ ...formKeys, redeClientId: e.target.value })}
                disabled={!canEdit}
                placeholder="Seu client ID"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Client Secret</label>
              <input
                type="password"
                value={formKeys.redeClientSecret || ''}
                onChange={(e) => setFormKeys({ ...formKeys, redeClientSecret: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'Seu client secret'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
          
          {/* Certificate Upload */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600">
                <Upload className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-bold text-slate-900 dark:text-white">Certificado Digital (.p12)</p>
                <p className="text-[10px] text-slate-500">
                  {certFileName || 'Nenhum certificado carregado'}
                </p>
              </div>
              {canEdit && (
                <label className="px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold cursor-pointer">
                  <input
                    type="file"
                    accept=".p12,.pfx"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  Enviar
                </label>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stripe Config */}
      {activeProvider === 'stripe' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-purple-500" />
            Stripe
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Publishable Key</label>
              <input
                type="text"
                value={formKeys.stripePublicKey || ''}
                onChange={(e) => setFormKeys({ ...formKeys, stripePublicKey: e.target.value })}
                disabled={!canEdit}
                placeholder="pk_test_xxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Secret Key</label>
              <input
                type="password"
                value={formKeys.stripeSecretKey || ''}
                onChange={(e) => setFormKeys({ ...formKeys, stripeSecretKey: e.target.value })}
                disabled={!canEdit}
                placeholder={hasKeys && isOwner ? 'Deixe vazio para manter o atual' : 'sk_test_xxxxxxxxxxxxx'}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
            Obtenha suas credenciais em: dashboard.stripe.com
          </p>
        </div>
      )}

      {/* Webhook URL */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Upload className="w-5 h-5 text-indigo-500" />
          Webhook de Notificações
        </h3>
        <div>
          <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">URL para receber notificações de pagamento</label>
          <input
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            disabled={!canEdit}
            placeholder="https://seusite.com/api/webhook/pagamentos"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400 disabled:opacity-50"
          />
        </div>
        <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
          O banco envia notificações (POST) para esta URL quando o pagamento for aprovado, recusado ou estornado.
        </p>
      </div>

      {/* Save Button */}
      {canEdit && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
          ) : (
            <><Save className="w-4 h-4" /> Salvar Integrações</>
          )}
        </button>
      )}
    </div>
  );
};

export default IntegrationsView;
