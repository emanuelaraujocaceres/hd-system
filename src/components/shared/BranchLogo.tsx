import React, { useState } from 'react';
import { storageService } from '../../services/storageService';

export const DEFAULT_HD_LOGO = '/logo-hd-system/android-chrome-192x192.png';

interface BranchLogoProps {
  /** Classe CSS aplicada à <img> (ex.: "w-9 h-9 rounded-xl") */
  className?: string;
  /** Se true, mostra o placeholder transparente mesmo sem logo (para layout estável) */
  keepSpace?: boolean;
  /** Alt alternativo (acessibilidade) */
  alt?: string;
}

/**
 * Logo que respeita o branchTheme.logoUrl da filial atual, com fallback
 * para o logo padrão do HD-System.
 *
 * A leitura é feita via storageService.getBranchTheme() a cada render — como
 * App.tsx re-renderiza a árvore quando o storageService.notify() dispara
 * (incluindo ao salvar o tema/logo), este componente reflete a mudança sem
 * gestão de estado local própria.
 */
export const BranchLogo: React.FC<BranchLogoProps> = ({
  className = 'w-9 h-9 rounded-xl',
  keepSpace = false,
  alt = 'HD-System',
}) => {
  const theme = storageService.getBranchTheme();
  const branchLogoUrl = theme?.logoUrl;
  const [failed, setFailed] = useState(false);

  // Se o logo da filial falhou ao carregar (URL quebrada), cai para o HD.
  const src = branchLogoUrl && !failed ? branchLogoUrl : DEFAULT_HD_LOGO;

  // Quando não há logo de filial definido, apenas o logo HD é renderizado.
  // keepSpace é útil quando o fallback visual não deve colapsar o layout.
  if (!branchLogoUrl && !keepSpace) {
    return <img src={DEFAULT_HD_LOGO} alt={alt} className={className} />;
  }

  const onError = () => {
    // Só marca falha se o logo da filial quebrou; o HD não deve resetar "failed".
    if (branchLogoUrl && !failed) setFailed(true);
  };

  return <img src={src} alt={alt} className={className} onError={onError} />;
};

export default BranchLogo;
