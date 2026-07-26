import React, { useState } from 'react';
import {
  X,
  Lock,
  Unlock,
  DollarSign,
  PlusCircle,
  MinusCircle,
  CheckCircle2,
  AlertCircle,
  Receipt,
} from 'lucide-react';
import { CashRegisterSession, UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';

interface CaixaModalProps {
  isOpen: boolean;
  onClose: () => void;
  caixaSession: CashRegisterSession;
  user: UserProfile;
}

export const CaixaModal: React.FC<CaixaModalProps> = ({
  isOpen,
  onClose,
  caixaSession,
  user,
}) => {
  const isCaixaOpen = caixaSession && caixaSession.status === 'open';

  // Forms state
  const [initialCashInput, setInitialCashInput] = useState<number>(250);
  const [openingNotes, setOpeningNotes] = useState<string>('Troco padrão de abertura.');

  const [suprimentoAmount, setSuprimentoAmount] = useState<string>('');
  const [suprimentoReason, setSuprimentoReason] = useState<string>('');

  const [sangriaAmount, setSangriaAmount] = useState<string>('');
  const [sangriaReason, setSangriaReason] = useState<string>('');

  const [closeNotes, setCloseNotes] = useState<string>('');

  const [activeTab, setActiveTab] = useState<'resumo' | 'suprimento' | 'sangria' | 'fechar'>('resumo');

  if (!isOpen) return null;

  const handleOpenCaixa = (e: React.FormEvent) => {
    e.preventDefault();
    storageService.openNewCaixaSession(user.id, user.name, initialCashInput, openingNotes);
    posAudio.chime();
    onClose();
  };

  const handleSuprimento = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(suprimentoAmount);
    if (!isNaN(val) && val > 0) {
      storageService.addSuprimento(val, suprimentoReason || 'Suprimento de Caixa');
      posAudio.beep();
      setSuprimentoAmount('');
      setSuprimentoReason('');
      setActiveTab('resumo');
    }
  };

  const handleSangria = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(sangriaAmount);
    if (!isNaN(val) && val > 0) {
      if (val > caixaSession.currentCashBalance) {
        alert(`Saldo insuficiente para sangria. Saldo disponível: R$ ${caixaSession.currentCashBalance.toFixed(2)}`);
        return;
      }
      storageService.addSangria(val, sangriaReason || 'Sangria de Caixa');
      posAudio.beep();
      setSangriaAmount('');
      setSangriaReason('');
      setActiveTab('resumo');
    }
  };

  const handleCloseCaixa = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm('Tem certeza que deseja fechar o caixa? Esta ação não pode ser desfeita.')) {
      return;
    }
    storageService.closeCaixaSession(closeNotes || 'Caixa encerrado no horário.');
    posAudio.chime();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-xl ${
                isCaixaOpen
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}
            >
              {isCaixaOpen ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">
                {isCaixaOpen ? 'Gestão do Caixa Ativo' : 'Abertura de Caixa'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Operador: <span className="font-semibold">{user.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {!isCaixaOpen ? (
            /* FORM ABERTURA DE CAIXA */
            <form onSubmit={handleOpenCaixa} className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-900 dark:text-indigo-200 text-xs leading-relaxed">
                <p className="font-semibold flex items-center gap-1.5 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  Pronto para iniciar as vendas
                </p>
                Insira o saldo inicial em dinheiro (troco) na gaveta para autorizar novos lançamentos de vendas.
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Valor Inicial / Troco (R$)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-sm font-bold text-slate-400">R$</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={initialCashInput}
                    onChange={(e) => setInitialCashInput(parseFloat(e.target.value) || 0)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-base focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  Observações de Abertura
                </label>
                <textarea
                  rows={2}
                  value={openingNotes}
                  onChange={(e) => setOpeningNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
                  placeholder="Ex: Turno da manhã, troco em cédulas de 10 e 20"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-600/20 transition-all flex items-center justify-center gap-2"
              >
                <Unlock className="w-4 h-4" />
                <span>Confirmar Abertura do Caixa</span>
              </button>
            </form>
          ) : (
            /* CAIXA ABERTO - SUB-TABS (Resumo, Suprimento, Sangria, Fechar) */
            <div className="space-y-4">
              {/* Tab Navigation */}
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveTab('resumo')}
                  className={`py-2 rounded-lg transition-all ${
                    activeTab === 'resumo'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Resumo
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('suprimento')}
                  className={`py-2 rounded-lg transition-all ${
                    activeTab === 'suprimento'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Suprimento
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sangria')}
                  className={`py-2 rounded-lg transition-all ${
                    activeTab === 'sangria'
                      ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Sangria
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('fechar')}
                  className={`py-2 rounded-lg transition-all ${
                    activeTab === 'fechar'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  Fechar
                </button>
              </div>

              {/* TAB 1: RESUMO DO CAIXA */}
              {activeTab === 'resumo' && (
                <div className="space-y-4">
                  {/* Big Balance Card */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-900 to-slate-900 text-white shadow-lg space-y-1">
                    <p className="text-xs text-indigo-200">Saldo Atual em Dinheiro na Gaveta</p>
                    <p className="text-3xl font-extrabold tracking-tight text-emerald-400">
                      R$ {caixaSession.currentCashBalance.toFixed(2)}
                    </p>
                    <p className="text-[11px] text-slate-300">
                      Aberto às {new Date(caixaSession.openedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Breakdown List */}
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span>(+) Fundo Inicial (Troco)</span>
                      <span className="font-bold">R$ {caixaSession.initialCash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span>(+) Vendas em Dinheiro</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">
                        R$ {caixaSession.totalSalesCash.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span>(+) Vendas em PIX</span>
                      <span className="font-bold text-sky-600 dark:text-sky-400">
                        R$ {caixaSession.totalSalesPix.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300">
                      <span>(+) Vendas em Cartão (Déb/Créd)</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        R$ {caixaSession.totalSalesCard.toFixed(2)}
                      </span>
                    </div>
                    {caixaSession.suprimentos > 0 && (
                      <div className="flex justify-between p-2.5 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <span>(+) Total de Suprimentos</span>
                        <span className="font-bold">R$ {caixaSession.suprimentos.toFixed(2)}</span>
                      </div>
                    )}
                    {caixaSession.sangrias > 0 && (
                      <div className="flex justify-between p-2.5 rounded-lg bg-rose-500/10 text-rose-700 dark:text-rose-300">
                        <span>(-) Total de Sangrias</span>
                        <span className="font-bold">R$ {caixaSession.sangrias.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TAB 2: SUPRIMENTO (Entrada de Dinheiro) */}
              {activeTab === 'suprimento' && (
                <form onSubmit={handleSuprimento} className="space-y-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-900 dark:text-emerald-300 text-xs">
                    Suprimento é a injeção de dinheiro na gaveta (ex: adição de troco no meio do expediente).
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor do Suprimento (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0,00"
                      value={suprimentoAmount}
                      onChange={(e) => setSuprimentoAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-base focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Motivo / Justificativa
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Reforço de troco moedas"
                      value={suprimentoReason}
                      onChange={(e) => setSuprimentoReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Registrar Suprimento</span>
                  </button>
                </form>
              )}

              {/* TAB 3: SANGRIA (Retirada de Dinheiro) */}
              {activeTab === 'sangria' && (
                <form onSubmit={handleSangria} className="space-y-4">
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 dark:text-amber-300 text-xs">
                    Sangria é a retirada de dinheiro da gaveta por segurança para depositar no cofre ou pagar fornecedor.
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Valor da Sangria (R$)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0,00"
                      value={sangriaAmount}
                      onChange={(e) => setSangriaAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-bold text-base focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Motivo / Destino
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Depósito cofre central"
                      value={sangriaReason}
                      onChange={(e) => setSangriaReason(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <MinusCircle className="w-4 h-4" />
                    <span>Registrar Sangria</span>
                  </button>
                </form>
              )}

              {/* TAB 4: FECHAR CAIXA */}
              {activeTab === 'fechar' && (
                <form onSubmit={handleCloseCaixa} className="space-y-4">
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-900 dark:text-rose-300 text-xs leading-relaxed">
                    Ao fechar o caixa, o sistema gerará o relatório cego de conferência das vendas do turno.
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs space-y-1">
                    <p className="text-slate-500">Saldo Calculado pelo Sistema em Dinheiro:</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      R$ {caixaSession.currentCashBalance.toFixed(2)}
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Observações de Fechamento
                    </label>
                    <textarea
                      rows={2}
                      value={closeNotes}
                      onChange={(e) => setCloseNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-rose-500 outline-none resize-none"
                      placeholder="Ex: Turno encerrado sem divergências"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition-all flex items-center justify-center gap-2"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Encerrar e Fechar Caixa</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
