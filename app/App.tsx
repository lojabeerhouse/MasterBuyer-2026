import React, { useState, useEffect, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { auth, googleProvider } from './firebaseConfig';
import {
  saveUserData, loadUserData, saveChunkedData, loadChunkedData, resetSessionGuards,
  loadAllSuppliers, upsertSuppliers, deleteSuppliers,
  loadAllPurchaseOrders, upsertPurchaseOrders, deletePurchaseOrders,
  loadAllSaleOrders, upsertSaleOrders, deleteSaleOrders,
  loadAllPdvSessions, upsertPdvSessions,
  loadAllStockMovements, appendStockMovements,
} from './services/firebaseService';
import { loadNotifications, saveNotifications, processBatchIntoHistory, resolveDuplicate, normalizeProductKey, loadPriceHistory, savePriceHistory } from './services/compras/historyService';
import { initLogger, addLogListener } from './services/notifications_and_logs/loggerService';
import { appendAuditEntry } from './services/auditService';


import { loadAllCatalogs, processBatchIntoCatalog, saveCatalog, normForMapping, makeProductId } from './services/compras/supplierCatalogService';
import { OPEN_STATUSES } from './utils/orderUtils';
import { RightSidebarProvider } from './contexts/RightSidebarContext';
import RightActionSidebar from './components/RightActionSidebar';
const NotificationCenter = lazy(() => import('./components/notifications_and_logs/NotificationCenter'));
const LogViewer = lazy(() => import('./components/notifications_and_logs/LogViewer'));
const ExpandedLogs = lazy(() => import('./components/notifications_and_logs/ExpandedLogs'));
import { appLogger } from './services/notifications_and_logs/loggerService';


const Dashboard = lazy(() => import('./components/Dashboard'));
const UploadCenter = lazy(() => import('./components/UploadCenter'));
const SalesDashboard = lazy(() => import("./components/vendas/SalesDashboard"));
const QuoteComparator = lazy(() => import('./components/compras/QuoteComparator'));
const OrderManager = lazy(() => import('./components/compras/OrderManager'));
const Schedule = lazy(() => import('./components/Schedule'));
const ProductCatalog = lazy(() => import('./components/ProductCatalog'));
const ProductDatabase = lazy(() => import('./components/ProductDatabase'));
const OfferFlyer = lazy(() => import('./components/OfferFlyer'));
const ExitUnsavedModal = lazy(() => import('./components/shared/ExitUnsavedModal'));
const SupplierManager = lazy(() => import('./components/compras/SupplierManager'));
const SupplierCatalogView = lazy(() => import('./components/compras/SupplierCatalogView'));
const AppSettingsPanel = lazy(() => import('./components/AppSettings'));
const UserProfilePanel = lazy(() => import('./components/UserProfile'));
import { DEFAULT_GLOBAL_PACK_RULES, applyRulesToQuotes } from './services/compras/packRulesService';
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
  QuoteStage,
  InventoryCountMap,
  InventoryCountTimestamps,
  CategoryTree,
  AppLog,
  SaleOrder,
  SaleOrderItem,
  StockMovement,
  PdvSession,
} from './types';

import {
  BarChart3, Users, FileText, Database, Scale, Settings,
  CalendarDays, ClipboardList, LogOut, ChevronDown, Tag, MessageSquare,
  LayoutDashboard, Menu, X, UploadCloud, Package, TrendingUp, Lock, ChevronRight,
  PackageSearch, Terminal,
} from 'lucide-react';

const BuyingAssistant = lazy(() => import('./components/compras/BuyingAssistant'));
const QuoteRequest = lazy(() => import('./components/compras/QuoteRequest'));
const InventoryCount = lazy(() => import('./components/inventory_count/InventoryCount'));
const CategoryManager = lazy(() => import('./components/category_manager/CategoryManager'));

// ─── defaults ────────────────────────────────────────────────────────────────
// defaultGlobalPackRules movido para services/compras/packRulesService.ts

const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '',
  companyName: '',
  document: '',
  email: '',
  deliveryAddresses: [],
};

// ─── Login / Loading ──────────────────────────────────────────────────────────

const AnimatedHeroText: React.FC = () => {
  const [active, setActive] = useState<0 | 1>(0);
  const [phase, setPhase] = useState<'idle' | 'entering' | 'holding' | 'leaving'>('idle');

  // Wait for entrance animations, then start the cycle
  useEffect(() => {
    const t = setTimeout(() => setPhase('entering'), 1500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phase === 'idle') return;
    let t: ReturnType<typeof setTimeout>;
    if (phase === 'entering') {
      t = setTimeout(() => setPhase('holding'), 500);
    } else if (phase === 'holding') {
      t = setTimeout(() => setPhase('leaving'), 3000);
    } else {
      t = setTimeout(() => {
        setActive(p => (p === 0 ? 1 : 0) as 0 | 1);
        setPhase('entering');
      }, 500);
    }
    return () => clearTimeout(t);
  }, [phase]);

  const estIsAmber = (active === 0 && (phase === 'entering' || phase === 'holding')) || phase === 'idle';
  const estIsPushed = active === 0 && (phase === 'entering' || phase === 'holding');
  const resIsAmber = active === 1 && (phase === 'entering' || phase === 'holding');
  const resIsPushed = active === 1 && (phase === 'entering' || phase === 'holding');

  return (
    <div className="font-display font-bold leading-none select-none text-[clamp(3rem,5.5vw,4.8rem)]">
      <span className="block text-white">COMPRAS</span>

      {/* ESTRATÉGICAS */}
      <div className="relative">
        <ChevronRight
          size={28}
          className={`absolute top-1/2 -translate-y-1/2 text-amber-400 transition-all duration-500 ease-out ${estIsPushed ? 'opacity-100 -left-8' : 'opacity-0 -left-20'
            }`}
        />
        <span className={`block transition-all duration-500 ease-out ${estIsPushed ? 'translate-x-7' : 'translate-x-0'
          } ${estIsAmber ? 'text-amber-400' : 'text-white/25'}`}>
          ESTRATÉGICAS.
        </span>
      </div>

      {/* RESULTADOS REAIS */}
      <div className="relative">
        <ChevronRight
          size={28}
          className={`absolute top-1/2 -translate-y-1/2 text-amber-400 transition-all duration-500 ease-out ${resIsPushed ? 'opacity-100 -left-8' : 'opacity-0 -left-20'
            }`}
        />
        <div className={`transition-all duration-500 ease-out ${resIsPushed ? 'translate-x-7' : 'translate-x-0'
          } ${resIsAmber ? 'text-amber-400' : 'text-white/25'}`}>
          <span className="block">RESULTADOS</span>
          <span className="block">REAIS.</span>
        </div>
      </div>
    </div>
  );
};

const LoginScreen: React.FC<{ onLogin: () => void; loading: boolean }> = ({ onLogin, loading }) => (
  <div className="flex h-screen overflow-hidden bg-[#0e0b08]">

    {/* ── LEFT PANEL — branding (desktop only) ───────────────────────────── */}
    <div className="hidden lg:flex lg:w-[58%] relative flex-col p-10 xl:p-14 overflow-x-hidden overflow-y-auto border-r border-amber-900/20 bg-[#0e0b08]">
      {/* Grid texture */}
      <div className="absolute inset-0 login-grid pointer-events-none" />
      {/* Directional gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#0e0b08]/60 to-amber-950/20 pointer-events-none" />
      {/* Ambient glow orbs */}
      <div className="absolute top-[18%] left-[10%] w-[480px] h-[480px] bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[8%] right-[5%] w-[280px] h-[280px] bg-amber-700/[0.04] rounded-full blur-3xl pointer-events-none" />

      {/* Top: wordmark */}
      <div className="relative shrink-0 flex items-center gap-3 login-anim login-anim-1">
        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shrink-0">
          <img src="/img/CATOS_MASTER_BUYER_LOGO_120X.webp" alt="Logo Cato's" className="w-full h-full object-contain" />
        </div>
        <span className="font-body text-white/60 text-sm font-medium tracking-wider">Cato's Master Buyer</span>
      </div>

      {/* Center: hero + description + bullets — vertically centered, compresses gracefully */}
      <div className="relative flex-1 flex flex-col justify-center min-h-0 py-8 gap-8">
        <div className="login-anim login-anim-2">
          <p className="font-body text-amber-500/60 text-[10px] font-semibold tracking-[0.22em] uppercase mb-5">
            MasterBuyer 2026
          </p>
          <AnimatedHeroText />
        </div>

        <p className="font-body text-slate-500 text-sm leading-relaxed max-w-xs login-anim login-anim-3">
          Plataforma completa de gestão de compras para distribuidoras. Cotações, pedidos e análises em um único lugar.
        </p>

        {/* Feature bullets */}
        <div className="space-y-3 login-anim login-anim-4">
          {([
            { icon: BarChart3, text: 'Comparador de cotações em tempo real' },
            { icon: Package, text: 'Gestão completa de pedidos e fornecedores' },
            { icon: TrendingUp, text: 'Histórico de preços com análise de IA' },
          ] as { icon: React.ElementType; text: string }[]).map(({ icon: Icon, text }) => (
            <div key={text} className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-md bg-amber-600/10 border border-amber-600/20 flex items-center justify-center shrink-0">
                <Icon size={13} className="text-amber-500" />
              </div>
              <span className="font-body text-slate-400 text-sm">{text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Bottom: copyright */}
      <p className="relative shrink-0 font-body text-white/15 text-xs login-anim login-anim-5">
        © 2026 BEER CONVENIENCIA. Todos os direitos reservados.
      </p>
    </div>

    {/* ── RIGHT PANEL — login form ────────────────────────────────────────── */}
    <div className="flex-1 flex flex-col items-center justify-center p-8 bg-[#080605] relative">
      <div className="absolute inset-0 bg-gradient-to-t from-amber-950/[0.08] via-transparent to-transparent pointer-events-none" />

      <div className="relative w-full max-w-[340px] space-y-7">

        {/* Mobile logo */}
        <div className="flex lg:hidden justify-center login-anim login-anim-1">
          <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="font-display font-bold text-xl text-white">B</span>
          </div>
        </div>

        {/* Header */}
        <div className="login-anim login-anim-2">
          <h1 className="font-display font-bold text-white tracking-tight text-[2rem]">
            BEM-VINDO
          </h1>
          <p className="font-body text-slate-500 mt-1.5 text-sm">Acesse sua conta para continuar</p>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3 login-anim login-anim-3">
          <div className="flex-1 h-px bg-white/[0.06]" />
          <span className="font-body text-white/20 text-[10px] tracking-[0.18em] uppercase">login</span>
          <div className="flex-1 h-px bg-white/[0.06]" />
        </div>

        {/* Google button */}
        <div className="login-anim login-anim-4">
          <button
            onClick={onLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white text-slate-900 font-semibold py-3.5 px-5 rounded-xl hover:bg-slate-50 active:scale-[0.98] transition-all duration-150 shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="font-body text-sm text-slate-500">Entrando...</span>
            ) : (
              <>
                <svg className="w-[18px] h-[18px] shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                <span className="font-body text-sm">Entrar com Google</span>
              </>
            )}
          </button>
        </div>

        {/* Security note */}
        <div className="flex items-center justify-center gap-2 text-white/20 login-anim login-anim-5">
          <Lock size={11} />
          <p className="font-body text-xs">Login seguro · Dados sincronizados na nuvem</p>
        </div>

        {/* Version badge */}
        <div className="flex justify-center login-anim login-anim-6">
          <span className="font-body px-3 py-1 bg-white/[0.04] border border-white/[0.07] rounded-full text-white/20 text-[11px]">
            MasterBuyer 2026
          </span>
        </div>

      </div>
    </div>
  </div>
);

const LoadingScreen: React.FC = () => (
  <div className="relative flex flex-col items-center justify-center h-screen overflow-hidden bg-[#0e0b08]">
    {/* Fundo de Grade e Efeitos de Brilho idênticos aos da tela de Login */}
    <div className="absolute inset-0 login-grid pointer-events-none" />
    <div className="absolute inset-0 bg-gradient-to-br from-transparent via-[#0e0b08]/60 to-amber-950/20 pointer-events-none" />
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-amber-600/5 rounded-full blur-3xl pointer-events-none" />

    {/* Card Premium de Vidro */}
    <div className="relative z-10 flex flex-col items-center p-8 rounded-2xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-md shadow-2xl max-w-[280px] w-full text-center">
      {/* Icone da Marca com Spinner Orbital */}
      <div className="relative w-16 h-16 mb-5 flex items-center justify-center">
        {/* Anel Externo Estático */}
        <div className="absolute inset-0 border-2 border-amber-600/10 rounded-xl" />
        {/* Anel Rotativo de Carregamento */}
        <div className="absolute inset-0 border-2 border-t-amber-500 border-r-amber-500 rounded-xl animate-spin" />

        {/* Logo Central Pulsante */}
        <div className="w-10 h-10 bg-amber-600 rounded-lg flex items-center justify-center shadow-lg shadow-amber-600/20 animate-pulse">
          <span className="font-display font-black text-lg text-white">B</span>
        </div>
      </div>

      {/* Textos de Status */}
      <h3 className="font-display font-bold text-white tracking-widest text-[10px] uppercase mb-1.5 opacity-90">
        Sincronizando
      </h3>
      <p className="font-body text-slate-400 text-xs animate-pulse">
        Carregando seus dados...
      </p>

      {/* Linha de Progresso Fluida */}
      <div className="w-full h-1 bg-white/[0.04] rounded-full overflow-hidden mt-4">
        <div className="h-full bg-gradient-to-r from-amber-600 to-amber-400 rounded-full animate-pulse w-[65%]" />
      </div>
    </div>
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
    'dashboard' | 'uploads' | 'sales' | 'comparator' | 'purchase_orders' | 'schedule' |
    'catalog' | 'suppliers' | 'database' | 'settings' | 'profile' | 'quote_request' |
    'inventory_count' | 'category_manager'
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
  const [globalPackRules, setGlobalPackRules] = useState<PackRule[]>(DEFAULT_GLOBAL_PACK_RULES);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [saleOrders, setSaleOrders] = useState<SaleOrder[]>([]);
  const [pdvSessions, setPdvSessions] = useState<PdvSession[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_USER_PROFILE);

  // --- NOTIFICATIONS & LOGS ---
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [appLogs, setAppLogs] = useState<AppLog[]>([]);


  // --- CATALOGS ---
  const [supplierCatalogs, setSupplierCatalogs] = useState<Record<string, SupplierCatalog>>({});
  const [priceValidityConfig, setPriceValidityConfig] = useState<PriceValidityConfig>({ globalDays: 7 });
  const [catalogTab, setCatalogTab] = useState<string>('master');

  // --- QUOTE STAGES ---
  const [quoteStages, setQuoteStages] = useState<QuoteStage[]>([]);

  // --- INVENTORY COUNT (confirmed / Firebase) ---
  const [inventoryCount, setInventoryCount] = useState<InventoryCountMap>({});
  const [inventoryTimestamps, setInventoryTimestamps] = useState<InventoryCountTimestamps>({});

  // --- CATEGORY TREE ---
  const [categoryTree, setCategoryTree] = useState<CategoryTree>({});

  // --- SETTINGS ---
  const [hiddenProducts, setHiddenProducts] = useState<HiddenProduct[]>([]);
  const [appSettings, setAppSettings] = useState<AppSettings>({ showInactiveProducts: false, priceValidityDays: 7 });

  // --- PROFILE DROPDOWN & MOBILE MENU ---
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [offerFlyerOpen, setOfferFlyerOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isExpandedLogsOpen, setIsExpandedLogsOpen] = useState(false);


  const [isDirty, setIsDirty] = useState(false);

  const [showExitModal, setShowExitModal] = useState<{ nextTab: typeof activeTab } | null>(null);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Refs para diff de chaves com escrita por delta (1 doc/item no Firestore).
  // Atualizados em loadAllData e no useEffect de save após o flush para Firestore.
  const prevSuppliersRef = useRef<Supplier[]>([]);
  const prevPurchaseOrdersRef = useRef<PurchaseOrder[]>([]);
  const prevSaleOrdersRef = useRef<SaleOrder[]>([]);
  const prevPdvSessionsRef = useRef<PdvSession[]>([]);

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
        initLogger(firebaseUser.uid);
        await loadAllData(firebaseUser.uid);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listener para logs do sistema
  useEffect(() => {
    const unsubscribe = addLogListener((newLogs) => {
      setAppLogs(newLogs);
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
      loadAllSuppliers<Supplier>(uid),
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
      loadUserData<PackRule[]>(uid, 'globalPackRules', DEFAULT_GLOBAL_PACK_RULES),
    ]);

    // Sincroniza ref de diff ANTES do setSuppliers para que o useEffect de delta
    // veja prev === next na primeira execução pós-load e não dispare upserts.
    prevSuppliersRef.current = savedSuppliers;
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

    const [savedHidden, savedAppSettings, savedPurchaseOrders, savedUserProfile, savedQuoteStages, savedInventoryCount, savedCategoryTree, savedInventoryTimestamps, savedSaleOrders, savedPdvSessions, savedStockMovements] = await Promise.all([
      loadUserData<HiddenProduct[]>(uid, 'hiddenProducts', []),
      loadUserData<AppSettings>(uid, 'appSettings', { showInactiveProducts: false, priceValidityDays: 7 }),
      loadAllPurchaseOrders<PurchaseOrder>(uid),
      loadUserData<UserProfile>(uid, 'userProfile', DEFAULT_USER_PROFILE),
      loadUserData<QuoteStage[]>(uid, 'quoteStages', []),
      loadUserData<InventoryCountMap>(uid, 'inventoryCount', {}),
      loadUserData<CategoryTree>(uid, 'categoryTree', {}),
      loadUserData<InventoryCountTimestamps>(uid, 'inventoryTimestamps', {}),
      loadAllSaleOrders<SaleOrder>(uid),
      loadAllPdvSessions<PdvSession>(uid),
      loadAllStockMovements<StockMovement>(uid),
    ]);
    setHiddenProducts(savedHidden);
    setAppSettings(savedAppSettings);
    // Mesma sincronização do ref de diff para purchaseOrders.
    prevPurchaseOrdersRef.current = savedPurchaseOrders;
    setPurchaseOrders(savedPurchaseOrders);
    setUserProfile(savedUserProfile);
    setQuoteStages(savedQuoteStages);
    setInventoryCount(savedInventoryCount);
    setCategoryTree(savedCategoryTree);
    setInventoryTimestamps(savedInventoryTimestamps);
    prevSaleOrdersRef.current = savedSaleOrders;
    setSaleOrders(savedSaleOrders);
    prevPdvSessionsRef.current = savedPdvSessions;
    setPdvSessions(savedPdvSessions);
    setStockMovements(savedStockMovements);

    setDataLoading(false);
    setIsLoaded(true);
  };

  // --- SALVA NO FIREBASE ---
  const uid = user?.uid;

  // Delta-write para suppliers: compara prev vs next, upserta apenas alterados,
  // deleta apenas removidos. Nunca escreve o array inteiro.
  useEffect(() => {
    if (!uid || !isLoaded) return;
    const prev = prevSuppliersRef.current;
    const prevMap = new Map<string, Supplier>(prev.map((s: Supplier) => [s.id, s]));
    const nextMap = new Map<string, Supplier>(suppliers.map((s: Supplier) => [s.id, s]));
    const deletedIds: string[] = [];
    for (const old of prev) if (!nextMap.has(old.id)) deletedIds.push(old.id);
    const changed: Supplier[] = [];
    for (const s of suppliers) {
      const old = prevMap.get(s.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(s)) changed.push(s);
    }
    if (deletedIds.length > 0) deleteSuppliers(uid, deletedIds);
    if (changed.length > 0) upsertSuppliers(uid, changed);
    prevSuppliersRef.current = suppliers;
  }, [suppliers, uid, isLoaded]);
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
  // Delta-write para purchaseOrders (mesmo padrão de suppliers).
  useEffect(() => {
    if (!uid || !isLoaded) return;
    const prev = prevPurchaseOrdersRef.current;
    const prevMap = new Map<string, PurchaseOrder>(prev.map((o: PurchaseOrder) => [o.id, o]));
    const nextMap = new Map<string, PurchaseOrder>(purchaseOrders.map((o: PurchaseOrder) => [o.id, o]));
    const deletedIds: string[] = [];
    for (const old of prev) if (!nextMap.has(old.id)) deletedIds.push(old.id);
    const changed: PurchaseOrder[] = [];
    for (const o of purchaseOrders) {
      const old = prevMap.get(o.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(o)) changed.push(o);
    }
    if (deletedIds.length > 0) deletePurchaseOrders(uid, deletedIds);
    if (changed.length > 0) upsertPurchaseOrders(uid, changed);
    prevPurchaseOrdersRef.current = purchaseOrders;
  }, [purchaseOrders, uid, isLoaded]);
  // Delta-write para saleOrders — mesma estratégia; pedidos nunca são deletados,
  // mas o delta evita rewrites desnecessários.
  useEffect(() => {
    if (!uid || !isLoaded) return;
    const prev = prevSaleOrdersRef.current;
    const prevMap = new Map<string, SaleOrder>(prev.map((o) => [o.id, o]));
    const changed: SaleOrder[] = [];
    for (const o of saleOrders) {
      const old = prevMap.get(o.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(o)) changed.push(o);
    }
    if (changed.length > 0) upsertSaleOrders(uid, changed);
    prevSaleOrdersRef.current = saleOrders;
  }, [saleOrders, uid, isLoaded]);
  // Delta-write para pdvSessions.
  useEffect(() => {
    if (!uid || !isLoaded) return;
    const prev = prevPdvSessionsRef.current;
    const prevMap = new Map<string, PdvSession>(prev.map((s) => [s.id, s]));
    const changed: PdvSession[] = [];
    for (const s of pdvSessions) {
      const old = prevMap.get(s.id);
      if (!old || JSON.stringify(old) !== JSON.stringify(s)) changed.push(s);
    }
    if (changed.length > 0) upsertPdvSessions(uid, changed);
    prevPdvSessionsRef.current = pdvSessions;
  }, [pdvSessions, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'priceValidityConfig', priceValidityConfig); }, [priceValidityConfig, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'hiddenProducts', hiddenProducts); }, [hiddenProducts, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'appSettings', appSettings); }, [appSettings, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'userProfile', userProfile); }, [userProfile, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'quoteStages', quoteStages); }, [quoteStages, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveNotifications(uid, notifications); }, [notifications, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'inventoryCount', inventoryCount); }, [inventoryCount, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'inventoryTimestamps', inventoryTimestamps); }, [inventoryTimestamps, uid, isLoaded]);
  useEffect(() => { if (uid && isLoaded) saveUserData(uid, 'categoryTree', categoryTree); }, [categoryTree, uid, isLoaded]);

  const handleSaveTimestamps = useCallback((ts: InventoryCountTimestamps) => {
    setInventoryTimestamps(prev => ({ ...prev, ...ts }));
  }, []);

  const handleUpdateProductStocks = useCallback((stockUpdates: Record<string, number>) => {
    const now = new Date().toISOString();
    const userDisplay = userProfile?.displayName || user?.displayName || user?.email || 'Sistema';

    setMasterProducts(prev =>
      prev.map(p => {
        if (stockUpdates[p.id] !== undefined && p.stock !== stockUpdates[p.id]) {
          const audited = {
            ...p,
            stock: stockUpdates[p.id],
            lastUpdatedAt: now,
            lastUpdatedBy: userDisplay,
            lastUpdateSource: 'inventory_sync' as const
          };
          if (uid) {
            appendAuditEntry(uid, p.id, p.sku, {
              timestamp: now,
              userId: uid,
              userDisplay,
              source: 'inventory_sync',
              fields: [{ field: 'stock', label: 'Estoque', from: p.stock || 0, to: stockUpdates[p.id] }]
            });
          }
          return audited;
        }
        return p;
      })
    );
    setInventoryCount(prev => {
      const next = { ...prev };
      Object.keys(stockUpdates).forEach(id => delete next[id]);
      return next;
    });
  }, [uid, user, userProfile]);

  // --- ARQUIVAMENTO AUTOMÁTICO DE COTAÇÕES ANTIGAS ---
  useEffect(() => {
    if (!isLoaded || !uid) return;
    const archiveDays = priceValidityConfig.quoteArchiveDays ?? 90;
    const threshold = archiveDays * 86_400_000;
    const now = Date.now();
    let changed = false;

    const updated = suppliers.map(s => ({
      ...s,
      quotes: s.quotes.map(q => {
        if (!q.isSaved || q.archivedCsv || !q.items.length || q.status !== 'completed') return q;
        const age = now - (q.savedAt ?? q.timestamp);
        if (age < threshold) return q;

        const header = 'SKU;Produto;PrecoLista;Unidade;QtdEmbalagem;PrecoUnitarioCalculado';
        const rows = q.items.map(item => {
          const listPrice = item.priceStrategy === 'unit' ? item.unitPrice : item.price;
          return `${item.sku};${item.name};"${listPrice.toFixed(2).replace('.', ',')}";${item.unit};${item.packQuantity};"${item.unitPrice.toFixed(2).replace('.', ',')}"`;
        });
        changed = true;
        return { ...q, archivedCsv: [header, ...rows].join('\n'), archivedItemCount: q.items.length, items: [], rawContent: undefined };
      }),
    }));

    if (changed) setSuppliers(updated);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]); // roda uma vez após o carregamento inicial

  // --- NOTIFICATION HANDLERS ---
  const handleNotificationResolve = useCallback(async (id: string, keepWhich?: 'existing' | 'incoming' | 'both') => {
    // Para evitar stale closure do array `notifications`, buscamos o item diretamente do estado atual
    setNotifications(prev => {
      const notif = prev.find(n => n.id === id);
      if (notif?.payload && keepWhich && user?.uid) {
        // Dispara a resolução assíncrona (Firestore) sem travar a UI
        resolveDuplicate(user.uid, notif, keepWhich).catch(err => {
          console.error("Erro ao resolver duplicidade:", err);
        });
      }
      return prev.map(n =>
        n.id === id ? { ...n, resolved: true } : n
      ).filter(n => !(n.type === 'attention' && n.id === id));
    });
  }, [user?.uid]);

  const handleClearConsole = useCallback(() => {
    setNotifications(prev => prev.filter(n => n.type === 'attention'));
  }, []);

  // --- BATCH HANDLER ---
  const handleBatchCompleted = useCallback(async (batch: QuoteBatch, supplierId: string) => {
    if (!user?.uid) return;
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return;

    // --- DICIONÁRIO INTERCEPTOR (TRADUÇÃO E UNIFICAÇÃO) ---
    // Pega os itens, joga no Dicionário Global. Se o Bruno já apertou o "Botão Verde" pra esse texto no passado...
    const translatedItems = batch.items.map(item => {
      const itemNormForMapping = item.name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const mapping = productMappings.find(m => m.supplierProductNameNormalized === itemNormForMapping);
      if (mapping?.targetSku) {
        // Caso A: mapeado para produto master (comportamento original)
        if (!mapping.targetType || mapping.targetType === 'master') {
          const master = masterProducts.find((mp: MasterProduct) => mp.sku === mapping.targetSku);
          if (master) {
            return { ...item, name: master.name };
          }
        }
        // Caso B: mapeado para alias histórico do fornecedor
        if (mapping.targetType === 'supplier' && mapping.targetName) {
          return { ...item, name: mapping.targetName };
        }
      }
      return item;
    });

    const finalBatch = { ...batch, items: translatedItems };

    // Persiste o batch localmente (fila do fornecedor) caso seja UploadCenter/SupplierManager
    setSuppliers(prev => prev.map(s => {
      if (s.id !== supplierId) return s;
      const exists = s.quotes.some(q => q.id === batch.id);
      return {
        ...s,
        quotes: exists
          ? s.quotes.map(q => q.id === batch.id ? batch : q)
          : [batch, ...s.quotes]
      };
    }));

    // Impede que cotações recém-lidas "vazem" direto pro Catálogo sem o Confere Manual
    if (!batch.isSaved) {
      return;
    }

    const { newNotifications } = await processBatchIntoHistory(
      user.uid, finalBatch, supplier, productMappings, notifications
    );
    if (newNotifications.length > 0) {
      setNotifications(prev => [...newNotifications, ...prev]);
    }

    const { catalog, newProducts, updatedProducts } = await processBatchIntoCatalog(
      user.uid, finalBatch, supplierId, supplier.name, masterProducts
    );

    // Remove entradas antigas do catálogo cujos nomes foram traduzidos (evita duplicidade)
    const orphanedIds = batch.items
      .map((item, i) => {
        const translatedName = translatedItems[i].name;
        if (item.name !== translatedName) return makeProductId(item.name);
        return null;
      })
      .filter((id): id is string => id !== null);

    let processedCatalog = catalog;
    if (orphanedIds.length > 0) {
      processedCatalog = {
        ...catalog,
        products: catalog.products.filter(p => !orphanedIds.includes(p.id)),
        updatedAt: Date.now(),
      };
    }

    // Merge + save único: preserva linkConfirmed do estado em memória (set por addMapping)
    // para não sobrescrever links confirmados com versão desatualizada lida do Firestore
    setSupplierCatalogs(prev => {
      const current = prev[supplierId];
      const products = processedCatalog.products.map(p => {
        const inMem = current?.products.find(c => c.id === p.id);
        if (inMem?.linkConfirmed && !p.linkConfirmed) {
          return {
            ...p,
            linkConfirmed: true,
            masterSku: inMem.masterSku,
            masterProductName: inMem.masterProductName,
            masterCategory: inMem.masterCategory,
            masterTags: inMem.masterTags,
            linkSuggestion: undefined,
            linkSuggestionScore: undefined,
          };
        }
        return p;
      });
      const merged = { ...processedCatalog, products };
      saveCatalog(user.uid, merged);
      return { ...prev, [supplierId]: merged };
    });

    if (newProducts > 0 || updatedProducts > 0) {
      setNotifications(prev => {
        const filtered = prev.filter(n => n.id !== `catalog-${batch.id}`);
        return [{
          id: `catalog-${batch.id}`,
          type: 'console',
          title: 'Catálogo atualizado',
          message: `${supplier.name}: ${newProducts} novo(s), ${updatedProducts} atualizado(s)`,
          timestamp: Date.now(),
          resolved: false,
          supplierId,
          supplierName: supplier.name,
          batchId: batch.id,
        }, ...filtered];
      });
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
    // Clear intencional → autoriza save vazio uma vez (atualiza lastCount=0).
    // O useEffect subsequente verá prev=0, next=0, e a Invariante 2 não dispara.
    if (uid) saveUserData(uid, 'hiddenProducts', [], { allowEmpty: true });
  }, [uid]);

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
    // Resetar guards ANTES dos setters: garante que useEffects não disparem
    // saves residuais com isLoaded=true antes do React processar o batch.
    setIsLoaded(false);
    resetSessionGuards();
    // Reset dos refs de diff — sem isso, no próximo login os deltas seriam
    // calculados contra os dados do usuário anterior.
    prevSuppliersRef.current = [];
    prevPurchaseOrdersRef.current = [];
    prevSaleOrdersRef.current = [];
    prevPdvSessionsRef.current = [];
    setUser(null);
    setSuppliers([]);
    setSalesData([]);
    setForecast([]);
    setCart([]);
    setProductMappings([]);
    setIgnoredMappings([]);
    setMasterProducts([]);
    setUserProfile(DEFAULT_USER_PROFILE);
    setSaleOrders([]);
    setPdvSessions([]);
    setStockMovements([]);
  };

  // --- HELPERS ---
  const addMapping = useCallback((supplierProductName: string, targetSku: string, targetType?: 'master' | 'supplier', targetName?: string, supplierSku?: string) => {
    const normalized = normForMapping(supplierProductName);
    setProductMappings(prev => {
      const existing = prev.findIndex(m => m.supplierProductNameNormalized === normalized);
      let newMappings: ProductMapping[];
      if (existing >= 0) {
        const copy = [...prev];
        copy[existing] = {
          ...copy[existing],
          targetSku, targetType, targetName,
          ...(supplierSku ? { supplierSku } : {}),
        };
        newMappings = copy;
      } else {
        newMappings = [...prev, { supplierProductNameNormalized: normalized, targetSku, targetType, targetName, ...(supplierSku ? { supplierSku } : {}) }];
      }
      // PARTE 2: save immediately, not only via useEffect
      if (uid) saveUserData(uid, 'mappings', newMappings);
      return newMappings;
    });

    // PARTE 1a + PARTE 5: propagate link to supplierCatalogs and dedup entries with same masterSku
    if (!targetType || targetType === 'master') {
      const masterProduct = masterProducts.find(p => p.sku === targetSku);
      if (masterProduct && uid) {
        setSupplierCatalogs(prev => {
          const updated = { ...prev };
          for (const catalog of Object.values(updated) as SupplierCatalog[]) {
            const hasMatch = catalog.products.some(p => normForMapping(p.name) === normalized);
            if (!hasMatch) continue;

            // Apply link to matched products
            let updatedProducts = catalog.products.map(p =>
              normForMapping(p.name) === normalized
                ? {
                  ...p, masterSku: targetSku, masterProductName: masterProduct.name,
                  masterCategory: masterProduct.category, masterTags: masterProduct.tags,
                  linkConfirmed: true, linkSuggestion: undefined
                }
                : p
            );

            // Dedup: merge all entries sharing the same masterSku into the most recent one
            const dupes = updatedProducts.filter(p => p.masterSku === targetSku);
            if (dupes.length > 1) {
              const newest = dupes.reduce((a, b) => a.lastSeenDate > b.lastSeenDate ? a : b);
              const allHistory = dupes.flatMap(p => p.priceHistory);
              const mergedHistory = [...new Map(allHistory.map(e => [e.batchId, e] as [string, any])).values()]
                .sort((a: any, b: any) => b.date - a.date)
                .slice(0, 60);
              const dupeIds = new Set(dupes.map(p => p.id));
              dupeIds.delete(newest.id);
              updatedProducts = updatedProducts
                .filter(p => !dupeIds.has(p.id))
                .map(p => p.id === newest.id ? { ...newest, priceHistory: mergedHistory } : p);
            }

            const updatedCatalog = { ...catalog, products: updatedProducts };
            saveCatalog(uid, updatedCatalog);
            updated[catalog.supplierId] = updatedCatalog;
          }
          return updated;
        });
      }
    }
  }, [uid, masterProducts]);

  const removeMapping = useCallback((supplierProductName: string) => {
    const normalized = normForMapping(supplierProductName);
    setProductMappings(prev => {
      const newMappings = prev.filter(m => m.supplierProductNameNormalized !== normalized);
      // PARTE 2: save immediately
      if (uid) saveUserData(uid, 'mappings', newMappings);
      return newMappings;
    });

    // PARTE 1b: propagate unlink to supplierCatalogs
    if (uid) {
      setSupplierCatalogs(prev => {
        const updated = { ...prev };
        for (const catalog of Object.values(updated) as SupplierCatalog[]) {
          const hasMatch = catalog.products.some(p => normForMapping(p.name) === normalized);
          if (!hasMatch) continue;
          const updatedCatalog = {
            ...catalog,
            products: catalog.products.map(p =>
              normForMapping(p.name) === normalized
                ? {
                  ...p, masterSku: undefined, masterProductName: undefined,
                  masterCategory: undefined, masterTags: undefined, linkConfirmed: false
                }
                : p
            ),
          };
          saveCatalog(uid, updatedCatalog);
          updated[catalog.supplierId] = updatedCatalog;
        }
        return updated;
      });
    }
  }, [uid]);

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

  // seqNumber automático para pedidos de venda
  const getNextSaleSeqNumber = useCallback(() => {
    if (saleOrders.length === 0) return 1;
    return Math.max(...saleOrders.map(o => o.seqNumber || 0)) + 1;
  }, [saleOrders]);

  // Cria SaleOrder a partir do PDV ou manual (status inicial: pending, sem movimentação de estoque ainda)
  const handleFinalizeSale = useCallback((
    items: SaleOrderItem[],
    paymentMethod: SaleOrder['paymentMethod'],
    origin: SaleOrder['origin'] = 'pdv',
    customerName?: string,
  ): SaleOrder => {
    const now = new Date().toISOString();
    const subtotal = items.reduce((s, i) => s + i.total, 0);
    const openSession = pdvSessions.find(s => s.status === 'open');
    const newOrder: SaleOrder = {
      id: crypto.randomUUID(),
      seqNumber: getNextSaleSeqNumber(),
      origin,
      status: 'pending',
      items,
      paymentMethod,
      subtotal,
      discount: 0,
      total: subtotal,
      customerName: customerName ?? 'Consumidor Final',
      pdvSessionId: openSession?.id,
      stockMovementIds: [],
      createdAt: now,
      updatedAt: now,
      createdBy: uid ?? '',
    };
    setSaleOrders(prev => [newOrder, ...prev]);
    if (openSession) {
      setPdvSessions(prev => prev.map(s =>
        s.id === openSession.id
          ? { ...s, saleOrderIds: [...s.saleOrderIds, newOrder.id] }
          : s
      ));
    }
    return newOrder;
  }, [uid, getNextSaleSeqNumber, pdvSessions]);

  // Debita estoque: pending → stock_committed. Grava StockMovements append-only.
  const handleCommitStock = useCallback((orderId: string) => {
    if (!uid) return;
    const order = saleOrders.find(o => o.id === orderId);
    if (!order || order.status !== 'pending') return;
    const now = new Date().toISOString();
    const movements: StockMovement[] = order.items.map(item => ({
      id: crypto.randomUUID(),
      productId: item.productId,
      sku: item.sku,
      productName: item.name,
      qty: -item.qty,
      type: 'sale_out' as const,
      refType: 'sale_order' as const,
      refId: order.id,
      performedBy: uid,
      createdAt: now,
    }));
    appendStockMovements(uid, movements);
    setStockMovements(prev => [...prev, ...movements]);
    setMasterProducts(prev => prev.map(p => {
      const mv = movements.find(m => m.productId === p.id);
      return mv ? { ...p, stock: (p.stock || 0) + mv.qty } : p;
    }));
    const updatedOrder: SaleOrder = {
      ...order,
      status: 'stock_committed',
      stockMovementIds: movements.map(m => m.id),
      updatedAt: now,
    };
    setSaleOrders(prev => prev.map(o => o.id === orderId ? updatedOrder : o));
  }, [uid, saleOrders]);

  // Cancela pedido. Se estava stock_committed, gera reversals e devolve estoque.
  const handleCancelOrder = useCallback((orderId: string, reason: string) => {
    if (!uid) return;
    const order = saleOrders.find(o => o.id === orderId);
    if (!order || order.status === 'cancelled') return;
    const now = new Date().toISOString();
    if (order.status === 'stock_committed') {
      const reversals: StockMovement[] = order.items.map(item => ({
        id: crypto.randomUUID(),
        productId: item.productId,
        sku: item.sku,
        productName: item.name,
        qty: item.qty,
        type: 'reversal' as const,
        refType: 'sale_order' as const,
        refId: order.id,
        performedBy: uid,
        createdAt: now,
      }));
      appendStockMovements(uid, reversals);
      setStockMovements(prev => [...prev, ...reversals]);
      setMasterProducts(prev => prev.map(p => {
        const rv = reversals.find(r => r.productId === p.id);
        return rv ? { ...p, stock: (p.stock || 0) + rv.qty } : p;
      }));
    }
    setSaleOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, status: 'cancelled', cancelReason: reason, updatedAt: now } : o
    ));
  }, [uid, saleOrders]);

  // Abre nova sessão de caixa — rejeita se já houver uma aberta
  const handleOpenSession = useCallback((cashierName: string, openingBalance: number) => {
    if (!uid) return;
    if (pdvSessions.some(s => s.status === 'open')) return;
    const now = new Date().toISOString();
    const session: PdvSession = {
      id: crypto.randomUUID(),
      cashierName,
      openedAt: now,
      openingBalance,
      saleOrderIds: [],
      status: 'open',
      createdBy: uid,
    };
    setPdvSessions(prev => [...prev, session]);
  }, [uid, pdvSessions]);

  // Fecha sessão de caixa ativa
  const handleCloseSession = useCallback((sessionId: string) => {
    const now = new Date().toISOString();
    setPdvSessions(prev => prev.map(s =>
      s.id === sessionId ? { ...s, status: 'closed' as const, closedAt: now } : s
    ));
  }, []);

  // Cria pedido a partir de itens processados no UploadCenter
  const handleCreateOrderFromUpload = useCallback((items: import('./types').CartItem[], supplierId: string) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    const now = Date.now();
    const newOrder: import('./types').PurchaseOrder = {
      id: crypto.randomUUID(),
      seqNumber: Math.max(0, ...purchaseOrders.map(o => o.seqNumber || 0)) + 1,
      supplierId,
      supplierName: supplier?.name || supplierId,
      items,
      totalValue: items.reduce((s, i) => s + i.packPrice * i.quantityToBuy, 0),
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      deliveryOrPickup: 'delivery',
      transitions: [],
    };
    setPurchaseOrders(prev => [newOrder, ...prev]);
  }, [suppliers, purchaseOrders]);

  // Re-aplica regras globais retroativamente em todas as cotações salvas de todos os fornecedores.
  // Chamado a partir de AppSettings → botão "Re-aplicar Regras a Todos os Fornecedores".
  const handleReapplyGlobalPackRules = useCallback(() => {
    if (!window.confirm('ATENÇÃO: Isso aplicará as Regras Globais em TODOS os fornecedores. Exceções individuais serão mantidas. Continuar?')) return;
    setSuppliers((prev: Supplier[]) => prev.map((s: Supplier) => ({
      ...s,
      quotes: s.quotes.map((q: QuoteBatch) => ({
        ...q,
        items: applyRulesToQuotes(q.items, s.packRules || [], globalPackRules),
      })),
    })));
    alert('Regras aplicadas com sucesso!');
  }, [globalPackRules, setSuppliers]);

  const activeOrdersCount = useMemo(
    () => purchaseOrders.filter(o => OPEN_STATUSES.includes(o.status)).length,
    [purchaseOrders]
  );

  const hiddenProductIdsSet = useMemo(
    () => new Set(hiddenProducts.map(h => h.id)),
    [hiddenProducts]
  );

  // --- RENDER ---
  if (authLoading) return <LoadingScreen />;
  if (!user) return <LoginScreen onLogin={handleLogin} loading={loginLoading} />;
  if (dataLoading) return <LoadingScreen />;

  // helper para navegação no mobile
  const navigateTo = (tab: typeof activeTab) => {
    if (isDirty) {
      setShowExitModal({ nextTab: tab });
      return;
    }
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const navItems: { tab: typeof activeTab; icon: React.ReactNode; label: string; highlight?: boolean }[] = [
    { tab: 'dashboard', icon: <LayoutDashboard className="w-5 h-5" />, label: 'Início' },
    { tab: 'uploads', icon: <UploadCloud className="w-5 h-5" />, label: 'Uploads' },
    { tab: 'suppliers', icon: <Users className="w-5 h-5" />, label: 'Fornecedores' },
    { tab: 'inventory_count', icon: <PackageSearch className="w-5 h-5" />, label: 'Contagem de Estoque' },
    { tab: 'category_manager', icon: <Tag className="w-5 h-5" />, label: 'Categorias' },
    { tab: 'database', icon: <Database className="w-5 h-5" />, label: 'Produtos' },
    { tab: 'sales', icon: <BarChart3 className="w-5 h-5" />, label: 'Vendas' },
    { tab: 'catalog', icon: <FileText className="w-5 h-5" />, label: 'Catálogo' },
    { tab: 'comparator', icon: <Scale className="w-5 h-5" />, label: 'Comparador' },
    { tab: 'purchase_orders', icon: <ClipboardList className="w-5 h-5" />, label: 'Pedidos' },
    { tab: 'schedule', icon: <CalendarDays className="w-5 h-5" />, label: 'Cronograma' },
    { tab: 'quote_request', icon: <MessageSquare className="w-5 h-5" />, label: 'Cotação', highlight: true },
  ];

  return (
    <RightSidebarProvider>
      <div className="flex h-screen w-full bg-slate-950 text-slate-200 font-sans overflow-hidden">
        {/* EXIT CONFIRMATION MODAL */}
        {showExitModal && (
          <Suspense fallback={null}>
            <ExitUnsavedModal
              onConfirm={() => {
                setIsDirty(false);
                setActiveTab(showExitModal.nextTab);
                setShowExitModal(null);
                setMobileMenuOpen(false);
              }}
              onCancel={() => setShowExitModal(null)}
            />
          </Suspense>
        )}

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
                className={`group relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === tab
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

          {/* ─── info-config-menu: Notif · Logs · Config · Perfil (sidebar sticky-bottom, todos os devices) ─── */}
          <div className="border-t border-slate-800 p-3 flex flex-col gap-1.5 shrink-0">
            <div className={`flex items-center gap-1 ${sidebarExpanded ? 'px-1' : 'justify-center'}`}>

              {/* Notificações */}
              <Suspense fallback={<div className="w-8 h-8" />}>
                <NotificationCenter
                  notifications={notifications}
                  onResolve={handleNotificationResolve}
                />
              </Suspense>

              {/* Logs */}
              <div className="relative">
                <button
                  onClick={() => setIsLogsOpen(!isLogsOpen)}
                  className={`p-1.5 rounded-lg transition-all ${isLogsOpen ? 'text-blue-400 bg-blue-400/10' : 'text-slate-400 hover:text-blue-400 hover:bg-slate-800'}`}
                  title="Logs"
                >
                  <Terminal className="w-4 h-4" />
                </button>
                {isLogsOpen && (
                  <LogViewer
                    logs={appLogs}
                    onClose={() => setIsLogsOpen(false)}
                    onClear={() => appLogger.clear()}
                    onExpand={() => { setIsExpandedLogsOpen(true); setIsLogsOpen(false); }}
                  />
                )}
              </div>

              {/* Configurações */}
              <button
                onClick={() => navigateTo('settings')}
                title="Configurações"
                className={`p-1.5 rounded-lg transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-amber-400' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {/* Perfil */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setProfileDropdownOpen(v => !v)}
                className={`w-full flex items-center ${sidebarExpanded ? 'gap-3 px-2' : 'justify-center'} py-2 rounded-xl hover:bg-slate-800 transition-all focus:outline-none`}
                title={!sidebarExpanded ? 'Perfil' : undefined}
              >
                {user.photoURL ? (
                  <img src={user.photoURL} alt="avatar" className="w-8 h-8 rounded-full border border-slate-600 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-white text-sm font-bold shrink-0">
                    {(userProfile.displayName || user.email || 'U')[0].toUpperCase()}
                  </div>
                )}
                <div className={`flex-1 flex items-center justify-between overflow-hidden transition-all duration-300 ${sidebarExpanded ? 'opacity-100' : 'opacity-0 w-0'}`}>
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
          </div>

          {/* Botão colapsar sidebar */}
          <div className="p-3 shrink-0 hidden xl:block">
            <button
              onClick={() => setSidebarExpanded(!sidebarExpanded)}
              className="flex w-full items-center justify-center p-2 text-slate-500 hover:text-white hover:bg-slate-800 transition-all rounded-xl"
              title={sidebarExpanded ? 'Recolher Menus' : 'Expandir Menus'}
            >
              <svg className={`w-5 h-5 transition-transform duration-300 ${sidebarExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main Content Wrapper — inclui conteúdo principal + sidebar direita */}
        <div className="flex-1 flex flex-row min-w-0 h-screen overflow-hidden relative">

          {/* Coluna central: mobile topbar + main + assistente */}
          <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
            {/* Mobile Top Bar */}
            <div className="xl:hidden relative h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMobileMenuOpen(true)}
                  className="p-2 -ml-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <Menu className="w-5 h-5" />
                </button>
                {/* Ícone do app — coloque logo.png em /public e troque por: <img src="/logo.png" className="w-7 h-7 object-contain" alt="logo" /> */}
                <div className="w-7 h-7 bg-amber-600 rounded flex items-center justify-center shrink-0">
                  <span className="font-black text-sm text-white">B</span>
                </div>
              </div>
              {/* Breadcrumb: página atual */}
              <span className="absolute left-1/2 -translate-x-1/2 text-white font-semibold text-sm pointer-events-none">
                {navItems.find(i => i.tab === activeTab)?.label || 'Início'}
              </span>
            </div>

            {/* Desktop: sem header — info-config-menu está na sidebar (sticky-bottom) */}

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
                <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>}>
                  <Dashboard
                    user={user}
                    userProfile={userProfile}
                    suppliers={suppliers}
                    purchaseOrders={purchaseOrders}
                    masterProducts={masterProducts}
                    notifications={notifications}
                    cart={cart}
                    supplierCatalogs={supplierCatalogs}
                    salesData={salesData}
                    forecast={forecast}
                    inventoryCount={inventoryCount}
                    categoryTree={categoryTree}
                    quoteStages={quoteStages}
                    appSettings={appSettings}
                    onNavigate={(tab) => setActiveTab(tab as typeof activeTab)}
                  />
                </Suspense>
              )}
              <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>}>
                {activeTab === 'uploads' && (
                  <UploadCenter
                    suppliers={suppliers}
                    globalPackRules={globalPackRules}
                    onBatchCompleted={handleBatchCompleted}
                    onCreateOrder={handleCreateOrderFromUpload}
                    onNavigateToOrders={() => setActiveTab('purchase_orders')}
                  />
                )}
                {activeTab === 'sales' && (
                  <SalesDashboard
                    setForecast={setForecast} salesData={salesData} setSalesData={setSalesData}
                    csvContent={salesCsvContent} setCsvContent={setSalesCsvContent}
                    salesConfig={salesConfig} setSalesConfig={setSalesConfig}
                    salesUrl={salesUrl} setSalesUrl={setSalesUrl}
                    masterProducts={masterProducts}
                    onFinalizeSale={handleFinalizeSale}
                    userId={uid ?? ''}
                    saleOrders={saleOrders}
                    onCommitStock={handleCommitStock}
                    onCancelOrder={handleCancelOrder}
                    activeSession={pdvSessions.find(s => s.status === 'open')}
                    onOpenSession={handleOpenSession}
                    onCloseSession={handleCloseSession}
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
                    hiddenProductIds={hiddenProductIdsSet}
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
                    supplierCatalogs={supplierCatalogs}
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
                        className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${catalogTab === 'master' ? 'bg-amber-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
                          }`}
                      >
                        📦 Catálogo Geral
                      </button>
                      <button
                        onClick={() => setCatalogTab('suppliers')}
                        className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${catalogTab === 'suppliers' ? 'bg-amber-600 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'
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
                          onAddMapping={addMapping}
                          onRemoveMapping={removeMapping}
                        />
                      )}
                    </div>
                  </div>
                )}
                {activeTab === 'inventory_count' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>}>
                    <InventoryCount
                      masterProducts={masterProducts}
                      userId={user.uid}
                      confirmedCount={inventoryCount}
                      onSaveCount={setInventoryCount}
                      categoryTree={Object.keys(categoryTree).length > 0 ? categoryTree : undefined}
                      countTimestamps={inventoryTimestamps}
                      onSaveTimestamps={handleSaveTimestamps}
                      onUpdateStock={handleUpdateProductStocks}
                    />
                  </Suspense>
                )}
                {activeTab === 'category_manager' && (
                  <Suspense fallback={<div className="flex items-center justify-center h-full text-slate-500 text-sm">Carregando...</div>}>
                    <CategoryManager
                      categoryTree={categoryTree}
                      masterProducts={masterProducts}
                      onSaveCategoryTree={setCategoryTree}
                      onUpdateMasterProducts={setMasterProducts}
                    />
                  </Suspense>
                )}
                {activeTab === 'database' && (
                  <ProductDatabase
                    masterProducts={masterProducts} setMasterProducts={setMasterProducts}
                    sheetUrl={dbSheetUrl} setSheetUrl={setDbSheetUrl}
                    categoryTree={categoryTree}
                    setIsDirty={setIsDirty}
                    userId={uid}
                    userDisplay={userProfile?.displayName || user?.displayName || user?.email || undefined}
                  />
                )}
                {activeTab === 'suppliers' && (
                  <SupplierManager
                    suppliers={suppliers} setSuppliers={setSuppliers}
                    supplierCatalogs={supplierCatalogs}
                    globalPackRules={globalPackRules}
                    onBatchCompleted={handleBatchCompleted}
                    uid={uid ?? ''}
                    onBatchDateChange={handleBatchDateChange}
                    productMappings={productMappings}
                    masterProducts={masterProducts}
                    onAddMapping={addMapping}
                    onRemoveMapping={removeMapping}
                    priceValidityConfig={priceValidityConfig}
                    setPriceValidityConfig={setPriceValidityConfig}
                  />
                )}
                {activeTab === 'quote_request' && (
                  <QuoteRequest
                    suppliers={suppliers}
                    catalogs={supplierCatalogs}
                    globalValidityDays={appSettings.priceValidityDays}
                    quoteStages={quoteStages}
                    onSaveStages={setQuoteStages}
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
                      onReapplyGlobalRules={handleReapplyGlobalPackRules}
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
            <Suspense fallback={null}>
              <BuyingAssistant suppliers={suppliers} cart={cart} setCart={setCart} salesData={salesData} />
            </Suspense>
          </div>{/* fim coluna central */}

          {/* Sidebar de Ações Global */}
          <RightActionSidebar />

        </div>{/* fim Main Content Wrapper */}
      </div>

      {/* Expanded Logs Modal */}
      {isExpandedLogsOpen && (
        <Suspense fallback={null}>
          <ExpandedLogs
            logs={appLogs}
            onClear={() => appLogger.clear()}
            onClose={() => setIsExpandedLogsOpen(false)}
          />
        </Suspense>
      )}
    </RightSidebarProvider>

  );
};

export default App;
