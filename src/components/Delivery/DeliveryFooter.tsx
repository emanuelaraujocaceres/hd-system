/**
 * DeliveryFooter - Rodapé do cardápio delivery com endereço e botão de localização
 */

import React, { useState } from 'react';
import { MapPin, Navigation, Clock, Phone } from 'lucide-react';
import { StoreBranch } from '../../types';
import { DeliveryLocationView } from './DeliveryLocationView';

interface DeliveryFooterProps {
  branch: StoreBranch;
}

export const DeliveryFooter: React.FC<DeliveryFooterProps> = ({ branch }) => {
  const [showLocation, setShowLocation] = useState(false);

  const address = branch.fullAddress || branch.address;
  if (!address) return null;

  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

  return (
    <>
      <div className="border-t border-slate-200 dark:border-[#27272a] pt-4 mt-6">
        <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#09090b]">
          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 dark:text-white">{branch.name}</p>
            <p className="text-[10px] text-slate-500 dark:text-[#71717a] mt-0.5 line-clamp-2">{address}</p>
            {branch.phone && (
              <p className="text-[10px] text-slate-500 dark:text-[#71717a] mt-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> {branch.phone}
              </p>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setShowLocation(true)}
                className="text-[10px] font-bold text-orange-500 hover:text-orange-600 flex items-center gap-1"
              >
                <MapPin className="w-3 h-3" />
                Ver no mapa
              </button>
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] font-bold text-blue-500 hover:text-blue-600 flex items-center gap-1"
              >
                <Navigation className="w-3 h-3" />
                Como chegar
              </a>
            </div>
          </div>
        </div>
      </div>

      <DeliveryLocationView
        branch={branch}
        isOpen={showLocation}
        onClose={() => setShowLocation(false)}
      />
    </>
  );
};
