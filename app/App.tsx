import React, { useState, useEffect, useCallback } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider } from './firebaseConfig';
import { saveUserData, loadUserData } from './services/firebaseService';
import { loadNotifications, saveNotifications, processBatchIntoHistory, resolveDuplicate } from './services/historyService';
import NotificationCenter from './components/NotificationCenter';
import SalesAnalyzer from './components/SalesAnalyzer';
import QuoteComparator from './components/QuoteComparator';
import OrderManager from './components/OrderManager';
import ProductCatalog from './components/ProductCatalog';
import ProductDatabase from './components/ProductDatabase';
import OfferFlyer from './components/OfferFlyer';
import SupplierManager from './components/SupplierManager';
import {
  Supplier,
  ForecastItem,
  CartItem,
  ProductMapping,
  SalesRecord,
  MasterProduct,
  NamingRule,
  PackRule,
  QuoteBatch,
  AppNotification
} from './types';
import { ShoppingCart, BarChart3, Users, FileText, Database, Tag, Scale, LogIn, LogOut } from 'lucide-react';
import BuyingAssistant from './components/BuyingAssistant';

const defaultGlobalPackRules: PackRule[] = [
  { id: 'def-1', term: 'Lata 350ml', quantity: 12 },
  { id: 'def-2', term: 'Lata 473ml', quantity: 12 },
  { id: 'def-3', term: 'Longneck', quantity: 24 },
  { id: 'def-4', term: 'Long Neck', quantity: 24 },
  { id: 'def-5', term: '300ml', quantity: 23 },
  { id: 'def-6', term: '600ml', quantity: 6 },
  { id: 'def-7', term: '1L', quantity: 6 },
  { id: 'def-8', term: '1.5L', quantity: 6 },
  { id: 'def-9', term: '2L', quantity: 6 },
  { id: 'def-10', term: 'Redbull', quantity: 12 },
  { id: 'def-11', term: '250ml', quantity: 12 },
  { id: 'def-12', term: '269ml', quantity: 12 },
  { id: 'def-13', term: '473ml', quantity: 12 },
  { id: 'def-14', term: '500ml', quantity: 12 },
  { id: 'def-15', term: 'Askov', quantity: 6 },
  { id: 'def-16', term: 'Ice', quantity: 24 },
];

const defaultNamingRules: NamingRule[] = [
  { id: 'nr-1', terms: ['CERVEJA', '473ML'], category: 'CERVEJA', suffix: 'LATA' },
  { id: 'nr-2', terms: ['CERVEJA', '350ML'], category: 'CERVEJA', suffix: 'LATA' },
  { id: 'nr-3', terms: ['CERVEJA', '269ML'], category: 'CERVEJA', suffix: 'LATA' },
  { id: 'nr-4', terms: ['CERVEJA', '250ML'], category: 'CERVEJA', suffix: 'LONG NECK' },
  { id: 'nr-5', terms: ['CERVEJA', '355ML'], category: 'CERVEJA', suffix: 'LONG NECK' },
  { id: 'nr-6', terms: ['CERVEJA', '330ML'], category: 'CERVEJA', suffix: 'LONG NECK' },
  { id: 'nr-7', terms: ['CERVEJA', '275ML'], category: 'CERVEJA', suffix: 'LONG NECK' },
  { id: 'nr-8', terms: ['CERVEJA', '300ML'], category: 'CERVEJA', suffix: 'LITRINHO' },
  { id: 'nr-chopp-1', terms: ['CHOPP', '473ML'], category: 'CHOPP', suffix: 'LATA' },
  { id: 'nr-9', terms: ['REDBULL'], category: 'ENERGÉTICO', suffix: 'LATA' },
  { id: 'nr-10', terms: ['MONSTER'], category: 'ENERGÉTICO', suffix: 'LATA' },
  { id: 'nr-19', terms: ['SKOL', 'BEATS', '269ML'], category: 'BEB DRINK', suffix: 'LATA' },
  { id: 'nr-11', terms: ['REFRIGERANTE', '2L'], category: 'REFRIGERANTE', suffix: 'PET' },
  { id: 'nr-12', terms: ['REFRIGERANTE', '1.5L'], category: 'REFRIGERANTE', suffix: 'PET' },
  { id: 'nr-12b', terms: ['REFRIGERANTE', '1,5L'], category: 'REFRIGERANTE', suffix: 'PET' },
  { id: 'nr-13', terms: ['REFRIGERANTE', '3L'], category: 'REFRIGERANTE', suffix: 'PET' },
  { id: 'nr-14', terms: ['AGUA', '500ML'], category: 'ÁGUA', suffix: 'PET' },
  { id: 'nr-15', terms: ['ÁGUA', '500ML'], category: 'ÁGUA', suffix: 'PET' },
  { id: 'nr-16', terms: ['AGUA', '1.5L'], category: 'ÁGUA', suffix: 'PET' },
  { id: 'nr-17', terms: ['ÁGUA', '1,5L'], category: 'ÁGUA', suffix: 'PET' },
  { id: 'nr-20', terms: ['CHICLETE'], category: 'GOMA' },
  { id: 'nr-21', terms: ['CHICLE'], category: 'GOMA' },
  { id: 'nr-22', terms: ['HALLS'], category: 'BALA' },
];

// Tela de Login
const LoginScreen: React.FC<{ onLogin: () => void; loading: boolean }> = ({ onLogin, loading }) => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-200">
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 flex flex-col items-center gap-6 shadow-2xl w-full max-w-sm">
      <div className="w-16 h-16 bg-amber-600 rounded-xl flex items-center justify-center shadow-lg">
        <span className="font-black text-3xl text-white">B</span>
      </div>
      <div className="text-center">
        <h1 className="text-2xl font-bold text-white">BeerHouse</h1>
        <p className="text-slate-400 text-sm mt-1">MasterBuyer 2026</p>
      </div>
      <button
        onClick={onLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3 px-6 rounded-lg hover:bg-slate-100 transition-all disabled:opacity-50"
      >
        {loading ? (
          <span className="text-sm">Entrando...</span>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Entrar com Google</span>
          </>
        )}
      </button>
      <p className="text-slate-600 text-xs text-center">Seus dados ficam salvos na nuvem e sincronizados em qualquer dispositivo.</p>
    </div>
  </div>
);

// Tela de carregamento
const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-400 gap-4">
    <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center animate-pulse">
      <span className="font-black text-xl text-white">B</span>
    </div>
    <p className="text-sm">Carregando seus dados...</p>
  </div>
);

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false); // flag: só salva após carregar

  // --- APP STATE ---
  const [activeTab, setActiveTab] = useState<'sales' | 'comparator' | 'orders' | 'catalog' | 'suppliers' | 'database' | 'flyer'>('suppliers');
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [salesData, setSalesData] = useState<SalesRecord[]>([]);
  const [salesConfig, setSalesConfig] = useState({ historyDays: 60, inflation: 10, forecastDays: 7 });
  const [forecast, setForecast] = useState<ForecastItem[]>([]);
  const [salesCsvContent, setSalesCsvContent] = useState<string>("");
  const [salesUrl, setSalesUrl] = useState<string>("");
  const [considerStock, setConsiderStock] = useState<boolean>(true);
  const [productMappings, setProductMappings] = useState<ProductMapping[]>([]);
  const [ignoredMappings, setIgnoredMappings] = useState<ProductMapping[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [masterProducts, setMasterProducts] = useState<MasterProduct[]>([]);
  const [dbSheetUrl, setDbSheetUrl] = useState<string>("");
  const [globalPackRules, setGlobalPackRules] = useState<PackRule[]>(defaultGlobalPackRules);
  const [globalNamingRules, setGlobalNamingRules] = useState<NamingRule[]>(defaultNamingRules);

  // --- NOTIFICATIONS ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // --- AUTH LISTENER ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      setAuthLoading(false);
      if (firebaseUser) {
        await loadAllData(firebaseUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // --- CARREGA TODOS OS DADOS DO FIREBASE ---
  const loadAllData = async (uid: string) => {
    setDataLoading(true);
    const [
      savedSuppliers,
      savedSalesData,
      savedSalesConfig,
      savedForecast,
      savedCart,
      savedMappings,
      savedIgnoredMappings,
      savedMasterProducts,
      savedDbUrl,
      savedSalesUrl,
      savedConsiderStock,
      savedPackRules,
      savedNamingRules,
    ] = await Promise.all([
      loadUserData<Supplier[]>(uid, 'suppliers', []),
      loadUserData<SalesRecord[]>(uid, 'salesData', []),
      loadUserData(uid, 'salesConfig', { historyDays: 60, inflation: 10, forecastDays: 7 }),
      loadUserData<ForecastItem[]>(uid, 'forecast', []),
      loadUserData<CartItem[]>(uid, 'cart', []),
      loadUserData<ProductMapping[]>(uid, 'mappings', []),
      loadUserData<ProductMapping[]>(uid, 'ignoredMappings', []),
      loadUserData<MasterProduct[]>(uid, 'masterProducts', []),
      loadUserData<string>(uid, 'dbSheetUrl', ""),
      loadUserData<string>(uid, 'salesUrl', ""),
      loadUserData<boolean>(uid, 'considerStock', true),
      loadUserData<PackRule[]>(uid, 'globalPackRules', defaultGlobalPackRules),
      loadUserData<NamingRule[]>(uid, 'globalNamingRules', defaultNamingRules),
    ]);

    setSuppliers(savedSuppliers);
    setSalesData(savedSalesData);
    setSalesConfig(savedSalesConfig);
    setForecast(savedForecast);
    setCart(savedCart);
    setProductMappings(savedMappings);
    setIgnoredMappings(savedIgnoredMappings);
    setMasterProducts(savedMasterProducts);
    setDbSheetUrl(savedDbUrl);
    setSalesUrl(savedSalesUrl);
    setConsiderStock(savedConsiderStock);
    setGlobalPackRules(savedPackRules);
    setGlobalNamingRules(savedNamingRules);

    // Load notifications
    const savedNotifications = await loadNotifications(uid);
    setNotifications(savedNotifications);

    setDataLoading(false);
    setIsLoaded(true); // libera os useEffects de salvamento
  };

  // --- SALVA NO FIREBASE SEMPRE QUE O ESTADO MUDA ---
  const uid = user?.uid;

  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'suppliers', suppliers); }, [suppliers, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesData', salesData); }, [salesData, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesConfig', salesConfig); }, [salesConfig, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'forecast', forecast); }, [forecast, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'cart', cart); }, [cart, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'mappings', productMappings); }, [productMappings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'ignoredMappings', ignoredMappings); }, [ignoredMappings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'masterProducts', masterProducts); }, [masterProducts, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'dbSheetUrl', dbSheetUrl); }, [dbSheetUrl, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesUrl', salesUrl); }, [salesUrl, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'considerStock', considerStock); }, [considerStock, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'globalPackRules', globalPackRules); }, [globalPackRules, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'globalNamingRules', globalNamingRules); }, [globalNamingRules, uid, isLoaded]);
  useEffect(() => { if (uid) saveNotifications(uid, notifications); }, [notifications, uid]);

  // --- NOTIFICATION HANDLERS ---
  const handleNotificationResolve = useCallback(async (id: string, keepWhich?: 'existing' | 'incoming') => {
    const notif = notifications.find(n => n.id === id);
    if (notif?.payload && keepWhich && user?.uid) {
      await resolveDuplicate(user.uid, notif, keepWhich);
    }
    setNotifications(prev => prev.map(n =>
      n.id === id ? { ...n, resolved: true } : n
    ).filter(n => !(n.type === 'attention' && n.id === id)));
  }, [notifications, user?.uid]);

  const handleClearConsole = useCallback(() => {
    setNotifications(prev => prev.filter(n => n.type === 'attention'));
  }, []);

  // --- PROCESS BATCH INTO HISTORY (called after a batch completes) ---
  const handleBatchCompleted = useCallback(async (batch: QuoteBatch, supplierId: string) => {
    if (!user?.uid) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;
    const { newNotifications } = await processBatchIntoHistory(
      user.uid, batch, supplier, productMappings, notifications
    );
    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev]);
    }
  }, [user?.uid, suppliers, productMappings, notifications]);

  // --- LOGIN / LOGOUT ---
  const handleLogin = async () => {
    setLoginLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("Erro no login:", e);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setIsLoaded(false);
    // Limpa estado local ao sair
    setSuppliers([]);
    setSalesData([]);
    setForecast([]);
    setCart([]);
    setProductMappings([]);
    setIgnoredMappings([]);
    setMasterProducts([]);
  };

  // --- HELPERS ---
  const addMapping = useCallback((supplierProductName: string, targetSku: string) => {
    const normalized = supplierProductName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    setProductMappings(prev => {
      const existing = prev.findIndex(m => m.supplierProductNameNormalized === normalized);
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing].targetSku = targetSku;
        return copy;
      }
      return [...prev, { supplierProductNameNormalized: normalized, targetSku }];
    });
  }, []);

  const removeMapping = useCallback((supplierProductName: string) => {
    const normalized = supplierProductName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    setProductMappings(prev => prev.filter(m => m.supplierProductNameNormalized !== normalized));
  }, []);

  const ignoreMapping = useCallback((supplierProductName: string, targetSku: string) => {
    const normalized = supplierProductName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    setIgnoredMappings(prev => [...prev, { supplierProductNameNormalized: normalized, targetSku }]);
  }, []);

  const updateForecast = useCallback((sku: string, newQty: number) => {
    setForecast(prev => prev.map(item => item.sku === sku ? { ...item, suggestedQty: newQty } : item));
  }, []);

  // --- RENDER ---
  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />;
  if (dataLoading) return <LoadingScreen />;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans">
      <nav className="bg-slate-900 border-b border-slate-800 py-2 px-4 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center shadow-lg">
              <span className="font-black text-lg text-white">B</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-lg font-bold text-white leading-none">BeerHouse</h1>
            </div>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar flex-1 justify-center">
            <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
              <button onClick={() => setActiveTab('suppliers')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'suppliers' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Users className="w-3.5 h-3.5" /> Fornecedores</button>
              <button onClick={() => setActiveTab('database')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'database' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Database className="w-3.5 h-3.5" /> Produtos</button>
              <button onClick={() => setActiveTab('sales')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'sales' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><BarChart3 className="w-3.5 h-3.5" /> Vendas</button>
              <button onClick={() => setActiveTab('catalog')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'catalog' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><FileText className="w-3.5 h-3.5" /> Catálogo</button>
              <button onClick={() => setActiveTab('comparator')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'comparator' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><Scale className="w-3.5 h-3.5" /> Comparador</button>
              <button onClick={() => setActiveTab('orders')} className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === 'orders' ? 'bg-slate-700 text-white shadow' : 'text-slate-400 hover:text-white'}`}><ShoppingCart className="w-3.5 h-3.5" /> Pedidos {cart.length > 0 && <span className="ml-1 bg-amber-600 px-1.5 rounded-full text-[10px] text-white">{cart.length}</span>}</button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setActiveTab('flyer')} className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all whitespace-nowrap border ${activeTab === 'flyer' ? 'bg-red-600 text-white border-red-500 shadow' : 'bg-slate-900 text-red-500 border-red-900/50 hover:bg-red-900/20'}`}><Tag className="w-3.5 h-3.5" /> Ofertas</button>
            
            {/* Notificações + usuário */}
            <div className="flex items-center gap-2 ml-2 pl-2 border-l border-slate-700">
              <NotificationCenter
                notifications={notifications}
                onResolve={handleNotificationResolve}
                onClearConsole={handleClearConsole}
              />
              {user.photoURL && (
                <img src={user.photoURL} alt="avatar" className="w-7 h-7 rounded-full border border-slate-600" />
              )}
              <button
                onClick={handleLogout}
                title="Sair"
                className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="flex-1 overflow-hidden p-4 md:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'sales' && <SalesAnalyzer setForecast={setForecast} salesData={salesData} setSalesData={setSalesData} csvContent={salesCsvContent} setCsvContent={setSalesCsvContent} salesConfig={salesConfig} setSalesConfig={setSalesConfig} salesUrl={salesUrl} setSalesUrl={setSalesUrl} />}
        {activeTab === 'comparator' && <QuoteComparator suppliers={suppliers} forecast={forecast} cart={cart} setCart={setCart} updateForecast={updateForecast} productMappings={productMappings} ignoredMappings={ignoredMappings} addMapping={addMapping} removeMapping={removeMapping} ignoreMapping={ignoreMapping} salesConfig={salesConfig} considerStock={considerStock} setConsiderStock={setConsiderStock} masterProducts={masterProducts} />}
        {activeTab === 'orders' && <OrderManager cart={cart} setCart={setCart} />}
        {activeTab === 'catalog' && <ProductCatalog suppliers={suppliers} cart={cart} setCart={setCart} forecast={forecast} />}
        {activeTab === 'database' && <ProductDatabase masterProducts={masterProducts} setMasterProducts={setMasterProducts} sheetUrl={dbSheetUrl} setSheetUrl={setDbSheetUrl} />}
        {activeTab === 'flyer' && <OfferFlyer products={masterProducts} />}
        {activeTab === 'suppliers' && <SupplierManager suppliers={suppliers} setSuppliers={setSuppliers} globalPackRules={globalPackRules} setGlobalPackRules={setGlobalPackRules} globalNamingRules={globalNamingRules} setGlobalNamingRules={setGlobalNamingRules} />}
      </main>

      {/* Assistente flutuante */}
      <BuyingAssistant suppliers={suppliers} cart={cart} setCart={setCart} salesData={salesData} />
    </div>
  );
};

export default App;
