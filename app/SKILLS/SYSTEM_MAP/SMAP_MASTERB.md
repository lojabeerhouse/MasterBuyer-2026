# MasterBuyer 2026 — System Map

Este documento serve como mapa de referência para a localização de todos os componentes de interface, serviços de dados e chaves do banco Firestore.

---

## Componentes (`/components`)

### Notificações e Logs (`notifications_and_logs/`)
| Arquivo | Responsabilidade |
|---|---|
| `NotificationCenter.tsx` | Bell + dropdown de alertas pendentes |
| `ExpandedNotifications.tsx` | Painel full-screen de resolução em massa |
| `LogViewer.tsx` | Terminal dropdown de logs em tempo real |
| `ExpandedLogs.tsx` | Painel expandido com filtros e estatísticas de log |

### Estoque e Categorias
| Arquivo | Responsabilidade |
|---|---|
| `inventory_count/` | Módulos de contagem física de estoque |
| `category_manager/` | Mapeamento e árvore de categorias |
| `shared/` | Componentes reutilizáveis (ex: ExitUnsavedModal) |

### Vendas (sales/)
| Arquivo | Responsabilidade |
|---|---|
| `SalesDashboard.tsx` | Painel geral e abas do módulo de Vendas |
| `POS.tsx` | Módulo Frente de Caixa (PDV) rápido |
| `SalesOrders.tsx` | Gestão de pedidos de vendas B2B (placeholder) |
| `SalesAnalyzer.tsx` | Importação, relatórios e simulação de demanda |

### Compras (compras/)
| Arquivo | Responsabilidade |
|---|---|
| `SupplierManager.tsx` | Gestão de fornecedores |
| `SupplierCatalogView.tsx` | Visualização de catálogo do fornecedor |
| `QuoteComparator.tsx` | Comparação de cotações |
| `QuoteRequest.tsx` | Solicitação de cotação |
| `BuyingAssistant.tsx` | Assistente de compras com IA |
| `OrderManager.tsx` | Gestão de pedidos de compra |

### Módulos Principais
| Arquivo | Responsabilidade |
|---|---|
| `Dashboard.tsx` | Painel geral do ERP |
| `ProductDatabase.tsx` | Base de produtos |
| `ProductCatalog.tsx` | Catálogo de produtos por fornecedor |
| `QuoteActionsPanel.tsx` | Ações sobre cotação ativa |
| `OfferFlyer.tsx` | Gerador de flyer de ofertas |
| `AppSettings.tsx` | Configurações do app |
| `UserProfile.tsx` | Perfil do usuário |
| `UploadCenter.tsx` | Central de importação de arquivos |
| `UploadItem.tsx` | Item individual de upload |
| `ReviewImportModal.tsx` | Modal de revisão pré-importação |

## Services (`/services`)

### Notificações e Logs (`notifications_and_logs/`)
| Arquivo | Responsabilidade |
|---|---|
| `loggerService.ts` | Log central com buffer em memória e persistência Firestore |

### Módulos Dedicados
| Arquivo | Responsabilidade |
|---|---|
| `inventory_count/` | Persistência e cálculo de contagem física |
| `category_manager/` | Lógica da árvore de categorias |
| `compras/` | Serviços e utilitários de compras e cotações |

### Utilitários (compras/)
| Arquivo | Responsabilidade |
|---|---|
| `historyService.ts` | Histórico de cotações e duplicidades |
| `supplierCatalogService.ts` | Normalização de catálogos de fornecedores |
| `parseNFe.ts` | Parser de XML de NF-e |
| `parseQuoteLocal.ts` | Parser de arquivos locais de cotação |

### Utilitários Gerais
| Arquivo | Responsabilidade |
|---|---|
| `firebaseService.ts` | Integração Firestore (carregar/salvar dados) |
| `geminiService.ts` | Chamadas ao Gemini |

## Firestore Keys (`users/{userId}/data/{key}`)

| Key | Conteúdo |
|---|---|
| `suppliers` | Fornecedores parceiros |
| `salesData` | Histórico de vendas |
| `salesConfig` | Configurações do dashboard de vendas |
| `forecast` | Previsão de demanda consolidada |
| `cart` | Carrinho de compras planejadas |
| `mappings` | Mapeamentos catálogo fornecedor → produto master |
| `ignoredMappings` | Associações ignoradas pelo operador |
| `masterProducts` | Cadastro de produtos master |
| `dbSheetUrl` | URL das planilhas integradas |
| `salesUrl` | URL da fonte de dados de vendas |
| `considerStock` | Boolean — considerar estoque no assistente |
| `globalPackRules` | Regras globais de conversão caixa/unidade |
| `globalNamingRules` | Regras globais de nomenclatura |
| `error_logs` | Logs de erro persistidos em produção |