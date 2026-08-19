/**
 * DeliveryStatus - Componente que mostra se o delivery está aberto ou fechado
 * 
 * Verifica o horário de funcionamento configurado em delivery_settings
 * e mostra o status em tempo real
 */

import React, { useState, useEffect } from 'react';
import { Clock, X, CheckCircle } from 'lucide-react';
import { DeliverySettings } from '../../types';
import { storageService } from '../../services/storageService';

interface DeliveryStatusProps {
  branchId: string;
}

export interface DeliveryStatusInfo {
  isOpen: boolean;
  nextOpenTime: string | null;
  nextCloseTime: string | null;
  currentDay: string;
}

export const useDeliveryStatus = (branchId: string): DeliveryStatusInfo => {
  const [status, setStatus] = useState<DeliveryStatusInfo>({
    isOpen: true,
    nextOpenTime: null,
    nextCloseTime: null,
    currentDay: '',
  });

  useEffect(() => {
    const checkStatus = () => {
      const settings = storageService.getDeliverySettings();
      if (!settings || settings.storeBranchId !== branchId || !settings.isActive || !settings.deliveryEnabled) {
        setStatus({ isOpen: false, nextOpenTime: null, nextCloseTime: null, currentDay: '' });
        return;
      }

      const now = new Date();
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const currentDay = dayNames[now.getDay()];
      const currentMinutes = now.getHours() * 60 + now.getMinutes();

      const hours = settings.operatingHours || {};
      const todayHours = hours[currentDay];

      if (!todayHours || !todayHours.open || !todayHours.close) {
        setStatus({ isOpen: false, nextOpenTime: null, nextCloseTime: null, currentDay });
        return;
      }

      const [openHour, openMin] = todayHours.open.split(':').map(Number);
      const [closeHour, closeMin] = todayHours.close.split(':').map(Number);
      const openMinutes = openHour * 60 + openMin;
      const closeMinutes = closeHour * 60 + closeMin;

      const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

      setStatus({
        isOpen,
        nextOpenTime: isOpen ? null : todayHours.open,
        nextCloseTime: isOpen ? todayHours.close : null,
        currentDay,
      });
    };

    checkStatus();
    const interval = setInterval(checkStatus, 60000); // Verifica a cada minuto
    return () => clearInterval(interval);
  }, [branchId]);

  return status;
};

export const DeliveryStatusBadge: React.FC<{ branchId: string }> = ({ branchId }) => {
  const status = useDeliveryStatus(branchId);

  if (!status.isOpen) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-rose-500/10 border border-rose-500/20">
        <X className="w-3 h-3 text-rose-500" />
        <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
          Fechado
          {status.nextOpenTime && <span className="font-normal"> - Abre às {status.nextOpenTime}</span>}
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
      <CheckCircle className="w-3 h-3 text-emerald-500" />
      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
        Aberto
        {status.nextCloseTime && <span className="font-normal"> - Fecha às {status.nextCloseTime}</span>}
      </span>
    </div>
  );
};

export const DeliveryHoursDisplay: React.FC<{ branchId: string; compact?: boolean }> = ({ branchId, compact = false }) => {
  const [hours, setHours] = useState<any>(null);

  useEffect(() => {
    const settings = storageService.getDeliverySettings();
    if (settings && settings.storeBranchId === branchId) {
      setHours(settings.operatingHours);
    }
  }, [branchId]);

  if (!hours || Object.keys(hours).length === 0) return null;

  const days: Record<string, string> = {
    monday: 'Seg',
    tuesday: 'Ter',
    wednesday: 'Qua',
    thursday: 'Qui',
    friday: 'Sex',
    saturday: 'Sáb',
    sunday: 'Dom',
  };

  const fullDays: Record<string, string> = {
    monday: 'Segunda',
    tuesday: 'Terça',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sábado',
    sunday: 'Domingo',
  };

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-[10px] text-slate-500">
        <Clock className="w-3 h-3" />
        <span>Ver horários</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {dayOrder.map(day => {
        const schedule = hours[day];
        const isToday = new Date().toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase() === day;
        return (
          <div key={day} className={`flex items-center justify-between text-[10px] ${isToday ? 'font-bold text-orange-500' : 'text-slate-500'}`}>
            <span>{fullDays[day]}</span>
            <span>
              {schedule?.open && schedule?.close
                ? `${schedule.open} - ${schedule.close}`
                : 'Fechado'}
            </span>
          </div>
        );
      })}
    </div>
  );
};
