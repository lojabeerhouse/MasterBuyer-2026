
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MasterProduct } from '../types';
import { Printer, Type, Search, Image as ImageIcon, Tag, Plus, X, Trash2, Wand2, Upload, Globe, Pencil, Check, Snowflake, Lock } from 'lucide-react';

interface FlyerItem {
    id: string; // Unique Identifier based on product ID
    originalProductId: string;
    name: string;
    priceOriginal: number;
    priceFinal: number;
    image: string;
    unit: string;
    netWeight?: number;
    isFrozen: boolean; // "Ready" state
    isCold: boolean; // "Gelado" badge
}

interface OfferFlyerProps {
  products: MasterProduct[];
}

const OfferFlyer: React.FC<OfferFlyerProps> = ({ products }) => {
  // --- STATE INITIALIZATION WITH PERSISTENCE ---
  const loadLocal = <T,>(key: string, fallback: T): T => {
    try {
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : fallback;
    } catch (e) { return fallback; }
  };

  const [flyerItems, setFlyerItems] = useState<FlyerItem[]>(() => loadLocal('beerhouse_flyer_items', []));
  const [flyerTitle, setFlyerTitle] = useState(() => loadLocal('beerhouse_flyer_title', "OFERTAS DA SEMANA"));
  const [flyerSubtitle, setFlyerSubtitle] = useState(() => loadLocal('beerhouse_flyer_subtitle', "Preços baixos e estoque garantido!"));
  const [discountPercent, setDiscountPercent] = useState(() => loadLocal('beerhouse_flyer_discount', 10));
  const [accentColor, setAccentColor] = useState<'red' | 'amber' | 'blue'>(() => loadLocal('beerhouse_flyer_color', 'red'));

  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeUploadId, setActiveUploadId] = useState<string | null>(null);

  // --- PERSISTENCE EFFECTS ---
  useEffect(() => localStorage.setItem('beerhouse_flyer_items', JSON.stringify(flyerItems)), [flyerItems]);
  useEffect(() => localStorage.setItem('beerhouse_flyer_title', JSON.stringify(flyerTitle)), [flyerTitle]);
  useEffect(() => localStorage.setItem('beerhouse_flyer_subtitle', JSON.stringify(flyerSubtitle)), [flyerSubtitle]);
  useEffect(() => localStorage.setItem('beerhouse_flyer_discount', JSON.stringify(discountPercent)), [discountPercent]);
  useEffect(() => localStorage.setItem('beerhouse_flyer_color', JSON.stringify(accentColor)), [accentColor]);

  // --- LOGIC ---

  const searchResults = useMemo(() => {
    if (!searchTerm.trim()) return [];
    const term = searchTerm.toLowerCase();
    return products
      .filter(p => 
        (p.name.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)) &&
        !flyerItems.find(fi => fi.originalProductId === p.id)
      )
      .slice(0, 10);
  }, [products, searchTerm, flyerItems]);

  const addProduct = (product: MasterProduct) => {
    if (flyerItems.length >= 6) {
        alert("O Flyer suporta no máximo 6 produtos.");
        return;
    }

    const newItem: FlyerItem = {
        id: crypto.randomUUID(),
        originalProductId: product.id,
        name: product.name,
        priceOriginal: product.priceSell,
        priceFinal: product.priceSell * (1 - discountPercent / 100),
        image: product.image || '',
        unit: product.unit,
        netWeight: product.netWeight,
        isFrozen: false, // Starts in Editable mode
        isCold: false
    };

    setFlyerItems([...flyerItems, newItem]);
    setSearchTerm("");
  };

  const removeProduct = (itemId: string) => {
    setFlyerItems(prev => prev.filter(p => p.id !== itemId));
  };

  const autoFillTopStock = () => {
    if (flyerItems.length > 0 && !confirm("Isso substituirá os itens atuais. Continuar?")) return;

    const topStock = [...products]
      .filter(p => p.stock > 0 && p.priceSell > 0)
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 6);
    
    const newItems = topStock.map(p => ({
        id: crypto.randomUUID(),
        originalProductId: p.id,
        name: p.name,
        priceOriginal: p.priceSell,
        priceFinal: p.priceSell * (1 - discountPercent / 100),
        image: p.image || '',
        unit: p.unit,
        netWeight: p.netWeight,
        isFrozen: false, 
        isCold: false
    }));

    setFlyerItems(newItems);
  };

  const updateGlobalDiscount = (newPercent: number) => {
      setDiscountPercent(newPercent);
      setFlyerItems(prev => prev.map(item => {
          // PROTECT FROZEN ITEMS
          if (item.isFrozen) return item;
          return {
              ...item,
              priceFinal: item.priceOriginal * (1 - newPercent / 100)
          };
      }));
  };

  // --- ITEM EDIT LOGIC ---

  const updateItem = (id: string, field: keyof FlyerItem, value: any) => {
      setFlyerItems(prev => prev.map(item => {
          if (item.id === id) {
              return { ...item, [field]: value };
          }
          return item;
      }));
  };

  const toggleFreeze = (id: string) => {
      setFlyerItems(prev => prev.map(item => {
          if (item.id === id) return { ...item, isFrozen: !item.isFrozen };
          return item;
      }));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && activeUploadId) {
          const reader = new FileReader();
          reader.onload = (evt) => {
              if (evt.target?.result) {
                  updateItem(activeUploadId, 'image', evt.target!.result as string);
              }
          };
          reader.readAsDataURL(file);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
      setActiveUploadId(null);
  };

  const triggerUpload = (id: string) => {
      setActiveUploadId(id);
      fileInputRef.current?.click();
  };

  const triggerWebSearch = (item: FlyerItem) => {
      const query = encodeURIComponent(`${item.name} fundo branco`);
      window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank');
      const url = prompt("Cole o link da imagem aqui:");
      if (url) updateItem(item.id, 'image', url);
  };

  // --- STYLES & LAYOUT CALCS ---

  const colors = {
    red: { bg: 'bg-red-600', text: 'text-red-600', border: 'border-red-600', gradient: 'from-red-600 to-red-800', badge: 'bg-red-600' },
    amber: { bg: 'bg-amber-500', text: 'text-amber-600', border: 'border-amber-500', gradient: 'from-amber-500 to-orange-600', badge: 'bg-amber-600' },
    blue: { bg: 'bg-blue-600', text: 'text-blue-600', border: 'border-blue-600', gradient: 'from-blue-600 to-indigo-700', badge: 'bg-blue-600' }
  };
  const theme = colors[accentColor];

  // Dynamic Grid Class generator
  const getGridConfig = (count: number) => {
      switch (count) {
          case 1: return { 
              container: 'grid-cols-1 grid-rows-1', 
              card: 'flex-col justify-center items-center', 
              imgHeight: 'h-[500px] w-full', 
              titleSize: 'text-6xl', 
              priceSize: 'text-9xl',
              layout: 'vertical'
          };
          case 2: return { 
              container: 'grid-cols-1 grid-rows-2 gap-8', 
              card: 'flex-row items-center gap-6 px-12', 
              imgHeight: 'h-[300px] w-[300px] shrink-0', 
              titleSize: 'text-4xl', 
              priceSize: 'text-8xl',
              layout: 'horizontal'
          };
          case 3: return { 
              container: 'grid-cols-1 grid-rows-3 gap-6', 
              card: 'flex-row items-center gap-4 px-8', 
              imgHeight: 'h-52 w-52 shrink-0', 
              titleSize: 'text-3xl', 
              priceSize: 'text-7xl',
              layout: 'horizontal'
          };
          case 4: return { 
              container: 'grid-cols-2 grid-rows-2 gap-6', 
              card: 'flex-col', 
              imgHeight: 'h-64', 
              titleSize: 'text-2xl', 
              priceSize: 'text-6xl',
              layout: 'vertical'
          };
          case 5: 
          case 6: return { 
              container: 'grid-cols-2 grid-rows-3 gap-4', 
              card: 'flex-col', 
              imgHeight: 'h-48', 
              titleSize: 'text-xl', 
              priceSize: 'text-5xl',
              layout: 'vertical'
          };
          default: return { 
              container: 'grid-cols-2 grid-rows-3 gap-4', 
              card: 'flex-col', 
              imgHeight: 'h-32', 
              titleSize: 'text-base', 
              priceSize: 'text-4xl',
              layout: 'vertical'
          };
      }
  };

  const gridStyle = getGridConfig(flyerItems.length);

  return (
    <div className="h-full flex flex-col xl:flex-row gap-6 overflow-hidden">
      <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

      {/* --- SIDEBAR --- */}
      <div className="w-full xl:w-96 bg-slate-800 flex flex-col rounded-lg border border-slate-700 h-full print:hidden shadow-lg overflow-hidden shrink-0">
         <div className="p-5 border-b border-slate-700 bg-slate-900/50">
           <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Tag className="w-6 h-6 text-amber-500"/> Editor de Ofertas
           </h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
            {/* 1. Add Products */}
            <div className="space-y-3">
                <div className="flex justify-between items-center">
                    <label className="text-xs font-bold text-slate-300 uppercase">Produtos ({flyerItems.length}/6)</label>
                    <button onClick={autoFillTopStock} className="text-[10px] flex items-center gap-1 text-amber-500 hover:text-amber-400 bg-slate-900 px-2 py-1 rounded border border-slate-700">
                        <Wand2 className="w-3 h-3"/> Auto-Preencher
                    </button>
                </div>

                <div className="relative z-20">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input 
                        type="text" 
                        placeholder="Pesquisar produto no banco..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded-lg py-2 pl-9 pr-3 text-sm text-white focus:border-amber-500 focus:outline-none"
                    />
                    {searchTerm && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50 divide-y divide-slate-700">
                            {searchResults.map(p => (
                                <button key={p.id} onClick={() => addProduct(p)} className="w-full text-left p-3 hover:bg-slate-700 flex justify-between items-center group">
                                    <div className="overflow-hidden">
                                        <p className="text-sm text-slate-200 truncate">{p.name}</p>
                                        <p className="text-xs text-slate-500">Est: {p.stock}</p>
                                    </div>
                                    <Plus className="w-4 h-4 text-slate-500 group-hover:text-green-400" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* List of Active Items in Sidebar */}
                <div className="bg-slate-900/50 rounded-lg border border-slate-700 divide-y divide-slate-800">
                    {flyerItems.length === 0 && <div className="p-4 text-center text-slate-500 text-xs italic">Lista vazia. Adicione produtos.</div>}
                    {flyerItems.map((item, idx) => (
                        <div key={item.id} className="p-2 flex items-center justify-between group hover:bg-slate-800/50 transition-colors">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-800 w-5 h-5 flex items-center justify-center rounded-full shrink-0">{idx + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs text-slate-300 truncate font-medium">{item.name}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[10px] text-slate-500">R$ {item.priceFinal.toFixed(2)}</p>
                                        {item.isFrozen && <Lock className="w-3 h-3 text-green-500"/>}
                                    </div>
                                </div>
                            </div>
                            <button onClick={() => removeProduct(item.id)} className="text-slate-500 hover:text-red-400 p-1"><X className="w-4 h-4"/></button>
                        </div>
                    ))}
                </div>
            </div>

            {/* 2. Global Settings */}
            <div className="border-t border-slate-700 pt-4 space-y-4">
                 <label className="text-xs font-bold text-slate-300 uppercase">Configurações Gerais</label>
                 
                 <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Título</label>
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2">
                       <Type className="w-4 h-4 text-slate-500"/>
                       <input type="text" value={flyerTitle} onChange={(e) => setFlyerTitle(e.target.value)} className="w-full bg-transparent py-2 text-sm text-white focus:outline-none"/>
                    </div>
                 </div>
                 
                 <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Subtítulo</label>
                    <input type="text" value={flyerSubtitle} onChange={(e) => setFlyerSubtitle(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white focus:outline-none"/>
                 </div>

                 <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block flex justify-between">
                        <span>Desconto Global (%)</span>
                        <span className="text-amber-500 text-[10px] normal-case font-bold">*Ignora itens 'Prontos'</span>
                    </label>
                    <div className="flex items-center gap-2">
                        <input type="range" min="1" max="90" value={discountPercent} onChange={(e) => updateGlobalDiscount(Number(e.target.value))} className="flex-1 accent-amber-500 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer"/>
                        <span className="bg-slate-900 px-2 py-1 rounded w-12 text-center text-xs font-bold text-white border border-slate-700">{discountPercent}%</span>
                    </div>
                 </div>

                 <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase mb-1 block">Cor do Tema</label>
                    <div className="flex gap-2">
                        {['red', 'amber', 'blue'].map((c) => (
                             <button key={c} onClick={() => setAccentColor(c as any)} className={`w-8 h-8 rounded-full border-2 shadow-sm ${accentColor === c ? 'border-white scale-110' : 'border-transparent opacity-50'} bg-${c === 'amber' ? 'amber-500' : c + '-600'}`}></button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        <div className="p-4 bg-slate-900 border-t border-slate-700">
             <button onClick={() => window.print()} disabled={flyerItems.length === 0} className="w-full bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold py-3 rounded shadow-lg flex items-center justify-center gap-2">
                <Printer className="w-5 h-5"/> Imprimir
            </button>
        </div>
      </div>

      {/* --- PREVIEW AREA (A4) --- */}
      <div className="flex-1 bg-slate-900/30 rounded-lg p-4 md:p-8 overflow-y-auto flex justify-center border border-slate-700/50 backdrop-blur-sm">
         <style>{`
            @media print {
                body * { visibility: hidden; }
                #flyer-content, #flyer-content * { visibility: visible; }
                #flyer-content { position: fixed; left: 0; top: 0; width: 100%; height: 100%; margin: 0; padding: 0; background: white; z-index: 9999; -webkit-print-color-adjust: exact; }
                .flyer-edit-controls { display: none !important; }
                @page { size: A4; margin: 0; }
            }
         `}</style>

         <div 
            id="flyer-content"
            className="bg-white text-slate-900 shadow-2xl relative flex flex-col shrink-0 transition-transform origin-top scale-[0.6] sm:scale-[0.7] md:scale-[0.8] lg:scale-[0.9] xl:scale-100"
            style={{ width: '210mm', height: '297mm', padding: '0' }}
         >
            {/* Header */}
            <div className={`h-[15%] bg-gradient-to-r ${theme.gradient} text-white flex flex-col items-center justify-center p-4 text-center shadow-lg relative overflow-hidden`}>
                <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
                <h1 className="text-6xl font-black uppercase tracking-tighter drop-shadow-md z-10 leading-none">{flyerTitle}</h1>
                <p className="text-xl font-medium mt-2 bg-white/20 px-6 py-1 rounded-full backdrop-blur-sm z-10 shadow-sm">{flyerSubtitle}</p>
            </div>

            {/* Grid Area */}
            <div className="flex-1 p-6 relative">
                 {flyerItems.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-300 border-4 border-dashed border-slate-200 rounded-3xl bg-slate-50">
                        <Tag className="w-24 h-24 mb-4 opacity-20"/>
                        <p className="text-2xl font-bold text-slate-400">Área de Ofertas</p>
                    </div>
                ) : (
                    <div className={`grid h-full w-full ${gridStyle.container}`}>
                        {flyerItems.map((item) => {
                             const discount = Math.round((1 - (item.priceFinal / item.priceOriginal)) * 100);
                             const isEditing = !item.isFrozen;

                             return (
                                 <div key={item.id} className={`group relative bg-white rounded-2xl border-[3px] ${isEditing ? 'border-dashed border-slate-400 bg-slate-50' : `${theme.border} shadow-sm`} flex ${gridStyle.card} overflow-hidden transition-all`}>
                                     
                                     {/* 1. STATE CONTROLS */}
                                     {isEditing ? (
                                         // --- EDITING STATE ---
                                         <>
                                            {/* Top Right: READY Button */}
                                            <div className="absolute top-2 right-2 z-30 flex gap-2 flyer-edit-controls">
                                                <button 
                                                    onClick={() => toggleFreeze(item.id)} 
                                                    className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1 font-bold text-sm animate-bounce" 
                                                    title="Finalizar Edição"
                                                >
                                                    <Check className="w-4 h-4"/> Pronto
                                                </button>
                                            </div>
                                            {/* Top Left: COLD Toggle */}
                                            <div className="absolute top-2 left-2 z-30 flyer-edit-controls">
                                                <button 
                                                    onClick={() => updateItem(item.id, 'isCold', !item.isCold)} 
                                                    className={`p-2 rounded-full shadow-lg transition-colors ${item.isCold ? 'bg-blue-500 text-white' : 'bg-slate-200 text-slate-400 hover:bg-blue-100 hover:text-blue-500'}`} 
                                                    title="Selo Gelado"
                                                >
                                                    <Snowflake className="w-5 h-5"/>
                                                </button>
                                            </div>
                                         </>
                                     ) : (
                                         // --- FROZEN / READY STATE ---
                                         <>
                                             {/* Badge - Always Visible */}
                                             <div className={`absolute top-0 right-0 ${theme.badge} text-white font-black text-xl px-4 py-2 rounded-bl-2xl shadow-md z-20`}>
                                                -{discount}%
                                             </div>
                                             {/* Hover: EDIT Button */}
                                             <div className="absolute top-2 right-2 z-30 opacity-0 group-hover:opacity-100 transition-opacity flyer-edit-controls">
                                                 <button 
                                                    onClick={() => toggleFreeze(item.id)} 
                                                    className="bg-white text-slate-700 hover:text-amber-600 px-3 py-1.5 rounded-lg shadow-xl font-bold text-sm flex items-center gap-1 border border-slate-200"
                                                 >
                                                     <Pencil className="w-4 h-4"/> Editar
                                                 </button>
                                             </div>
                                         </>
                                     )}

                                     {/* 2. IMAGE AREA */}
                                     <div className={`${gridStyle.imgHeight} relative flex items-center justify-center p-2 group/img`}>
                                         {item.image ? (
                                             <img src={item.image} alt={item.name} className="h-full w-full object-contain mix-blend-multiply" />
                                         ) : (
                                             <ImageIcon className="w-1/2 h-1/2 text-slate-200" />
                                         )}
                                         
                                         {item.isCold && (
                                             <div className="absolute top-4 left-4 bg-blue-600 text-white px-3 py-1 rounded-full font-bold text-xs shadow-lg border-2 border-white flex items-center gap-1 z-10">
                                                 <Snowflake className="w-3 h-3"/> GELADO
                                             </div>
                                         )}

                                         {isEditing && (
                                             <div className="absolute inset-0 bg-black/10 flex items-center justify-center gap-2 opacity-0 group-hover/img:opacity-100 transition-opacity flyer-edit-controls">
                                                 <button onClick={() => triggerUpload(item.id)} className="bg-white p-3 rounded-full shadow-xl hover:text-amber-500 hover:scale-110 transition-transform" title="Upload Imagem"><Upload className="w-5 h-5"/></button>
                                                 <button onClick={() => triggerWebSearch(item)} className="bg-white p-3 rounded-full shadow-xl hover:text-blue-500 hover:scale-110 transition-transform" title="Buscar Web"><Globe className="w-5 h-5"/></button>
                                             </div>
                                         )}
                                     </div>

                                     {/* 3. INFO AREA */}
                                     <div className={`flex-1 flex flex-col ${gridStyle.layout === 'horizontal' ? 'items-start text-left py-4' : 'items-center text-center pb-4'}`}>
                                         {/* Name */}
                                         {isEditing ? (
                                             <textarea 
                                                value={item.name} 
                                                onChange={(e) => updateItem(item.id, 'name', e.target.value)}
                                                className={`w-full bg-slate-50 border-b-2 border-slate-300 focus:border-amber-500 focus:outline-none resize-none overflow-hidden text-center font-bold text-slate-800 ${gridStyle.titleSize}`}
                                                rows={2}
                                                placeholder="Nome do Produto"
                                             />
                                         ) : (
                                             <h3 className={`font-bold leading-tight text-slate-900 ${gridStyle.titleSize} line-clamp-2 w-full`}>{item.name}</h3>
                                         )}

                                         {/* Pricing Block */}
                                         <div className="mt-auto pt-2 w-full">
                                             {/* Original Price */}
                                             <div className="flex items-center justify-center gap-2 relative">
                                                <span className="text-slate-400 text-sm font-medium">De</span>
                                                {isEditing ? (
                                                    <input 
                                                        type="number" 
                                                        value={item.priceOriginal} 
                                                        onChange={(e) => updateItem(item.id, 'priceOriginal', parseFloat(e.target.value))}
                                                        className="w-24 text-center border-b border-slate-300 text-slate-500 line-through decoration-red-400 focus:outline-none bg-transparent"
                                                    />
                                                ) : (
                                                    <span className="text-slate-400 line-through decoration-red-400 decoration-2 font-medium text-lg">R$ {item.priceOriginal.toFixed(2)}</span>
                                                )}
                                             </div>
                                             
                                             {/* Final Price */}
                                             <div className={`flex items-start justify-center gap-1 leading-none font-black ${theme.text} mt-1`}>
                                                 <span className="text-2xl mt-4 font-bold text-slate-600">R$</span>
                                                 {isEditing ? (
                                                     <input 
                                                        type="number"
                                                        step="0.01"
                                                        value={item.priceFinal}
                                                        onChange={(e) => updateItem(item.id, 'priceFinal', parseFloat(e.target.value))}
                                                        className={`w-48 text-center bg-transparent border-b-2 border-amber-500 focus:outline-none ${gridStyle.priceSize}`}
                                                     />
                                                 ) : (
                                                     <div className="flex items-start">
                                                        <span className={gridStyle.priceSize}>{Math.floor(item.priceFinal)}</span>
                                                        <span className="text-5xl mt-2">,{item.priceFinal.toFixed(2).split('.')[1]}</span>
                                                     </div>
                                                 )}
                                             </div>
                                             
                                             <p className="text-sm text-slate-400 uppercase tracking-wide font-medium mt-1">
                                                 {item.unit} {item.netWeight ? `- ${item.netWeight}kg` : ''}
                                             </p>
                                         </div>
                                     </div>

                                 </div>
                             );
                        })}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className={`h-[5%] ${theme.bg} mt-auto flex items-center justify-between px-8 text-white`}>
                <div className="flex flex-col">
                    <span className="font-bold text-lg">BeerHouse</span>
                </div>
                <div className="text-right">
                    <span className="text-xs opacity-80 block">Ofertas válidas enquanto durarem os estoques.</span>
                </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default OfferFlyer;
