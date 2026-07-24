import React, { useState, useEffect } from 'react';
import {
  Tv,
  Play,
  Pause,
  Maximize2,
  Minimize2,
  Sparkles,
  ShoppingBag,
  Building2,
  QrCode,
  Tag,
  ChevronLeft,
  ChevronRight,
  Clock,
  Zap,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
} from 'lucide-react';
import { Product, StoreBranch, SystemSettings } from '../../types';
import { posAudio } from '../../services/audioService';

interface TVShowcaseViewProps {
  products: Product[];
  currentBranch: StoreBranch;
  settings: SystemSettings;
  onCloseTVMode?: () => void;
}

export const TVShowcaseView: React.FC<TVShowcaseViewProps> = ({
  products,
  currentBranch,
  settings,
  onCloseTVMode,
}) => {
  // Get products marked for TV display (or fallback to top 6 if none selected)
  const tvProducts = products.filter((p) => p.active && p.showOnTV);
  const displayList = tvProducts.length > 0 ? tvProducts : products.slice(0, 8);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideSpeed, setSlideSpeed] = useState<number>(6); // seconds
  const [displayMode, setDisplayMode] = useState<'single' | 'grid'>('single');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [timeString, setTimeString] = useState('');

  // Clock ticker for TV
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeString(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Filter list by category if selected
  const categories = Array.from(new Set(displayList.map((p) => p.category)));
  const filteredList =
    selectedCategory === 'all'
      ? displayList
      : displayList.filter((p) => p.category === selectedCategory);

  // Auto slide loop
  useEffect(() => {
    if (!isPlaying || filteredList.length <= 1) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % filteredList.length);
    }, slideSpeed * 1000);

    return () => clearInterval(interval);
  }, [isPlaying, slideSpeed, filteredList.length]);

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % filteredList.length);
    posAudio.beep();
  };

  const handlePrev = () => {
    setCurrentIndex((prev) => (prev - 1 + filteredList.length) % filteredList.length);
    posAudio.beep();
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  const activeProduct = filteredList[currentIndex] || filteredList[0];

  return (
    <div className="min-h-screen bg-[#09090b] text-white flex flex-col justify-between overflow-hidden relative font-sans select-none animate-fadeIn">
      {/* Background Animated Gradient Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/40 via-purple-950/20 to-black pointer-events-none" />
      <div className="absolute top-1/4 -left-48 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-48 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Slide Countdown Progress Bar */}
      {isPlaying && filteredList.length > 1 && (
        <div className="w-full h-1.5 bg-zinc-900 relative overflow-hidden z-20">
          <div
            key={`${currentIndex}-${slideSpeed}`}
            className="h-full bg-gradient-to-r from-amber-400 via-indigo-500 to-emerald-400 animate-progressBar"
            style={{ animationDuration: `${slideSpeed}s` }}
          />
        </div>
      )}

      {/* TOP TV HEADER */}
      <header className="px-6 md:px-12 py-5 bg-black/60 backdrop-blur-xl border-b border-zinc-800/80 flex items-center justify-between z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 p-0.5 shadow-lg shadow-indigo-500/20 flex items-center justify-center">
            <div className="w-full h-full bg-zinc-950 rounded-[14px] flex items-center justify-center font-bold text-lg text-amber-400">
              HD
            </div>
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-black tracking-tight flex items-center gap-3">
              <span>{settings.companyName || 'HD-System ERP'}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-extrabold tracking-wider uppercase">
                OFERTAS TV
              </span>
            </h1>
            <p className="text-xs text-zinc-400 flex items-center gap-2 mt-0.5 font-medium">
              <Building2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>{currentBranch.name} ({currentBranch.city} - {currentBranch.state})</span>
            </p>
          </div>
        </div>

        {/* Header Controls & Live Clock */}
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900/90 border border-zinc-800 font-mono text-sm font-bold text-zinc-200">
            <Clock className="w-4 h-4 text-amber-400" />
            <span>{timeString}</span>
          </div>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            <QrCode className="w-4 h-4" />
            <span className="hidden sm:inline">Pagar / Pedir via QR Code</span>
          </button>

          {onCloseTVMode && (
            <button
              onClick={onCloseTVMode}
              className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white transition-colors"
              title="Sair do Modo TV"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* MAIN SHOWCASE CONTENT AREA */}
      <main className="flex-1 p-6 md:p-12 flex flex-col justify-center relative z-10 overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="text-center py-16 space-y-4 max-w-md mx-auto">
            <div className="w-20 h-20 rounded-3xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center mx-auto">
              <Tv className="w-10 h-10" />
            </div>
            <h3 className="text-2xl font-bold text-white">Nenhum Produto na Vitrine da TV</h3>
            <p className="text-sm text-zinc-400">
              Vá no módulo de Estoque do HD-System e marque a caixa de seleção <strong className="text-amber-400 font-bold">"📺 Exibir na TV"</strong> nos produtos que deseja destacar.
            </p>
          </div>
        ) : displayMode === 'single' && activeProduct ? (
          /* SINGLE PRODUCT GIANT SPOTLIGHT MODE */
          <div className="max-w-6xl mx-auto w-full grid grid-cols-1 lg:grid-cols-12 gap-8 md:gap-12 items-center my-auto">
            {/* Left Image Box */}
            <div className="lg:col-span-5 relative group">
              <div className="absolute -inset-4 bg-gradient-to-r from-amber-500/20 via-indigo-500/20 to-purple-500/20 rounded-3xl blur-2xl group-hover:opacity-100 transition-opacity" />
              <div className="relative aspect-square rounded-3xl overflow-hidden border-2 border-zinc-800 bg-zinc-900/90 shadow-2xl flex items-center justify-center p-6">
                <img
                  src={activeProduct.imageUrl || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=600&q=80'}
                  alt={activeProduct.name}
                  className="w-full h-full object-contain drop-shadow-2xl transition-transform duration-700 group-hover:scale-105"
                />

                {/* Highlight Tag Badge */}
                {activeProduct.tvHighlightTag && (
                  <div className="absolute top-4 left-4 px-4 py-2 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 text-black font-black text-xs md:text-sm tracking-wide shadow-xl flex items-center gap-1.5 animate-bounce">
                    <Sparkles className="w-4 h-4 fill-black" />
                    <span>{activeProduct.tvHighlightTag}</span>
                  </div>
                )}

                {/* Savings Badge */}
                {activeProduct.tvPromoPrice && activeProduct.tvPromoPrice < activeProduct.salePrice && (
                  <div className="absolute bottom-4 right-4 px-3.5 py-1.5 rounded-xl bg-emerald-500 text-black font-black text-xs shadow-lg">
                    ECONOMIZE R$ {(activeProduct.salePrice - activeProduct.tvPromoPrice).toFixed(2)}
                  </div>
                )}
              </div>
            </div>

            {/* Right Product Info & Giant Pricing */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <span className="px-3.5 py-1 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold uppercase tracking-widest inline-block mb-3">
                  {activeProduct.category} • {activeProduct.unit.toUpperCase()}
                </span>
                <h2 className="text-3xl md:text-5xl font-black text-white leading-tight">
                  {activeProduct.name}
                </h2>
              </div>

              {/* Price Block */}
              <div className="p-6 md:p-8 rounded-3xl bg-zinc-900/80 border border-zinc-800 backdrop-blur-md space-y-2 shadow-2xl">
                <p className="text-xs uppercase tracking-widest text-zinc-400 font-bold">
                  {activeProduct.tvPromoPrice ? 'PREÇO ESPECIAL TV' : 'PREÇO PROMOCIONAL'}
                </p>

                <div className="flex items-baseline gap-4 flex-wrap">
                  {/* Original Crossed Price */}
                  {activeProduct.tvPromoPrice && activeProduct.tvPromoPrice < activeProduct.salePrice && (
                    <span className="text-xl md:text-2xl font-bold text-zinc-500 line-through">
                      R$ {activeProduct.salePrice.toFixed(2)}
                    </span>
                  )}

                  {/* Main Giant Promo Price */}
                  <div className="flex items-baseline gap-1 text-amber-400 font-black text-5xl md:text-7xl tracking-tight">
                    <span className="text-3xl md:text-4xl">R$</span>
                    <span>
                      {(activeProduct.tvPromoPrice || activeProduct.salePrice).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400 font-semibold">
                  <span className="flex items-center gap-1 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" /> Estoque Disponível na Loja
                  </span>
                  <span>Cod: {activeProduct.barcode}</span>
                </div>
              </div>

              {/* Carousel Indicators / Navigation Dots */}
              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePrev}
                    className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 transition-all"
                    title="Anterior"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={handleNext}
                    className="p-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-800 transition-all"
                    title="Próximo"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  {filteredList.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentIndex(idx)}
                      className={`h-2.5 rounded-full transition-all ${
                        idx === currentIndex
                          ? 'w-8 bg-amber-400'
                          : 'w-2.5 bg-zinc-800 hover:bg-zinc-700'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* GRID SHOWCASE MODE (4-ITEM DISPLAY) */
          <div className="max-w-7xl mx-auto w-full space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-black text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-amber-400" />
                <span>Ofertas & Combos em Destaque</span>
              </h2>
              <span className="text-xs text-zinc-400 font-bold">
                Exibindo {filteredList.length} itens no catálogo
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {filteredList.map((prod) => (
                <div
                  key={prod.id}
                  className="p-5 rounded-3xl bg-zinc-900/90 border border-zinc-800 hover:border-amber-500/50 transition-all shadow-xl flex flex-col justify-between group"
                >
                  <div className="relative aspect-square rounded-2xl bg-black/40 overflow-hidden mb-4 p-4 flex items-center justify-center">
                    <img
                      src={prod.imageUrl || 'https://images.unsplash.com/photo-1584308666744-24d5c474f2ae?w=300&q=80'}
                      alt={prod.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                    />
                    {prod.tvHighlightTag && (
                      <span className="absolute top-2 left-2 px-2.5 py-1 rounded-xl bg-amber-500 text-black font-extrabold text-[10px]">
                        {prod.tvHighlightTag}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest block">
                      {prod.category}
                    </span>
                    <h3 className="text-sm font-bold text-white line-clamp-2">{prod.name}</h3>

                    <div className="pt-2 flex items-baseline justify-between border-t border-zinc-800">
                      {prod.tvPromoPrice && prod.tvPromoPrice < prod.salePrice && (
                        <span className="text-xs text-zinc-500 line-through">
                          R$ {prod.salePrice.toFixed(2)}
                        </span>
                      )}
                      <span className="text-xl font-black text-amber-400">
                        R$ {(prod.tvPromoPrice || prod.salePrice).toFixed(2)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* FLOATING / BOTTOM CONTROL BAR FOR OPERATOR / TV */}
      <div className="px-6 py-3 bg-black/80 backdrop-blur-2xl border-t border-zinc-800/80 z-20 flex flex-wrap items-center justify-between gap-4">
        {/* Category Filters */}
        <div className="flex items-center gap-2 overflow-x-auto py-1">
          <button
            onClick={() => {
              setSelectedCategory('all');
              setCurrentIndex(0);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              selectedCategory === 'all'
                ? 'bg-amber-500 text-black shadow-md'
                : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
            }`}
          >
            Todos ({displayList.length})
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => {
                setSelectedCategory(cat);
                setCurrentIndex(0);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-black shadow-md'
                  : 'bg-zinc-900 text-zinc-400 hover:text-white border border-zinc-800'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Rotation & Mode Settings */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setDisplayMode(displayMode === 'single' ? 'grid' : 'single')}
            className="px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-xs font-bold text-zinc-300 flex items-center gap-1.5"
          >
            <Tv className="w-3.5 h-3.5 text-indigo-400" />
            <span>{displayMode === 'single' ? 'Modo Destaque 1x' : 'Modo Grade 4x'}</span>
          </button>

          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-white"
            title={isPlaying ? 'Pausar Rotação' : 'Iniciar Rotação'}
          >
            {isPlaying ? <Pause className="w-4 h-4 text-amber-400" /> : <Play className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* Speed Selector */}
          <select
            value={slideSpeed}
            onChange={(e) => setSlideSpeed(Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-800 text-xs text-zinc-300 font-bold rounded-xl px-2.5 py-1.5 focus:outline-none"
          >
            <option value={4}>4 seg</option>
            <option value={6}>6 seg</option>
            <option value={10}>10 seg</option>
            <option value={15}>15 seg</option>
          </select>

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 hover:text-white"
            title="Tela Cheia (TV)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* SCROLLING MARQUEE BANNER AT BOTTOM */}
      <div className="bg-gradient-to-r from-amber-500 via-indigo-600 to-amber-500 text-black font-extrabold text-xs py-2 px-4 uppercase tracking-wider overflow-hidden whitespace-nowrap border-t border-amber-400 z-20">
        <div className="inline-block animate-marquee space-x-8">
          <span>🔥 PROMOÇÕES IMPERDÍVEIS HOJE NA FILIAL {currentBranch.name.toUpperCase()}</span>
          <span>•</span>
          <span>ACEITAMOS PIX, CARTÃO DE CRÉDITO E DÉBITO</span>
          <span>•</span>
          <span>FAÇA SEU PEDIDO DIRETO NO BALCÃO OU CHAME NO WHATSAPP DE ATENDIMENTO</span>
          <span>•</span>
          <span>QUALIDADE E OS MELHORES PREÇOS GARANTIDOS HD-SYSTEM</span>
        </div>
      </div>

      {/* QR CODE MODAL FOR PAYMENTS & ORDERS */}
      {isQrModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-400" />
                <span>QR Code de Atendimento</span>
              </h3>
              <button
                onClick={() => setIsQrModalOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-white rounded-2xl shadow-inner flex flex-col items-center justify-center space-y-3">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://hd-system-pdv.app/filial/${currentBranch.id}`}
                alt="QR Code"
                className="w-48 h-48 rounded-lg"
              />
              <span className="text-zinc-800 text-xs font-mono font-bold">
                PIX / Cardápio Digital
              </span>
            </div>

            <p className="text-xs text-zinc-400">
              Aponta a câmera do seu celular para ver o catálogo completo, fazer seu pedido ou realizar pagamentos via PIX.
            </p>

            <button
              onClick={() => setIsQrModalOpen(false)}
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-lg transition-colors"
            >
              Fechar QR Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
