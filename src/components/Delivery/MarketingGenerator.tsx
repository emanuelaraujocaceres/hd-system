/**
 * MarketingGenerator - Gerador de posts para redes sociais
 * 
 * Cria imagens para propaganda do delivery usando HTML Canvas
 * Formatos: Instagram (1080x1080), Facebook (1200x630), WhatsApp (1080x1080)
 * 
 * Funcionalidades:
 * - Templates de fundo pré-definidos com efeitos
 * - Selecionar produtos do cardápio
 * - Mensagem de call-to-action personalizável
 * - Inclui QR Code e link do delivery
 * - Download da imagem gerada
 * 
 * Tudo gratuito, sem IA, usando apenas HTML Canvas
 */

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { Download, Image, Type, Palette, Sparkles, CheckCircle } from 'lucide-react';
import { StoreBranch, Product } from '../../types';
import { storageService } from '../../services/storageService';

interface MarketingGeneratorProps {
  branch: StoreBranch;
}

type SocialPlatform = 'instagram' | 'facebook' | 'whatsapp' | 'all';

interface Template {
  id: string;
  name: string;
  bgGradient: string[];
  textColor: string;
  accentColor: string;
  pattern?: string;
}

const TEMPLATES: Template[] = [
  { id: 'sunset', name: 'Pôr do Sol', bgGradient: ['#FF6B35', '#F7931E', '#FFD700'], textColor: '#FFFFFF', accentColor: '#FF6B35' },
  { id: 'ocean', name: 'Oceano', bgGradient: ['#0077B6', '#00B4D8', '#90E0EF'], textColor: '#FFFFFF', accentColor: '#0077B6' },
  { id: 'forest', name: 'Natureza', bgGradient: ['#2D6A4F', '#40916C', '#74C69D'], textColor: '#FFFFFF', accentColor: '#2D6A4F' },
  { id: 'elegant', name: 'Elegante', bgGradient: ['#1A1A2E', '#16213E', '#0F3460'], textColor: '#FFFFFF', accentColor: '#E94560' },
  { id: 'vibrant', name: 'Vibrante', bgGradient: ['#7209B7', '#560BAD', '#480CA8'], textColor: '#FFFFFF', accentColor: '#F72585' },
  { id: 'food', name: 'Gastronômico', bgGradient: ['#D62828', '#F77F00', '#FCBF49'], textColor: '#FFFFFF', accentColor: '#D62828' },
  { id: 'minimal', name: 'Minimalista', bgGradient: ['#F8F9FA', '#E9ECEF', '#DEE2E6'], textColor: '#212529', accentColor: '#495057' },
  { id: 'dark', name: 'Dark', bgGradient: ['#0D1B2A', '#1B263B', '#415A77'], textColor: '#FFFFFF', accentColor: '#E0E1DD' },
];

const PLATFORM_SIZES = {
  instagram: { width: 1080, height: 1080, label: 'Instagram (1080x1080)' },
  facebook: { width: 1200, height: 630, label: 'Facebook (1200x630)' },
  whatsapp: { width: 1080, height: 1080, label: 'WhatsApp (1080x1080)' },
  all: { width: 1080, height: 1080, label: 'Todos (1080x1080)' },
};

const CALL_TO_ACTIONS = [
  'Peça já pelo delivery! 🛵',
  'Peça agora e receba em casa! 🏠',
  'Delivery rápido e prático! ⚡',
  'Faça seu pedido pelo link! 📱',
  'Peça já! Entrega rápida! 🚀',
  'Cardápio digital - Peça online! 🍽️',
];

export const MarketingGenerator: React.FC<MarketingGeneratorProps> = ({ branch }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<Product[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>(TEMPLATES[0]);
  const [platform, setPlatform] = useState<SocialPlatform>('instagram');
  const [callToAction, setCallToAction] = useState(CALL_TO_ACTIONS[0]);
  const [customMessage, setCustomMessage] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');
  const [generated, setGenerated] = useState(false);

  const deliveryUrl = `${window.location.origin}${window.location.pathname}#/delivery/${branch.id}`;

  useEffect(() => {
    loadProducts();
    generateQR();
  }, [branch.id]);

  useEffect(() => {
    if (canvasRef.current) {
      generateImage();
    }
  }, [selectedProducts, selectedTemplate, platform, callToAction, customMessage, qrCodeUrl]);

  const loadProducts = () => {
    const all = storageService.getProducts().filter(p => p.active !== false && p.showOnCardapio !== false);
    setProducts(all);
    setSelectedProducts(all.slice(0, 3));
  };

  const generateQR = async () => {
    try {
      const url = await QRCode.toDataURL(deliveryUrl, { width: 120, margin: 1 });
      setQrCodeUrl(url);
    } catch (err) {
      console.error('Erro ao gerar QR:', err);
    }
  };

  const toggleProduct = (product: Product) => {
    if (selectedProducts.find(p => p.id === product.id)) {
      setSelectedProducts(selectedProducts.filter(p => p.id !== product.id));
    } else if (selectedProducts.length < 5) {
      setSelectedProducts([...selectedProducts, product]);
    }
  };

  const generateImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = PLATFORM_SIZES[platform];
    canvas.width = size.width;
    canvas.height = size.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background gradient
    const gradient = ctx.createLinearGradient(0, 0, size.width, size.height);
    selectedTemplate.bgGradient.forEach((color, idx) => {
      gradient.addColorStop(idx / (selectedTemplate.bgGradient.length - 1), color);
    });
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size.width, size.height);

    // Pattern overlay (subtle dots)
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let x = 0; x < size.width; x += 40) {
      for (let y = 0; y < size.height; y += 40) {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Header
    ctx.fillStyle = selectedTemplate.textColor;
    ctx.font = 'bold 48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(branch.name, size.width / 2, 80);

    // Subtitle
    ctx.font = '28px Arial';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Delivery', size.width / 2, 120);

    // Products section
    const productStartY = platform === 'facebook' ? 180 : 200;
    const productHeight = platform === 'facebook' ? 80 : 100;

    selectedProducts.forEach((product, idx) => {
      const y = productStartY + idx * productHeight;
      
      // Product card background
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      const cardX = 100;
      const cardW = size.width - 200;
      const cardH = productHeight - 15;
      roundRect(ctx, cardX, y, cardW, cardH, 15);
      ctx.fill();

      // Product name
      ctx.fillStyle = selectedTemplate.textColor;
      ctx.font = 'bold 32px Arial';
      ctx.textAlign = 'left';
      ctx.fillText(product.name, cardX + 20, y + 40);

      // Product price
      ctx.font = 'bold 28px Arial';
      ctx.fillStyle = selectedTemplate.accentColor;
      ctx.textAlign = 'right';
      ctx.fillText(`R$ ${product.salePrice.toFixed(2)}`, cardX + cardW - 20, y + 40);
    });

    // Call to action
    const ctaY = size.height - (qrCodeUrl ? 280 : 150);
    ctx.fillStyle = selectedTemplate.accentColor;
    const ctaBoxW = size.width - 200;
    roundRect(ctx, 100, ctaY - 30, ctaBoxW, 60, 30);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(callToAction, size.width / 2, ctaY + 15);

    // Custom message
    if (customMessage) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.font = '24px Arial';
      ctx.fillText(customMessage, size.width / 2, ctaY + 60);
    }

    // QR Code
    if (qrCodeUrl) {
      const qrImg = new Image();
      qrImg.src = qrCodeUrl;
      qrImg.onload = () => {
        const qrSize = 120;
        const qrX = size.width - qrSize - 80;
        const qrY = size.height - qrSize - 80;
        ctx.fillStyle = '#FFFFFF';
        roundRect(ctx, qrX - 10, qrY - 10, qrSize + 20, qrSize + 20, 10);
        ctx.fill();
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // Link text
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '18px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Escaneie para pedir', size.width - 80 - qrSize / 2, size.height - 60);
      };
    }

    setGenerated(true);
  };

  const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  };

  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const link = document.createElement('a');
    link.download = `delivery-${branch.name.replace(/\s+/g, '-').toLowerCase()}-${platform}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="p-5 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
        <h3 className="text-sm font-bold text-slate-900 dark:text-white">📱 Marketing do Delivery</h3>
        <p className="text-xs text-slate-500 dark:text-[#71717a] mt-1">
          Crie posts profissionais para redes sociais com os produtos do seu cardápio
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configurações */}
        <div className="space-y-4">
          {/* Plataforma */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Image className="w-4 h-4" /> Plataforma
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {(Object.entries(PLATFORM_SIZES) as [SocialPlatform, typeof PLATFORM_SIZES.instagram][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setPlatform(key)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                    platform === key ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-[#27272a] text-slate-600'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
          </div>

          {/* Template */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Palette className="w-4 h-4" /> Template
            </h4>
            <div className="grid grid-cols-4 gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTemplate(t)}
                  className={`relative h-12 rounded-xl overflow-hidden border-2 transition-all ${
                    selectedTemplate.id === t.id ? 'border-orange-500 scale-105' : 'border-transparent'
                  }`}
                >
                  <div
                    className="absolute inset-0"
                    style={{ background: `linear-gradient(135deg, ${t.bgGradient.join(', ')})` }}
                  />
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-white drop-shadow">
                    {t.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Produtos */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> Produtos (máx. 5)
            </h4>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {products.map((product) => {
                const selected = selectedProducts.find(p => p.id === product.id);
                return (
                  <button
                    key={product.id}
                    onClick={() => toggleProduct(product)}
                    className={`w-full p-2 rounded-lg text-left flex items-center justify-between transition-all ${
                      selected ? 'bg-orange-500/10 border border-orange-500/30' : 'bg-slate-50 dark:bg-[#09090b]'
                    }`}
                  >
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{product.name}</span>
                    <span className="text-xs font-bold text-orange-500">R$ {product.salePrice.toFixed(2)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Call to Action */}
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a] space-y-3">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Type className="w-4 h-4" /> Chamada para Ação
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {CALL_TO_ACTIONS.map((cta) => (
                <button
                  key={cta}
                  onClick={() => setCallToAction(cta)}
                  className={`px-2 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                    callToAction === cta ? 'bg-orange-500 text-white' : 'bg-slate-100 dark:bg-[#27272a] text-slate-600'
                  }`}
                >
                  {cta}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="Mensagem personalizada (opcional)"
              className="w-full px-3 py-2 bg-slate-50 dark:bg-[#09090b] border border-slate-300 dark:border-[#27272a] rounded-xl text-xs font-semibold text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-4">
          <div className="p-4 rounded-2xl bg-white dark:bg-[#18181b] border border-slate-200 dark:border-[#27272a]">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Preview</h4>
              {generated && (
                <button
                  onClick={handleDownload}
                  className="px-3 py-1.5 rounded-lg bg-green-500 hover:bg-green-400 text-white text-xs font-bold flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Baixar
                </button>
              )}
            </div>
            <div className="aspect-square bg-slate-100 dark:bg-[#09090b] rounded-xl overflow-hidden">
              <canvas ref={canvasRef} className="w-full h-full object-contain" />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
            <p className="text-[10px] text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
              <CheckCircle className="w-3 h-3" />
              100% gratuito — Sem IA, sem assinatura, sem limites
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
