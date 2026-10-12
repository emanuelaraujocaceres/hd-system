import React, { useState } from 'react';
import { Package } from 'lucide-react';

interface ProductImageProps {
  /** URL da imagem (pode ser vazia/null) */
  src?: string | null;
  /** Texto alternativo (nome do produto) */
  alt: string;
  /** Classes CSS do container/imagem */
  className?: string;
  /** Ícone de fallback (default: Package) */
  fallbackIcon?: React.ReactNode;
}

/**
 * Imagem de produto com fallback robusto.
 * 
 * Comportamento:
 * - Se src vazio/null → mostra placeholder (ícone)
 * - Se a imagem falhar ao carregar → mostra placeholder SEM tentar de novo
 *   (evita loops de 404 em URLs quebradas)
 * - loading="lazy" para economizar rede em listas grandes
 * 
 * Uso:
 *   <ProductImage src={produto.imageUrl} alt={produto.name} className="w-10 h-10 rounded-xl" />
 */
export const ProductImage: React.FC<ProductImageProps> = ({
  src,
  alt,
  className = '',
  fallbackIcon,
}) => {
  const [erro, setErro] = useState(false);

  // Sem URL ou já falhou → placeholder
  if (!src || src.trim() === '' || erro) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-100 dark:bg-[#18181b] ${className}`}
        title={alt}
      >
        {fallbackIcon || <Package className="w-1/2 h-1/2 text-slate-400 dark:text-[#71717a]" />}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setErro(true)}
    />
  );
};