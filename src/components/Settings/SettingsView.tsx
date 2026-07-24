import React, { useState } from 'react';
import {
  Settings,
  Building2,
  Printer,
  QrCode,
  Store,
  ShieldCheck,
  Save,
  Key,
} from 'lucide-react';
import { SystemSettings, StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface SettingsViewProps {
  settings: SystemSettings;
  branches: StoreBranch[];
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, branches }) => {
  const [tradeName, setTradeName] = useState(settings.tradeName);
  const [companyName, setCompanyName] = useState(settings.companyName);
  const [cnpj, setCnpj] = useState(settings.cnpj);
  const [ie, setIe] = useState(settings.ie);
  const [address, setAddress] = useState(settings.address);
  const [phone, setPhone] = useState(settings.phone);
  const [pixKey, setPixKey] = useState(settings.pixKey);
  const [printerPaperSize, setPrinterPaperSize] = useState<'80mm' | '58mm'>(settings.printerPaperSize);
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(settings.autoPrintReceipt);

  const handleSave = (e: React.FormEvent) => {
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Top Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          Configurações da Empresa & Parâmetros do PDV
        </h2>
        <p className="text-xs text-slate-500">
          Dados cadastrais para emissão fiscal NFC-e, chave PIX, impressoras térmicas e filiais
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
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
                onChange={(e) => setPrinterPaperSize(e.target.value as any)}
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

        {/* Store Branches List */}
        <div className="p-6 rounded-3xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#27272a] pb-3">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <span>Rede de Filiais & Lojas do Grupo</span>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            {branches.map((b) => (
              <div key={b.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#09090b] border border-slate-200 dark:border-[#27272a] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white">{b.name}</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    {b.active ? 'Ativa' : 'Inativa'}
                  </span>
                </div>
                <p className="text-slate-500 dark:text-[#71717a]">{b.address}</p>
                <p className="text-[10px] text-slate-400 dark:text-[#71717a] font-mono">CNPJ: {b.cnpj}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            className="px-6 py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-lg shadow-indigo-600/20 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Salvar Alterações do Sistema</span>
          </button>
        </div>
      </form>
    </div>
  );
};
