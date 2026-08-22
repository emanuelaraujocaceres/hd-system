/**
 * useModuleVisibility - Hook para estado reativo da visibilidade de módulos
 * 
 * Retorna as configurações de visibilidade da filial atual
 * e re-renderiza automaticamente quando os dados mudam
 */

import { useState, useEffect } from 'react';
import { storageService } from '../services/storageService';

export function useModuleVisibility() {
  const [moduleVisibility, setModuleVisibility] = useState(() => 
    storageService.getEffectiveModuleVisibility()
  );

  useEffect(() => {
    // Subscribe to storage changes
    const unsub = storageService.subscribe(() => {
      setModuleVisibility(storageService.getEffectiveModuleVisibility());
    });
    
    // Initial load
    setModuleVisibility(storageService.getEffectiveModuleVisibility());
    
    return () => { unsub(); };
  }, []);

  return moduleVisibility;
}

export default useModuleVisibility;
