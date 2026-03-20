import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider } from './firebaseConfig';
import { saveUserData, loadUserData, saveChunkedData, loadChunkedData } from './services/firebaseService';
import { loadNotifications, saveNotifications, processBatchIntoHistory, resolveDuplicate, normalizeProductKey, loadPriceHistory, savePriceHistory } from './services/historyService';
import { loadAllCatalogs, processBatchIntoCatalog, saveCatalog } from './services/supplierCatalogService';
import NotificationCenter from './components/NotificationCenter';
import Dashboard from './components/Dashboard';
const SalesDashboard = lazy(() => import("./components/SalesDashboard"));
const QuoteComparator = lazy(() => import('./components/QuoteComparator'));
const OrderManager = lazy(() => import('./components/OrderManager'));
const Schedule = lazy(() => import('./components/Schedule'));
const ProductCatalog = lazy(() => import('./components/ProductCatalog'));
const ProductDatabase = lazy(() => import('./components/ProductDatabase'));
const OfferFlyer = lazy(() => import('./components/OfferFlyer'));
const SupplierManager = lazy(() => import('./components/SupplierManager'));
const SupplierCatalogView = lazy(() => import('./components/SupplierCatalogView'));
const AppSettingsPanel = lazy(() => import('./components/AppSettings'));
const UserProfilePanel = lazy(() => import('./components/UserProfile'));
import {
  Supplier,
  ForecastItem,
  CartItem,
  ProductMapping,
  SalesRecord,
  MasterProduct,
  PackRule,
  QuoteBatch,
  AppNotification,
  SupplierCatalog,
  PriceValidityConfig,
  HiddenProduct,
  AppSettings,
  PurchaseOrder,
  UserProfile,
} from './types';
import {
  BarChart3, Users, FileText, Database, Scale, Settings,
  CalendarDays, ClipboardList, LogOut, ChevronDown, Tag, MessageSquare,
  LayoutDashboard, Menu, X,
} from 'lucide-react';
import BuyingAssistant from './components/BuyingAssistant';
const QuoteRequest = lazy(() => import('./components/QuoteRequest'));

// ─── defaults ────────────────────────────────────────────────────────────────

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

const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '',
  companyName: '',
  document: '',
  email: '',
  deliveryAddresses: [],
};

// ─── Login / Loading ──────────────────────────────────────────────────────────

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

const LoadingScreen: React.FC = () => (
  <div className="flex flex-col items-center justify-center h-screen bg-slate-950 text-slate-400 gap-4">
    <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center animate-pulse">
      <span className="font-black text-xl text-white">B</span>
    </div>
    <p className="text-sm">Carregando seus dados...</p>
  </div>
);

// ─── App ──────────────────────────────────────────────────────────────────────

const App: React.FC = () => {
  // --- AUTH STATE ---
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // --- APP STATE ---
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'sales' | 'comparator' | 'purchase_orders' | 'schedule' |
    'catalog' | 'suppliers' | 'database' | 'settings' | 'profile' | 'quote_request'
  >('dashboard');

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
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);

  // --- NOTIFICATIONS ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // --- CATALOGS ---
  const [supplierCatalogs, setSupplierCatalogs] = useState<Record<string, SupplierCatalog>>({});
  const [priceValidityConfig, setPriceValidityConfig] = useState<PriceValidityConfig>({ globalDays: 7 });
  const [catalogTab, setCatalogTab] = useState<string>('master');

  // --- SETTINGS ---
  const [hiddenProducts, setHiddenProducts] = useState<HiddenProduct[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>({ showInactiveProducts: false, priceValidityDays: 7 });

  // --- PROFILE DROPDOWN & MOBILE MENU ---
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [offerFlyerOpen, setOfferFlyerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setProfileDropdownOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    ] = await Promise.all([
      loadUserData<Supplier[]>(uid, 'suppliers', []),
      loadUserData<SalesRecord[]>(uid, 'salesData', []),
      loadUserData(uid, 'salesConfig', { historyDays: 60, inflation: 10, forecastDays: 7 }),
      loadUserData<ForecastItem[]>(uid, 'forecast', []),
      loadUserData<CartItem[]>(uid, 'cart', []),
      loadUserData<ProductMapping[]>(uid, 'mappings', []),
      loadUserData<ProductMapping[]>(uid, 'ignoredMappings', []),
      loadChunkedData<MasterProduct>(uid, 'masterProducts', []),
      loadUserData<string>(uid, 'dbSheetUrl', ""),
      loadUserData<string>(uid, 'salesUrl', ""),
      loadUserData<boolean>(uid, 'considerStock', true),
      loadUserData<PackRule[]>(uid, 'globalPackRules', defaultGlobalPackRules),
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

    const savedNotifications = await loadNotifications(uid);
    setNotifications(savedNotifications);

    const [allCatalogs, savedValidityConfig] = await Promise.all([
      loadAllCatalogs(uid),
      loadUserData<PriceValidityConfig>(uid, 'priceValidityConfig', { globalDays: 7 }),
    ]);
    const catalogsMap: Record<string, SupplierCatalog> = {};
    allCatalogs.forEach(c => { catalogsMap[c.supplierId] = c; });
    setSupplierCatalogs(catalogsMap);
    setPriceValidityConfig(savedValidityConfig);

    const [savedHidden, savedAppSettings, savedPurchaseOrders, savedUserProfile] = await Promise.all([
      loadUserData<HiddenProduct[]>(uid, 'hiddenProducts', []),
      loadUserData<AppSettings>(uid, 'appSettings', { showInactiveProducts: false, priceValidityDays: 7 }),
      loadUserData<PurchaseOrder[]>(uid, 'purchaseOrders', []),
      loadUserData<UserProfile>(uid, 'userProfile', DEFAULT_USER_PROFILE),
    ]);
    setHiddenProducts(savedHidden);
    setAppSettings(savedAppSettings);
    setPurchaseOrders(savedPurchaseOrders);
    setUserProfile(savedUserProfile);

    setDataLoading(false);
    setIsLoaded(true);
  };

  // --- SALVA NO FIREBASE ---
  const uid = user?.uid;

  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'suppliers', suppliers); }, [suppliers, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesData', salesData); }, [salesData, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesConfig', salesConfig); }, [salesConfig, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'forecast', forecast); }, [forecast, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'cart', cart); }, [cart, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'mappings', productMappings); }, [productMappings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'ignoredMappings', ignoredMappings); }, [ignoredMappings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveChunkedData(uid, 'masterProducts', masterProducts); }, [masterProducts, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'dbSheetUrl', dbSheetUrl); }, [dbSheetUrl, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'salesUrl', salesUrl); }, [salesUrl, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'considerStock', considerStock); }, [considerStock, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'globalPackRules', globalPackRules); }, [globalPackRules, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'purchaseOrders', purchaseOrders); }, [purchaseOrders, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'priceValidityConfig', priceValidityConfig); }, [priceValidityConfig, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'hiddenProducts', hiddenProducts); }, [hiddenProducts, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'appSettings', appSettings); }, [appSettings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'userProfile', userProfile); }, [userProfile, uid, isLoaded]);
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

  // --- BATCH HANDLER ---
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

    const { catalog, newProducts, updatedProducts } = await processBatchIntoCatalog(
      user.uid, batch, supplierId, supplier.name, masterProducts
    );
    setSupplierCatalogs(prev => ({ ...prev, [supplierId]: catalog }));

    if (newProducts > 0 || updatedProducts > 0) {
      setNotifications(prev => [{
        id: `catalog-${batch.id}`,
        type: 'console',
        title: 'Catálogo atualizado',
        message: `${supplier.name}: ${newProducts} novo(s), ${updatedProducts} atualizado(s)`,
        timestamp: Date.now(),
        resolved: false,
        supplierId,
        supplierName: supplier.name,
        batchId: batch.id,
      }, ...prev]);
    }
  }, [user?.uid, suppliers, productMappings, notifications, masterProducts]);

  // --- BATCH DATE CHANGE PROPAGATION ---
  const handleBatchDateChange = useCallback(async (
    supplierId: string,
    batchId: string,
    newTimestamp: number,
    items: import('./types').ProductQuote[]
  ) => {
    if (!uid) return;

    // 1. Update supplier catalog price history dates
    const catalog = supplierCatalogs[supplierId];
    if (catalog) {
      const updatedCatalog = {
        ...catalog,
        products: catalog.products.map(p => {
          const updatedHistory = p.priceHistory.map(e =>
            e.batchId === batchId ? { ...e, date: newTimestamp } : e
          );
          const latestEntry = updatedHistory[0];
          return {
            ...p,
            priceHistory: updatedHistory,
            lastSeenDate: latestEntry?.batchId === batchId ? newTimestamp : p.lastSeenDate,
          };
        }),
      };
      await saveCatalog(uid, updatedCatalog);
      setSupplierCatalogs(prev => ({ ...prev, [supplierId]: updatedCatalog }));
    }

    // 2. Update price history records
    for (const item of items) {
      const key = normalizeProductKey(item.name);
      const history = await loadPriceHistory(uid, key);
      if (!history) continue;
      const updated = {
        ...history,
        records: history.records.map(r => r.batchId === batchId ? { ...r, date: newTimestamp } : r),
      };
      await savePriceHistory(uid, updated);
    }
  }, [uid, supplierCatalogs]);

  // --- HIDDEN PRODUCTS ---
  const handleHideProduct = useCallback((product: import('./types').SupplierCatalogProduct, supplierId: string, supplierName: string) => {
    setHiddenProducts(prev => {
      if (prev.some(h => h.id === product.id)) return prev;
      return [...prev, {
        id: product.id,
        supplierId,
        supplierName,
        productName: product.name,
        masterSku: product.masterSku,
        hiddenAt: Date.now(),
      }];
    });
  }, []);

  const handleUnhideProduct = useCallback((productId: string) => {
    setHiddenProducts(prev => prev.filter(h => h.id !== productId));
  }, []);

  const handleClearAllHidden = useCallback(() => {
    setHiddenProducts([]);
  }, []);

  // --- AUTH ---
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
    setSuppliers([]);
    setSalesData([]);
    setForecast([]);
    setCart([]);
    setProductMappings([]);
    setIgnoredMappings([]);
    setMasterProducts([]);
    setUserProfile(DEFAULT_USER_PROFILE);
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

  // seqNumber automático para novos pedidos
  const getNextSeqNumber = useCallback(() => {
    if (purchaseOrders.length === 0) return 1;
    return Math.max(...purchaseOrders.map(o => o.seqNumber || 0)) + 1;
  }, [purchaseOrders]);

  // --- RENDER ---
  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />;
  if (dataLoading) return <LoadingScreen />;

  const activeOrdersCount = purchaseOrders.filter(o =>
    ['draft', 'sent', 'confirmed', 'in_transit', 'awaiting'].includes(o.status)
  ).length;

  // helper para navegação no mobile
  const navigateTo = (tab: typeof activeTab) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const navItems: { tab: typeof activeTab; icon: React.ReactNode; label: string; highlight?: boolean }[] = [
    { tab: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Início' },
    { tab: 'suppliers', icon: <Users className="w-5 h-5" />, label: 'Fornecedores' },
    { tab: 'database', icon: <Database className="w-5 h-5" />, label: 'Produtos' },
    { tab: 'sales', icon: <BarChart3 className="w-5 h-5" />, label: 'Vendas' },
    { tab: 'catalog', icon: <FileText className="w-5 h-5" />, label: 'Catálogo' },
    { tab: 'comparator', icon: <Scale className="w-5 h-5" />, label: 'Comparador' },
    { tab: 'purchase_orders', icon: <ClipboardList className="w-5 h-5" />, label: 'Pedidos' },
    { tab: 'schedule', icon: <CalendarDays className="w-5 h-5" />, label: 'Cronograma' },
    { tab: 'quote_request', icon: <MessageSquare className="w-5 h-5" />, label: 'Cotação', highlight: true },
  ];

  return (
    <div className="flex h-screen w-full bg-slate-950 text-slate-200 font-sans overflow-hidden">
      
      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black/60 z-40 xl:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}

      {/* Sidebar Container */}
      <div className={`fixed xl:static inset-y-0 left-0 z-50 flex flex-col bg-slate-900 border-r border-slate-800 transition-all duration-300 ease-in-out ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'} xl:translate-x-0 ${sidebarExpanded ? 'w-64' : 'w-20'}`}>
        
        {/* Top Logo Area */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center shrink-0 shadow-lg">
              <span className="font-black text-lg text-white">B</span>
            </div>
            <h1 className={`text-lg font-bold text-white whitespace-nowrap transition-opacity duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 xl:hidden'}`}>BeerHouse</h1>
          </div>
          <button className="xl:hidden p-1 text-slate-400 hover:text-white" onClick={() => setMobileMenuOpen(false)}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-1 custom-scrollbar">
          {navItems.map(({ tab, icon, label, highlight }) => (
            <button
              key={tab}
              onClick={() => navigateTo(tab)}
              className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                activeTab === tab
                  ? (highlight ? 'bg-amber-600 text-white shadow-md' : 'bg-slate-800 text-white shadow-sm ring-1 ring-slate-700')
                  : (highlight ? 'text-amber-500/80 hover:bg-slate-800/50 hover:text-amber-400' : 'text-slate-400 hover:text-white hover:bg-slate-800/50')
              }`}
            >
              <div className="w-5 h-5 flex items-center justify-center shrink-0">
                {icon}
              </div>
              <span className={`whitespace-nowrap transition-opacity duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 xl:hidden'}`}>
                {label}
              </span>
              {tab === 'purchase_orders' && activeOrdersCount > 0 && (
                <span className={`ml-auto bg-amber-500 px-2 py-0.5 rounded-full text-[10px] text-white font-bold transition-opacity duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 xl:hidden'}`}>
                  {activeOrdersCount}
                </span>
              )}

              {/* Tooltip for collapsed mode */}
              {!sidebarExpanded && (
                <div className="absolute left-full ml-3 px-2 py-1 bg-slate-800 text-white text-[11px] font-bold tracking-wider uppercase rounded opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-[60] border border-slate-700 shadow-xl hidden xl:block pointer-events-none">
                  {label}
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Bottom Actions Area */}
        <div className="border-t border-slate-800 p-3 flex flex-col gap-2 shrink-0">
          <div className={`flex ${sidebarExpanded ? 'flex-row' : 'flex-col'} items-center justify-center gap-2`}>
            <NotificationCenter
              notifications={notifications}
              onResolve={handleNotificationResolve}
              onClearConsole={handleClearConsole}
            />
            <button
              onClick={() => navigateTo('settings')}
              title="Configurações"
              className={`p-2 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-white ring-1 ring-slate-700' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
            >
              <Settings className="w-5 h-5" />
            </button>
          </div>

          <div className="relative" ref={profileDropdownRef}>
            <button
              onClick={() => setProfileDropdownOpen(v => !v)}
              className={`w-full flex items-center ${sidebarExpanded ? 'gap-3 px-3' : 'justify-center'} py-2 rounded-xl hover:bg-slate-800 transition-all focus:outline-none`}
              title={!sidebarExpanded ? "Perfil" : undefined}
            >
              {user.photoURL ? (
                <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full border border-slate-600 shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {(userProfile.displayName || user.email || 'U')[0].toUpperCase()}
                </div>
              )}
              
              <div className={`flex-1 flex items-center justify-between overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 xl:hidden'}`}>
                <div className="flex flex-col items-start truncate pr-2">
                  <span className="text-sm font-medium text-white truncate max-w-[120px]">{userProfile.displayName || 'Meu Perfil'}</span>
                  <span className="text-xs text-slate-400 truncate max-w-[120px]">{user.email}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${profileDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>

            {profileDropdownOpen && (
              <div className={`absolute bottom-full mb-2 ${sidebarExpanded ? 'left-0 w-full' : 'left-full ml-2 w-48'} bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden`}>
                <button
                  onClick={() => { navigateTo('profile'); setProfileDropdownOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-left"
                >
                  <span className="text-base">👤</span> Meu Perfil
                </button>
                <button
                  onClick={() => { setOfferFlyerOpen(true); setProfileDropdownOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors text-left"
                >
                  <Tag className="w-4 h-4 text-red-400" /> Ofertas
                </button>
                <div className="border-t border-slate-700" />
                <button
                  onClick={() => { setProfileDropdownOpen(false); handleLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:text-red-300 hover:bg-slate-700 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" /> Sair
                </button>
              </div>
            )}
          </div>
          
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="hidden xl:flex items-center justify-center p-2 text-slate-500 hover:text-white hover:bg-slate-800 transition-all rounded-xl mt-1"
            title={sidebarExpanded ? "Recolher Menus" : "Expandir Menus"}
          >
             <svg className={`w-5 h-5 transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
             </svg>
          </button>
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden relative">
        {/* Mobile Top Bar */}
        <div className="xl:hidden h-16 bg-slate-900 border-b border-slate-800 flex items-center gap-3 px-4 shrink-0 transition-all">
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
          >
            <Menu className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-amber-600 rounded flex items-center justify-center shadow-lg shrink-0">
              <span className="font-black text-white">B</span>
            </div>
            <h1 className="text-lg font-bold text-white">BeerHouse</h1>
          </div>
        </div>

      {/* Modal OfferFlyer (acessado via dropdown) */}
      {offerFlyerOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setOfferFlyerOpen(false); }}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <Tag className="w-5 h-5 text-red-500" />
                <h2 className="text-white font-bold text-lg">Flyer de Ofertas</h2>
              </div>
              <button
                onClick={() => setOfferFlyerOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
              >
                ✕
              </button>
            </div>
            <OfferFlyer products={masterProducts} />
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto p-4 md:p-6 w-full max-w-7xl mx-auto custom-scrollbar">
        {activeTab === 'dashboard' && (
          <Dashboard
            user={user}
            userProfile={userProfile}
            suppliers={suppliers}
            purchaseOrders={purchaseOrders}
            masterProducts={masterProducts}
            notifications={notifications}
            cart={cart}
            onNavigate={(tab) => setActiveTab(tab as typeof activeTab)}
          />
        )}
        <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>}>
        {activeTab === 'sales' && (
          <SalesDashboard
            setForecast={setForecast} salesData={salesData} setSalesData={setSalesData}
            csvContent={salesCsvContent} setCsvContent={setSalesCsvContent}
            salesConfig={salesConfig} setSalesConfig={setSalesConfig}
            salesUrl={salesUrl} setSalesUrl={setSalesUrl}
            masterProducts={masterProducts}
          />
        )}
        {activeTab === 'comparator' && (
          <QuoteComparator
            suppliers={suppliers} forecast={forecast} cart={cart} setCart={setCart}
            updateForecast={updateForecast} productMappings={productMappings}
            ignoredMappings={ignoredMappings} addMapping={addMapping}
            removeMapping={removeMapping} ignoreMapping={ignoreMapping}
            salesConfig={salesConfig} considerStock={considerStock}
            setConsiderStock={setConsiderStock} masterProducts={masterProducts}
            hiddenProductIds={new Set(hiddenProducts.map(h => h.id))}
            showInactive={appSettings.showInactiveProducts}
          />
        )}
        {activeTab === 'purchase_orders' && (
          <OrderManager
            suppliers={suppliers}
            purchaseOrders={purchaseOrders}
            setPurchaseOrders={setPurchaseOrders}
            cart={cart}
            setCart={setCart}
            userProfile={userProfile}
            getNextSeqNumber={getNextSeqNumber}
          />
        )}
        {activeTab === 'schedule' && (
          <Schedule suppliers={suppliers} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} />
        )}
        {activeTab === 'catalog' && (
          <div className="flex flex-col h-full overflow-hidden gap-3">
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => setCatalogTab('master')}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  catalogTab === 'master' ? 'bg-amber-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                📦 Catálogo Geral
              </button>
              <button
                onClick={() => setCatalogTab('suppliers')}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${
                  catalogTab === 'suppliers' ? 'bg-amber-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                🏪 Por Fornecedor
              </button>
            </div>
            <div className="flex-1 overflow-hidden min-h-0">
              {catalogTab === 'master' ? (
                <div className="h-full overflow-y-auto">
                  <ProductCatalog suppliers={suppliers} cart={cart} setCart={setCart} forecast={forecast} />
                </div>
              ) : (
                <SupplierCatalogView
                  suppliers={suppliers}
                  catalogs={supplierCatalogs}
                  masterProducts={masterProducts}
                  uid={user!.uid}
                  globalValidityDays={appSettings.priceValidityDays}
                  showInactive={appSettings.showInactiveProducts}
                  hiddenProducts={hiddenProducts}
                  onCatalogUpdate={updated => setSupplierCatalogs(prev => ({ ...prev, [updated.supplierId]: updated }))}
                  onHideProduct={handleHideProduct}
                  onUnhideProduct={handleUnhideProduct}
                />
              )}
            </div>
          </div>
        )}
        {activeTab === 'database' && (
          <ProductDatabase
            masterProducts={masterProducts} setMasterProducts={setMasterProducts}
            sheetUrl={dbSheetUrl} setSheetUrl={setDbSheetUrl}
          />
        )}
        {activeTab === 'suppliers' && (
          <SupplierManager
            suppliers={suppliers} setSuppliers={setSuppliers}
            globalPackRules={globalPackRules} setGlobalPackRules={setGlobalPackRules}
            onBatchCompleted={handleBatchCompleted}
            uid={uid ?? ''}
            onBatchDateChange={handleBatchDateChange}
          />
        )}
        {activeTab === 'quote_request' && (
          <QuoteRequest
            suppliers={suppliers}
            catalogs={supplierCatalogs}
            globalValidityDays={appSettings.priceValidityDays}
          />
        )}
        {activeTab === 'settings' && (
          <div className="h-full overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <Settings className="w-5 h-5 text-amber-400" />
              <h2 className="text-white font-bold text-lg">Configurações Gerais</h2>
            </div>
            <AppSettingsPanel
              settings={appSettings}
              onSettingsChange={s => { setAppSettings(s); setPriceValidityConfig({ globalDays: s.priceValidityDays }); }}
              globalPackRules={globalPackRules}
              onPackRulesChange={setGlobalPackRules}
              hiddenProducts={hiddenProducts}
              onUnhide={handleUnhideProduct}
              onClearAllHidden={handleClearAllHidden}
            />
          </div>
        )}
        {activeTab === 'profile' && (
          <div className="h-full overflow-y-auto">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xl">👤</span>
              <h2 className="text-white font-bold text-lg">Meu Perfil</h2>
            </div>
            <UserProfilePanel
              profile={userProfile}
              onProfileChange={setUserProfile}
              userPhotoURL={user.photoURL || undefined}
              userEmail={user.email || undefined}
            />
          </div>
        )}
        </Suspense>
      </main>

      {/* Assistente flutuante */}
      <BuyingAssistant suppliers={suppliers} cart={cart} setCart={setCart} salesData={salesData} />
      </div>
    </div>
  );
};

export default App;
