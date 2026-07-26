import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  loading?: boolean;
  loadingText?: string;
  spinnerPosition?: 'left' | 'right';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  children,
  loading = false,
  loadingText,
  disabled,
  spinnerPosition = 'left',
  className = '',
  ...props
}) => {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`relative inline-flex items-center justify-center gap-2 transition-all ${className}`}
    >
      {loading && spinnerPosition === 'left' && (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      )}
      <span className={loading ? 'opacity-90' : ''}>
        {loading && loadingText ? loadingText : children}
      </span>
      {loading && spinnerPosition === 'right' && (
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
      )}
    </button>
  );
};
