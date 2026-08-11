/**
 * IntegrationsView - Configuração de integrações com bancos e meios de pagamento
 * 
 * Suporta SDKs de:
 * - Mercado Pago (PIX, cartão, boleto)
 * - PagSeguro
 * - Stone
 * - Cielo
 * - Rede
 * - Stripe
 * - Pix (Banco do Brasil, Bradesco, Itaú)
 * 
 * Cada filial tem suas próprias configurações (isolamento por store_branch_id)
 */

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Loader2, CreditCard, Smartphone, Building2, QrCode } from 'lucide-react';
import { StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface IntegrationsViewProps {
  branch: StoreBranch;
  onSaved?: () => void;
}

interface IntegrationConfig {
  id: string;
  organizationId: string;
  storeBranchId: string;
  // Mercado Pago
  mercadoPagoPublicKey?: string;
  mercadoPagoAccessToken?: string;
  // PagSeguro
  pagSeguroToken?: string;
  pagSeguroEmail?: string;
  // Stone
  stoneMerchantKey?: string;
  stoneAccessToken?: string;
  // Cielo
  cieloMerchantId?: string;
  cieloMerchantKey?: string;
  // Rede
  redeClientId?: string;
  redeClientSecret?: string;
  // Stripe
  stripePublicKey?: string;
  stripeSecretKey?: string;
  // PIX (genérico)
  pixKey?: string;
  pixKeyType?: 'cpf' | 'cnpj' | 'email' | 'phone' | 'random';
  pixBank?: string;
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
  { value: 'rede', label: 'Rede' },
  { value: 'mercado_pago', label: 'Mercado Pago' },
  { value: 'pagseguro', label: 'PagSeguro' },
  { value: 'picpay', label: 'PicPay' },
  { value: 'stripe', label: 'Stripe' },
  { value: 'other', label: 'Outro' },
];

export const IntegrationsView: React.FC<IntegrationsViewProps> = ({ branch, onSaved }) => {
  const [config, setConfig] = useState<IntegrationConfig>({
    id: '',
    organizationId: branch.organizationId || '',
    storeBranchId: branch.id,
    pixKeyType: 'cpf',
    pixBank: '',
  });
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeProvider, setActiveProvider] = useState<'mercado_pago' | 'pagseguro' | 'stone' | 'cielo' | 'rede' | 'stripe' | 'pix'>('pix');

  useEffect(() => {
    loadConfig();
  }, [branch.id]);

  const loadConfig = () => {
    const all = storageService.getAllIntegrations();
    const saved = all.find((c: IntegrationConfig) => c.storeBranchId === branch.id);
    if (saved) {
      setConfig(saved);
    }
  };

  const handleSave = () => {
    setSaving(true);
    try {
      storageService.saveIntegration(config);
      setSuccessMessage('Integrações salvas com sucesso!');
      posAudio.chime();
      onSaved?.();
    } catch (err: any) {
      console.error('Erro ao salvar integrações:', err);
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof IntegrationConfig, value: string) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

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
                value={config.pixKeyType || 'cpf'}
                onChange={(e) => updateField('pixKeyType', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
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
                value={config.pixKey || ''}
                onChange={(e) => updateField('pixKey', e.target.value)}
                placeholder="CPF, CNPJ, e-mail, telefone ou chave aleatória"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Banco</label>
              <select
                value={config.pixBank || ''}
                onChange={(e) => updateField('pixBank', e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              >
                {BANKS.map((bank) => (
                  <option key={bank.value} value={bank.value}>{bank.label}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
            Configure sua chave PIX para receber pagamentos. Os dados são isolados por filial.
          </p>
        </div>
      )}

      {/* Mercado Pago Config */}
      {activeProvider === 'mercado_pago' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-blue-500" />
            Mercado Pago
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Public Key</label>
              <input
                type="text"
                value={config.mercadoPagoPublicKey || ''}
                onChange={(e) => updateField('mercadoPagoPublicKey', e.target.value)}
                placeholder="TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Access Token</label>
              <input
                type="password"
                value={config.mercadoPagoAccessToken || ''}
                onChange={(e) => updateField('mercadoPagoAccessToken', e.target.value)}
                placeholder="TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
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
                value={config.pagSeguroEmail || ''}
                onChange={(e) => updateField('pagSeguroEmail', e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Token</label>
              <input
                type="password"
                value={config.pagSeguroToken || ''}
                onChange={(e) => updateField('pagSeguroToken', e.target.value)}
                placeholder="Seu token do PagSeguro"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
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
                value={config.stoneMerchantKey || ''}
                onChange={(e) => updateField('stoneMerchantKey', e.target.value)}
                placeholder="Sua merchant key"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Access Token</label>
              <input
                type="password"
                value={config.stoneAccessToken || ''}
                onChange={(e) => updateField('stoneAccessToken', e.target.value)}
                placeholder="Seu access token"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
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
                value={config.cieloMerchantId || ''}
                onChange={(e) => updateField('cieloMerchantId', e.target.value)}
                placeholder="Seu merchant ID"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Merchant Key</label>
              <input
                type="password"
                value={config.cieloMerchantKey || ''}
                onChange={(e) => updateField('cieloMerchantKey', e.target.value)}
                placeholder="Seu merchant key"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>
        </div>
      )}

      {/* Rede Config */}
      {activeProvider === 'rede' && (
        <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-red-500" />
            Rede
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Client ID</label>
              <input
                type="text"
                value={config.redeClientId || ''}
                onChange={(e) => updateField('redeClientId', e.target.value)}
                placeholder="Seu client ID"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Client Secret</label>
              <input
                type="password"
                value={config.redeClientSecret || ''}
                onChange={(e) => updateField('redeClientSecret', e.target.value)}
                placeholder="Seu client secret"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
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
                value={config.stripePublicKey || ''}
                onChange={(e) => updateField('stripePublicKey', e.target.value)}
                placeholder="pk_test_xxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-[#a1a1aa] mb-1 text-xs">Secret Key</label>
              <input
                type="password"
                value={config.stripeSecretKey || ''}
                onChange={(e) => updateField('stripeSecretKey', e.target.value)}
                placeholder="sk_test_xxxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white placeholder:text-slate-400"
              />
            </div>
          </div>
          <p className="text-[10px] text-slate-500 dark:text-[#71717a]">
            Obtenha suas credenciais em: dashboard.stripe.com
          </p>
        </div>
      )}

      {/* Save Button */}
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
    </div>
  );
};

export default IntegrationsView;
