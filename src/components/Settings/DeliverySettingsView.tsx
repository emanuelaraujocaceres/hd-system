/**
 * DeliverySettingsView - Configurações de Delivery por filial
 * 
 * Funcionalidades:
 * - Ativar/desativar delivery
 * - Configurar taxa fixa / por bairro / por distância
 * - Cadastro de bairros com valores
 * - Cadastro de faixas de distância
 * - Horário de funcionamento
 * - WhatsApp para pedidos PIX
 */

import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { StoreBranch, DeliverySettings, DeliveryNeighborhood, DeliveryDistanceRate } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface DeliverySettingsViewProps {
  branch: StoreBranch;
  onSaved?: () => void;
}

export const DeliverySettingsView: React.FC<DeliverySettingsViewProps> = ({ branch, onSaved }) => {
  const [settings, setSettings] = useState<DeliverySettings | null>(null);
  const [neighborhoods, setNeighborhoods] = useState<DeliveryNeighborhood[]>([]);
  const [distanceRates, setDistanceRates] = useState<DeliveryDistanceRate[]>([]);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Form state
  const [deliveryEnabled, setDeliveryEnabled] = useState(true);
  const [pickupEnabled, setPickupEnabled] = useState(true);
  const [feeType, setFeeType] = useState<'free' | 'fixed' | 'neighborhood' | 'distance'>('free');
  const [fixedFee, setFixedFee] = useState(0);
  const [minimumOrder, setMinimumOrder] = useState(0);
  const [estimatedTime, setEstimatedTime] = useState(45);
  const [maxDistance, setMaxDistance] = useState(15);
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [fullAddress, setFullAddress] = useState('');

  // Neighborhood form
  const [newNeighborhood, setNewNeighborhood] = useState('');
  const [newNeighborhoodFee, setNewNeighborhoodFee] = useState('');
  const [newNeighborhoodTime, setNewNeighborhoodTime] = useState('45');

  // Distance rate form
  const [newDistMin, setNewDistMin] = useState('');
  const [newDistMax, setNewDistMax] = useState('');
  const [newDistFee, setNewDistFee] = useState('');
  const [newDistTime, setNewDistTime] = useState('45');

  useEffect(() => {
    loadSettings();
  }, [branch.id]);

  const loadSettings = () => {
    const s = storageService.getDeliverySettings();
    if (s && s.storeBranchId === branch.id) {
      setSettings(s);
      setDeliveryEnabled(s.deliveryEnabled);
      setPickupEnabled(s.pickupEnabled);
      setFeeType(s.feeCalculationType);
      setFixedFee(s.fixedFee);
      setMinimumOrder(s.minimumOrderValue);
      setEstimatedTime(s.estimatedDeliveryTime);
      setMaxDistance(s.maxDeliveryDistanceKm);
      setWhatsappPhone(s.whatsappPhone || '');
      setFullAddress(s.fullAddress || branch.fullAddress || '');
    } else {
      setFullAddress(branch.fullAddress || '');
      setWhatsappPhone(branch.whatsappPhone || '');
    }

    setNeighborhoods(storageService.getDeliveryNeighborhoods().filter(n => n.storeBranchId === branch.id));
    setDistanceRates(storageService.getDeliveryDistanceRates().filter(r => r.storeBranchId === branch.id));
  };

  const handleSaveSettings = () => {
    setSaving(true);
    try {
      const newSettings: DeliverySettings = {
        id: settings?.id || crypto.randomUUID(),
        organizationId: branch.organizationId || '',
        storeBranchId: branch.id,
        isActive: true,
        deliveryEnabled,
        pickupEnabled,
        operatingHours: settings?.operatingHours || {},
        feeCalculationType: feeType,
        fixedFee,
        minimumOrderValue: minimumOrder,
        estimatedDeliveryTime: estimatedTime,
        maxDeliveryDistanceKm: maxDistance,
        branchLatitude: branch.latitude,
        branchLongitude: branch.longitude,
        whatsappPhone,
        fullAddress,
        createdAt: settings?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      storageService.saveDeliverySettings(newSettings);
      setSettings(newSettings);
      setSuccessMessage('Configurações de delivery salvas!');
      posAudio.chime();
      onSaved?.();
    } catch (err: any) {
      console.error('Erro ao salvar delivery settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAddNeighborhood = () => {
    if (!newNeighborhood.trim() || !newNeighborhoodFee) return;
    const neighborhood: DeliveryNeighborhood = {
      id: crypto.randomUUID(),
      organizationId: branch.organizationId || '',
      storeBranchId: branch.id,
      neighborhood: newNeighborhood.trim(),
      fee: parseFloat(newNeighborhoodFee) || 0,
      estimatedTimeMinutes: parseInt(newNeighborhoodTime) || 45,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storageService.saveDeliveryNeighborhood(neighborhood);
    setNeighborhoods([...neighborhoods, neighborhood]);
    setNewNeighborhood('');
    setNewNeighborhoodFee('');
    setNewNeighborhoodTime('45');
    posAudio.chime();
  };

  const handleDeleteNeighborhood = (id: string) => {
    storageService.deleteDeliveryNeighborhood(id);
    setNeighborhoods(neighborhoods.filter(n => n.id !== id));
    posAudio.chime();
  };

  const handleAddDistanceRate = () => {
    if (!newDistMin || !newDistMax || !newDistFee) return;
    const rate: DeliveryDistanceRate = {
      id: crypto.randomUUID(),
      organizationId: branch.organizationId || '',
      storeBranchId: branch.id,
      minKm: parseFloat(newDistMin) || 0,
      maxKm: parseFloat(newDistMax) || 0,
      fee: parseFloat(newDistFee) || 0,
      estimatedTimeMinutes: parseInt(newDistTime) || 45,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storageService.saveDeliveryDistanceRate(rate);
    setDistanceRates([...distanceRates, rate]);
    setNewDistMin('');
    setNewDistMax('');
    setNewDistFee('');
    setNewDistTime('45');
    posAudio.chime();
  };

  const handleDeleteDistanceRate = (id: string) => {
    storageService.deleteDeliveryDistanceRate(id);
    setDistanceRates(distanceRates.filter(r => r.id !== id));
    posAudio.chime();
  };

  return (
    <div className="space-y-6">
      {successMessage && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs font-semibold flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Ativar Delivery */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">🛵 Delivery</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={deliveryEnabled}
              onChange={(e) => setDeliveryEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Delivery habilitado</span>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => setPickupEnabled(e.target.checked)}
              className="w-4 h-4 rounded accent-orange-500"
            />
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Retirada no local</span>
          </label>
        </div>
      </div>

      {/* Forma de Cálculo da Taxa */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">💰 Taxa de Entrega</h3>
        
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {(['free', 'fixed', 'neighborhood', 'distance'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setFeeType(type)}
              className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                feeType === type
                  ? 'bg-orange-500 text-white'
                  : 'bg-slate-100 dark:bg-[#27272a] text-slate-600 dark:text-slate-400 hover:bg-slate-200'
              }`}
            >
              {type === 'free' && 'Grátis'}
              {type === 'fixed' && 'Taxa Fixa'}
              {type === 'neighborhood' && 'Por Bairro'}
              {type === 'distance' && 'Por Distância'}
            </button>
          ))}
        </div>

        {feeType === 'fixed' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Taxa fixa (R$)</label>
              <input
                type="number"
                value={fixedFee}
                onChange={(e) => setFixedFee(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pedido mínimo (R$)</label>
              <input
                type="number"
                value={minimumOrder}
                onChange={(e) => setMinimumOrder(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
            </div>
          </div>
        )}

        {feeType === 'neighborhood' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
              <input
                value={newNeighborhood}
                onChange={(e) => setNewNeighborhood(e.target.value)}
                placeholder="Nome do bairro"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <input
                value={newNeighborhoodFee}
                onChange={(e) => setNewNeighborhoodFee(e.target.value)}
                placeholder="Taxa R$"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <input
                value={newNeighborhoodTime}
                onChange={(e) => setNewNeighborhoodTime(e.target.value)}
                placeholder="Tempo (min)"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <button
                onClick={handleAddNeighborhood}
                className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            {neighborhoods.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {neighborhoods.map((n) => (
                  <div key={n.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {n.neighborhood} — R$ {n.fee.toFixed(2)} — {n.estimatedTimeMinutes}min
                    </span>
                    <button onClick={() => handleDeleteNeighborhood(n.id)} className="text-rose-500 hover:text-rose-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {feeType === 'distance' && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <input
                value={newDistMin}
                onChange={(e) => setNewDistMin(e.target.value)}
                placeholder="Min km"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <input
                value={newDistMax}
                onChange={(e) => setNewDistMax(e.target.value)}
                placeholder="Max km"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <input
                value={newDistFee}
                onChange={(e) => setNewDistFee(e.target.value)}
                placeholder="Taxa R$"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <input
                value={newDistTime}
                onChange={(e) => setNewDistTime(e.target.value)}
                placeholder="Tempo (min)"
                type="number"
                className="px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
              />
              <button
                onClick={handleAddDistanceRate}
                className="px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus className="w-3 h-3" /> Adicionar
              </button>
            </div>
            {distanceRates.length > 0 && (
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {distanceRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-[#09090b]">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      {r.minKm}km — {r.maxKm}km — R$ {r.fee.toFixed(2)} — {r.estimatedTimeMinutes}min
                    </span>
                    <button onClick={() => handleDeleteDistanceRate(r.id)} className="text-rose-500 hover:text-rose-400">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Configurações Gerais */}
      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">⚙️ Configurações Gerais</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Tempo estimado (min)</label>
            <input
              type="number"
              value={estimatedTime}
              onChange={(e) => setEstimatedTime(parseInt(e.target.value) || 45)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Distância máxima (km)</label>
            <input
              type="number"
              value={maxDistance}
              onChange={(e) => setMaxDistance(parseInt(e.target.value) || 15)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">WhatsApp (pedidos PIX)</label>
            <input
              type="text"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              placeholder="11999999999"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Endereço completo</label>
            <input
              type="text"
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="Rua, número, bairro, cidade"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </div>

      {/* Botão Salvar */}
      <button
        onClick={handleSaveSettings}
        disabled={saving}
        className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2"
      >
        {saving ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
        ) : (
          <><Save className="w-4 h-4" /> Salvar Configurações de Delivery</>
        )}
      </button>
    </div>
  );
};
