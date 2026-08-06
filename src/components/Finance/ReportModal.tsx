import React, { useState, useEffect, useCallback } from 'react';
import { FileBarChart, X, Loader2, Printer, FileSpreadsheet, CalendarDays, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserProfile } from '../../types';
import { storageService } from '../../services/storageService';
import { posAudio } from '../../services/audioService';
import { fetchReport, downloadCsv, openPrintReport, ReportModel, ReportMeta } from '../../services/reportService';

interface ReportModalProps {
  user: UserProfile;
  onClose: () => void;
}

const todayISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const firstOfMonthISO = () => {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-01`;
};

export const ReportModal: React.FC<ReportModalProps> = ({ user, onClose }) => {
  const [startDate, setStartDate] = useState(firstOfMonthISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState('');
  const [operatorId, setOperatorId] = useState('');
  const [includeCancelled, setIncludeCancelled] = useState(false);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ model: ReportModel; meta: ReportMeta } | null>(null);

  const operators = storageService.getUsers().filter((u) => u.id && /^[0-9a-f-]{36}$/i.test(u.id));

  const run = useCallback(async () => {
    if (!startDate || !endDate) return;
    if (startDate > endDate) {
      setError('A data inicial não pode ser maior que a final.');
      setResult(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetchReport({ startDate, endDate, paymentMethod, operatorId, includeCancelled });
      setResult(res);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar o relatório.');
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, paymentMethod, operatorId, includeCancelled]);

  useEffect(() => {
    run();
  }, [run]);

  const handlePdf = () => {
    if (!result) return;
    try {
      posAudio.chime();
      openPrintReport(result.model, result.meta);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível abrir o relatório.');
    }
  };

  const handleCsv = () => {
    if (!result) return;
    try {
      posAudio.chime();
      downloadCsv(result.model, result.meta);
    } catch (e: any) {
      setError(e?.message || 'Não foi possível exportar o CSV.');
    }
  };

  const kpis = result?.model.kpis;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 w-full max-w-2xl rounded-2xl shadow-2xl p-6 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <FileBarChart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">Relatório Gerencial de Vendas</h3>
              <p className="text-[11px] text-slate-500 dark:text-[#71717a]">
                PDF para apresentar/arquivar + CSV detalhado para o Excel
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" title="Fechar">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filtros */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wide mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wide mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wide mb-1">
              Pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todas</option>
              <option value="cash">Dinheiro</option>
              <option value="pix">PIX</option>
              <option value="credit_card">Cartão de Crédito</option>
              <option value="debit_card">Cartão de Débito</option>
              <option value="credit_account">Fiado / Crédito</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-500 dark:text-[#a1a1aa] uppercase tracking-wide mb-1">
              Operador
            </label>
            <select
              value={operatorId}
              onChange={(e) => setOperatorId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Todos</option>
              {operators.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeCancelled}
            onChange={(e) => setIncludeCancelled(e.target.checked)}
            className="w-4 h-4 rounded accent-indigo-600"
          />
          Incluir vendas canceladas
        </label>

        {/* Resumo ao vivo */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-xs font-bold text-slate-500 dark:text-[#a1a1aa]">
              <Loader2 className="w-4 h-4 animate-spin" />
              Buscando dados do período...
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 py-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : kpis && result ? (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Faturamento</p>
                  <p className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {kpis.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Vendas</p>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">{kpis.saleCount}</p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Ticket Médio</p>
                  <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">
                    {kpis.ticketAverage.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Comissões</p>
                  <p className="text-base font-black text-indigo-600 dark:text-indigo-400 mt-0.5">
                    {kpis.commissionTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-[#71717a] flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                {result.meta.branchName} · {result.meta.startDate} a {result.meta.endDate} ·{' '}
                {kpis.itemsSold} itens · {kpis.discountTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} em descontos
                {result.meta.filters.paymentMethod !== 'Todas' && ` · Pagamento: ${result.meta.filters.paymentMethod}`}
              </p>
            </>
          ) : null}
        </div>

        {/* Ações */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={handlePdf}
            disabled={loading || !result}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Gerar PDF (Imprimir)
          </button>
          <button
            onClick={handleCsv}
            disabled={loading || !result}
            className="min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Exportar CSV (Excel)
          </button>
        </div>

        <p className="text-[10px] text-slate-400 dark:text-[#71717a] flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          No PDF, escolha "Salvar como PDF" na caixa de impressão. O CSV abre direto no Excel (pt-BR).
        </p>
      </div>
    </div>
  );
};
