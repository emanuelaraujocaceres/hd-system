import { ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw, RotateCcw, Copy, Check } from 'lucide-react';
import { useState } from 'react';

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  scope?: string;
  onReset: () => void;
  onReload: () => void;
}

/**
 * Fallback UI shown when ErrorBoundary catches an error.
 * Provides recovery options and error details for debugging.
 */
export function ErrorFallback({ error, errorInfo, scope, onReset, onReload }: ErrorFallbackProps) {
  const [copied, setCopied] = useState(false);

  const errorDetails = [
    `Erro: ${error?.message || 'Desconhecido'}`,
    `Escopo: ${scope || 'App'}`,
    error?.stack ? `\nStack:\n${error.stack}` : '',
    errorInfo?.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : '',
  ].filter(Boolean).join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorDetails);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
      const textarea = document.createElement('textarea');
      textarea.value = errorDetails;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#09090b] p-4">
      <div className="max-w-lg w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8 text-center">
        {/* Icon */}
        <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
        </div>

        {/* Title */}
        <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
          Algo deu errado
        </h1>
        <p className="text-slate-600 dark:text-slate-400 text-sm mb-6">
          {scope
            ? `Ocorreu um erro no componente "${scope}".`
            : 'Ocorreu um erro inesperado na aplicação.'}
          <br />
          Você pode tentar voltar ou recarregar a página.
        </p>

        {/* Error message (dev-friendly) */}
        {error && (
          <div className="mb-6 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-left">
            <p className="text-xs font-mono text-red-700 dark:text-red-300 break-all">
              {error.message}
            </p>
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={onReset}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg font-medium transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Tentar novamente
          </button>
          <button
            onClick={onReload}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Recarregar página
          </button>
        </div>

        {/* Copy error details */}
        <button
          onClick={handleCopy}
          className="mt-4 flex items-center justify-center gap-2 mx-auto px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-green-500" />
              Copiado!
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copiar detalhes do erro
            </>
          )}
        </button>
      </div>
    </div>
  );
}
