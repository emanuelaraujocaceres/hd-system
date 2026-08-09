/**
 * DeliveryQRCode - Gera QR Code e link compartilhável para a página de delivery
 */

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { QrCode, Copy, Download, Share2, CheckCircle, Link as LinkIcon } from 'lucide-react';
import { StoreBranch } from '../../types';

interface DeliveryQRCodeProps {
  branch: StoreBranch;
}

export const DeliveryQRCode: React.FC<DeliveryQRCodeProps> = ({ branch }) => {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [deliveryUrl, setDeliveryUrl] = useState('');

  useEffect(() => {
    generateQRCode();
  }, [branch.id]);

  const generateQRCode = async () => {
    const baseUrl = window.location.origin + window.location.pathname;
    const url = `${baseUrl}#/delivery/${branch.id}`;
    setDeliveryUrl(url);
    
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' },
      });
      setQrCodeUrl(qrDataUrl);
    } catch (err) {
      console.error('Erro ao gerar QR Code:', err);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(deliveryUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadQR = () => {
    if (!qrCodeUrl) return;
    const link = document.createElement('a');
    link.download = `delivery-qr-${branch.name.replace(/\s+/g, '-').toLowerCase()}.png`;
    link.href = qrCodeUrl;
    link.click();
  };

  return (
    <div className="p-6 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-4">
      <div className="text-center">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">🛵 QR Code do Delivery</h3>
        <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1">
          Compartilhe com seus clientes para acessarem o cardápio digital
        </p>
      </div>

      {/* QR Code */}
      <div className="flex justify-center">
        {qrCodeUrl ? (
          <img src={qrCodeUrl} alt="QR Code Delivery" className="w-48 h-48 rounded-xl" />
        ) : (
          <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center">
            <QrCode className="w-12 h-12 text-slate-300" />
          </div>
        )}
      </div>

      {/* URL */}
      <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-[#09090b]">
        <LinkIcon className="w-4 h-4 text-slate-400 shrink-0" />
        <input
          type="text"
          value={deliveryUrl}
          readOnly
          className="flex-1 bg-transparent text-xs text-slate-600 dark:text-slate-400 outline-none"
        />
        <button
          onClick={handleCopyLink}
          className="p-1.5 rounded-lg bg-orange-500 text-white"
        >
          {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>

      {/* Botões */}
      <div className="flex gap-2">
        <button
          onClick={handleDownloadQR}
          className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-white text-xs font-bold flex items-center justify-center gap-2"
        >
          <Download className="w-4 h-4" />
          Baixar QR Code
        </button>
        <button
          onClick={() => {
            if (navigator.share) {
              navigator.share({ title: `Delivery - ${branch.name}`, url: deliveryUrl });
            }
          }}
          className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold flex items-center justify-center gap-2"
        >
          <Share2 className="w-4 h-4" />
          Compartilhar
        </button>
      </div>
    </div>
  );
};
