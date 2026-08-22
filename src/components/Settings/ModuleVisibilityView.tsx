/**
 * ModuleVisibilityView - Configuração de visibilidade de módulos por filial
 * 
 * Funcionalidades:
 * - Selecionar quais módulos aparecem no menu
 * - Regras de dependência automáticas (PDV precisa de Estoque, etc.)
 * - Salvar no module_visibility
 */

import React, { useState, useEffect } from 'react';
import { Save, CheckCircle, Loader2, Info } from 'lucide-react';
import { StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface ModuleVisibilityViewProps {
  branch: StoreBranch;
  onSaved?: () => void;
}

interface ModuleConfig {
  key: string;
  label: string;
  description: string;
  defaultValue: boolean;
  requires?: string[];
  conjugado?: string[]; // Módulos conjugados - se um é desativado, o outro também é
  icon: string;
}

const MODULES: ModuleConfig[] = [
  { key: 'modulePdv', label: 'PDV', description: 'Ponto de Venda', defaultValue: true, requires: ['moduleInventory'], icon: '💰' },
  { key: 'moduleInventory', label: 'Estoque', description: 'Gestão de produtos', defaultValue: true, icon: '📦' },
  { key: 'moduleFiado', label: 'Fiados', description: 'Contas a receber', defaultValue: false, requires: ['moduleCrm'], conjugado: ['moduleCrm'], icon: '📋' },
  { key: 'moduleCrm', label: 'Clientes/Fornecedores/CRM', description: 'Cadastro de clientes', defaultValue: false, conjugado: ['moduleFiado'], icon: '👥' },
  { key: 'moduleComanda', label: 'Comandas', description: 'Comandas e Mesas', defaultValue: false, requires: ['moduleInventory'], icon: '📋' },
  { key: 'moduleDashboard', label: 'Painel Executivo', description: 'Visão geral', defaultValue: true, requires: ['moduleInventory'], icon: '📊' },
  { key: 'moduleFinance', label: 'Financeiro', description: 'Contas e despesas', defaultValue: false, requires: ['modulePdv'], icon: '💵' },
  { key: 'moduleKds', label: 'Pedidos', description: 'Cozinha', defaultValue: false, requires: ['modulePdv'], icon: '🍳' },
  { key: 'moduleDelivery', label: 'Delivery', description: 'Pedidos de entrega', defaultValue: false, requires: ['moduleInventory'], icon: '🛵' },
  { key: 'moduleCardapioDigital', label: 'Cardápio Digital', description: 'QR Code nas mesas', defaultValue: false, requires: ['moduleInventory'], icon: '📱' },
  { key: 'moduleCardapioPreview', label: 'Cardápio Preview', description: 'Visualização do cardápio', defaultValue: false, requires: ['moduleInventory'], icon: '👁️' },
  { key: 'moduleTvShowcase', label: 'Ofertas/TV', description: 'Vitrine de ofertas', defaultValue: false, requires: ['moduleInventory'], icon: '📺' },
  { key: 'moduleTvConnect', label: 'Conectar TV', description: 'Parear TV/vitrine', defaultValue: false, requires: ['moduleInventory'], icon: '📡' },
];

export const ModuleVisibilityView: React.FC<ModuleVisibilityViewProps> = ({ branch, onSaved }) => {
  const [settings, setSettings] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    // Reage a mudanças remotas (Realtime): quando outro dispositivo da mesma
    // filial salva a visibilidade de módulos, este acesso reflete na hora sem
    // precisar reabrir a aba.
    const unsub = storageService.subscribe(() => loadSettings());
    return () => unsub();
  }, [branch.id]);

  const loadSettings = () => {
    const saved = storageService.getModuleVisibility();
    if (saved) {
      setSettings({
        modulePdv: saved.modulePdv ?? true,
        moduleInventory: saved.moduleInventory ?? true,
        moduleFiado: saved.moduleFiado ?? false,
        moduleCrm: saved.moduleCrm ?? false,
        moduleComanda: saved.moduleComanda ?? false,
        moduleDashboard: saved.moduleDashboard ?? true,
        moduleFinance: saved.moduleFinance ?? false,
        moduleKds: saved.moduleKds ?? false,
        moduleDelivery: saved.moduleDelivery ?? false,
        moduleCardapioDigital: saved.moduleCardapioDigital ?? false,
        moduleCardapioPreview: saved.moduleCardapioPreview ?? false,
        moduleTvShowcase: saved.moduleTvShowcase ?? false,
        moduleTvConnect: saved.moduleTvConnect ?? false,
      });
    } else {
      const defaults: Record<string, boolean> = {};
      MODULES.forEach(m => { defaults[m.key] = m.defaultValue; });
      setSettings(defaults);
    }
  };

  const handleToggle = (key: string, value: boolean) => {
    const newSettings = { ...settings, [key]: value };

    // Regras de dependência: se ativar X, ativa automaticamente o que X precisa
    if (value) {
      const module = MODULES.find(m => m.key === key);
      if (module?.requires) {
        module.requires.forEach(reqKey => {
          if (!newSettings[reqKey]) {
            newSettings[reqKey] = true;
            const reqModule = MODULES.find(m => m.key === reqKey);
            setInfoMessage(`"${reqModule?.label}" foi ativado automaticamente porque "${module.label}" precisa dele.`);
          }
        });
      }
    }

    // Regras inversa: se desativar X, verifica se algo precisa de X OU é conjugado de X
    if (!value) {
      MODULES.forEach(m => {
        // Se m depende de X (requires)
        if (m.requires?.includes(key) && newSettings[m.key]) {
          newSettings[m.key] = false;
          setInfoMessage(`"${m.label}" foi desativado porque depende de "${MODULES.find(mod => mod.key === key)?.label}".`);
        }
        // Se m é conjugado de X (bidirecional)
        if (m.conjugado?.includes(key) && newSettings[m.key]) {
          newSettings[m.key] = false;
          setInfoMessage(`"${m.label}" foi desativado porque é conjugado de "${MODULES.find(mod => mod.key === key)?.label}".`);
        }
      });
    }

    setSettings(newSettings);
  };

  const handleSave = () => {
    setSaving(true);
    try {
      storageService.saveModuleVisibility({
        id: crypto.randomUUID(),
        organizationId: branch.organizationId || '',
        storeBranchId: branch.id,
        ...settings,
      });
      setSuccessMessage('Visibilidade de módulos salva!');
      posAudio.chime();
      onSaved?.();
    } catch (err: any) {
      console.error('Erro ao salvar module visibility:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {infoMessage && (
        <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          {infoMessage}
        </div>
      )}

      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">📦 Módulos Disponíveis</h3>
        <p className="text-xs text-slate-500 dark:text-[#71717a]">
          Selecione quais módulos aparecerão no menu da filial. Módulos com dependências são ativados automaticamente.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULES.map((module) => (
            <label
              key={module.key}
              className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                settings[module.key]
                  ? 'bg-violet-500/10 border-violet-500/30'
                  : 'bg-slate-50 dark:bg-[#09090b] border-slate-200 dark:border-[#27272a]'
              }`}
            >
              <input
                type="checkbox"
                checked={settings[module.key] ?? false}
                onChange={(e) => handleToggle(module.key, e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded accent-violet-500"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm">{module.icon}</span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">{module.label}</span>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-[#71717a] mt-0.5">{module.description}</p>
                {module.requires && module.requires.length > 0 && (
                  <p className="text-[9px] text-orange-500 mt-1">
                    Requer: {module.requires.map(r => MODULES.find(m => m.key === r)?.label).join(', ')}
                  </p>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Botão Salvar */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
        ) : (
          <><Save className="w-4 h-4" /> Salvar Visibilidade de Módulos</>
        )}
      </button>
    </div>
  );
};
