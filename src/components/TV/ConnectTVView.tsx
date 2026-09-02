import React, { useState, useEffect, useRef } from 'react';
import { Tv, Plug, ArrowRight, CheckCircle2, XCircle, RefreshCw, MonitorPlay, X } from 'lucide-react';
import { storageService } from '../../services/storageService';
import { tvPairing } from '../../services/tvPairingService';
import { posAudio } from '../../services/audioService';
import { BranchLogo } from '../shared/BranchLogo';

interface ConnectTVViewProps {
  onEnterTV: () => void;
  /** Chamado pelo botão "Sair" — sai do modo TV (ex.: volta para o PDV). */
  onExitTVMode?: () => void;
}

/**
 * ConnectTVView — tela de pareamento do aparelho de TV / vitrine.
 *
 * Fluxo:
 * 1. No painel (Settings → TV / Vitrine), o operador cadastra a TV e recebe
 *    um código de pareamento de 6 dígitos.
 * 2. Nesta tela (aberta no aparelho da TV), digita-se o código.
 * 3. O aparelho grava localmente o vínculo (tvPairingService) e, se a TV
 *    tiver filial definida, seleciona essa filial.
 * 4. A vitrine mantém o heartbeat a cada 30s (RPC heartbeat_media_device),
 *    deixando a TV "online" no painel.
 */
export const ConnectTVView: React.FC<ConnectTVViewProps> = ({ onEnterTV, onExitTVMode }) => {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [paired, setPaired] = useState(tvPairing.getPairedTv());
  const inputRef = useRef<HTMLInputElement>(null);

  // Foco automático no campo (o aparelho da TV pode não ter teclado físico;
  // teclado virtual é aberto no toque).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleConnect = () => {
    const digits = code.replace(/\D/g, '');
    if (digits.length !== 6) {
      setError('Digite o código de pareamento de 6 dígitos exibido no painel.');
      posAudio.error();
      return;
    }
    setSearching(true);
    setError('');
    // Busca síncrona no storage local (dados já hidratados do cloud).
    setTimeout(() => {
      const device = storageService.findMediaDeviceByPairingCode(digits);
      if (!device) {
        setSearching(false);
        setError('Código não encontrado. Confira se o código está correto e se o painel está sincronizado.');
        posAudio.error();
        return;
      }
      tvPairing.savePairedTv({
        deviceId: device.id,
        branchId: device.storeBranchId,
      });
      if (device.storeBranchId) {
        storageService.setSelectedBranchId(device.storeBranchId);
      }
      setPaired(tvPairing.getPairedTv());
      setSearching(false);
      posAudio.chime();
      onEnterTV();
    }, 350);
  };

  const handleReconnect = () => {
    tvPairing.clearPairedTv();
    setPaired(null);
    setCode('');
    setError('');
    posAudio.click();
  };

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans select-none">
      {/* Background decorativo no estilo da vitrine */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black pointer-events-none" />
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Botão de sair — sem ele o modo TV fica sem saída em aparelhos sem teclado */}
      {onExitTVMode && (
        <button
          onClick={onExitTVMode}
          className="absolute top-4 right-4 z-20 p-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
          title="Sair do Modo TV"
          aria-label="Sair do Modo TV"
        >
          <X className="w-5 h-5" />
        </button>
      )}

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3 mb-8">
          <BranchLogo
            className="w-14 h-14 rounded-2xl object-cover shadow-lg shadow-indigo-500/30"
            alt="HD-System"
          />
          <div>
            <h1 className="text-2xl font-black tracking-tight">HD-System</h1>
            <p className="text-xs text-zinc-400 font-semibold flex items-center gap-1.5">
              <Tv className="w-3.5 h-3.5 text-indigo-400" /> Modo TV / Vitrine
            </p>
          </div>
        </div>

        {paired ? (
          /* Já pareada — botão direto para a vitrine */
          <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-8 text-center backdrop-blur-xl animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex items-center justify-center mx-auto mb-5">
              <MonitorPlay className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-1">TV pareada</h2>
            <p className="text-sm text-zinc-400 mb-6">
              Este aparelho já está conectado. A vitrine mantém a conexão e o painel mostra
              o status <strong className="text-emerald-400">online</strong>.
            </p>
            <button
              onClick={onEnterTV}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
            >
              <ArrowRight className="w-5 h-5" /> Entrar na Vitrine
            </button>
            <button
              onClick={handleReconnect}
              className="mt-3 w-full py-3 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Parear outro dispositivo
            </button>
          </div>
        ) : (
          /* Formulário de pareamento */
          <div className="rounded-3xl bg-zinc-900/80 border border-zinc-800 p-8 backdrop-blur-xl animate-fadeIn">
            <div className="w-16 h-16 rounded-2xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/25 flex items-center justify-center mx-auto mb-5">
              <Plug className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-center mb-1">Conectar esta TV</h2>
            <p className="text-sm text-zinc-400 text-center mb-6 leading-relaxed">
              No painel, vá em <strong className="text-indigo-400">Configurações → TV / Vitrine</strong>,
              cadastre esta TV e digite aqui o <strong className="text-white">código de 6 dígitos</strong> gerado.
            </p>

            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.replace(/\D/g, ''));
                setError('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnect();
                if (e.key === 'Escape') inputRef.current?.blur();
              }}
              placeholder="••••••"
              className="w-full text-center text-3xl font-mono tracking-[0.5em] py-4 rounded-2xl bg-black/50 border border-zinc-700 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 outline-none placeholder:text-zinc-700"
            />

            {error && (
              <p className="mt-3 text-sm text-rose-400 font-semibold flex items-center justify-center gap-1.5">
                <XCircle className="w-4 h-4 shrink-0" /> {error}
              </p>
            )}

            <button
              onClick={handleConnect}
              disabled={searching}
              className="mt-5 w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 disabled:opacity-60 text-white font-bold text-lg flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-600/30"
            >
              <CheckCircle2 className="w-5 h-5" />
              {searching ? 'Verificando código...' : 'Conectar'}
            </button>
          </div>
        )}

        <p className="mt-6 text-center text-[11px] text-zinc-600 font-semibold uppercase tracking-widest">
          O código fica disponível em Configurações → TV / Vitrine
        </p>
      </div>
    </div>
  );
};
