/**
 * DeliveryLocationView - Modal de localização da filial para o cliente
 * 
 * Mostra:
 * - Endereço completo da filial
 * - Mapa (iframe OpenStreetMap - gratuito)
 * - Botão "Abrir no Google Maps"
 * - Botão "Compartilhar localização"
 */

import React, { useState } from 'react';
import { MapPin, Navigation, ExternalLink, Share2, Clock, Phone, X } from 'lucide-react';
import { StoreBranch } from '../../types';
import { storageService } from '../../services/storageService';

interface DeliveryLocationViewProps {
  branch: StoreBranch;
  isOpen: boolean;
  onClose: () => void;
}

export const DeliveryLocationView: React.FC<DeliveryLocationViewProps> = ({ branch, isOpen, onClose }) => {
  const [mapError, setMapError] = useState(false);

  if (!isOpen) return null;

  // Montar endereço para busca no mapa
  const addressQuery = branch.fullAddress || `${branch.address}, ${branch.city}, ${branch.state}`;
  const encodedAddress = encodeURIComponent(addressQuery);
  
  // URL do Google Maps para abrir no app
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodedAddress}`;
  
  // URL do OpenStreetMap para iframe (gratuito, sem API key)
  const osmEmbedUrl = branch.latitude && branch.longitude
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${branch.longitude - 0.01}%2C${branch.latitude - 0.01}%2C${branch.longitude + 0.01}%2C${branch.latitude + 0.01}&layer=mapnik&marker=${branch.latitude}%2C${branch.longitude}`
    : null;

  // URL de fallback (busca por endereço)
  const osmSearchUrl = `https://www.openstreetmap.org/query?${encodedAddress}`;

  const handleOpenGoogleMaps = () => {
    window.open(googleMapsUrl, '_blank');
  };

  const handleShareLocation = () => {
    if (navigator.share) {
      navigator.share({
        title: `Localização - ${branch.name}`,
        text: `Venha nos visitar! ${addressQuery}`,
        url: googleMapsUrl,
      });
    } else {
      navigator.clipboard.writeText(googleMapsUrl);
      alert('Link copiado!');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-[#18181b] rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-[#27272a] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">Localização</h3>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-[#27272a] rounded-lg">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Nome da filial */}
          <div>
            <h4 className="text-lg font-bold text-slate-900 dark:text-white">{branch.name}</h4>
            <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1">Estamos te esperando!</p>
          </div>

          {/* Endereço */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#09090b] space-y-2">
            <div className="flex items-start gap-2">
              <MapPin className="w-4 h-4 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{branch.fullAddress || branch.address}</p>
                <p className="text-[10px] text-slate-500">{branch.city}, {branch.state}</p>
              </div>
            </div>
            {branch.phone && (
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-blue-500 shrink-0" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{branch.phone}</p>
              </div>
            )}
          </div>

          {/* Mapa */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-[#27272a]">
            {osmEmbedUrl && !mapError ? (
              <iframe
                src={osmEmbedUrl}
                width="100%"
                height="200"
                style={{ border: 0 }}
                loading="lazy"
                onError={() => setMapError(true)}
                title="Mapa da localização"
              />
            ) : (
              <div 
                className="h-48 bg-slate-100 dark:bg-[#27272a] flex flex-col items-center justify-center cursor-pointer hover:bg-slate-200 dark:hover:bg-[#37272a] transition-all"
                onClick={handleOpenGoogleMaps}
              >
                <MapPin className="w-8 h-8 text-orange-500 mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Toque para ver no mapa</p>
                <p className="text-[10px] text-slate-500">{addressQuery}</p>
              </div>
            )}
          </div>

          {/* Horário de funcionamento (se delivery_settings tiver) */}
          <DeliveryHours branchId={branch.id} />
        </div>

        {/* Botões de ação */}
        <div className="p-4 border-t border-slate-200 dark:border-[#27272a] space-y-2">
          <button
            onClick={handleOpenGoogleMaps}
            className="w-full py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold flex items-center justify-center gap-2"
          >
            <Navigation className="w-4 h-4" />
            Abrir no Google Maps
          </button>
          <button
            onClick={handleShareLocation}
            className="w-full py-3 rounded-xl bg-slate-100 dark:bg-[#27272a] hover:bg-slate-200 dark:hover:bg-[#37272a] text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center justify-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Compartilhar Localização
          </button>
        </div>
      </div>
    </div>
  );
};

// Componente de horário de funcionamento
const DeliveryHours: React.FC<{ branchId: string }> = ({ branchId }) => {
  const [hours, setHours] = useState<any>(null);

  React.useEffect(() => {
    const settings = storageService.getDeliverySettings();
    if (settings && settings.storeBranchId === branchId && settings.operatingHours) {
      setHours(settings.operatingHours);
    }
  }, [branchId]);

  if (!hours || Object.keys(hours).length === 0) return null;

  const days: Record<string, string> = {
    monday: 'Segunda',
    tuesday: 'Terça',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sábado',
    sunday: 'Domingo',
  };

  return (
    <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/20 space-y-2">
      <div className="flex items-center gap-2">
        <Clock className="w-4 h-4 text-orange-500" />
        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Horário de Funcionamento</span>
      </div>
      <div className="grid grid-cols-1 gap-1">
        {Object.entries(days).map(([key, label]) => {
          const schedule = hours[key];
          return (
            <div key={key} className="flex items-center justify-between text-[10px]">
              <span className="font-semibold text-slate-600 dark:text-slate-400">{label}</span>
              <span className="text-slate-500">
                {schedule?.open && schedule?.close
                  ? `${schedule.open} - ${schedule.close}`
                  : 'Fechado'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
