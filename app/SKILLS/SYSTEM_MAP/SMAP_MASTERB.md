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

### Estoque (`inventory_count/`)
| Arquivo | Responsabilidade |
|---|---|
| `InventoryCount.tsx` | Orquestrador da contagem física de estoque |
| `InventoryCountItem.tsx` | Item individual na lista de contagem |

### Categorias (`category_manager/`)
| Arquivo | Responsabilidade |
|---|---|
| `CategoryManager.tsx` | Tela principal de gerenciamento de categorias |
| `CategoryTreeNode.tsx` | Nó individual da árvore de categorias |
| `CategoryProductList.tsx` | Lista de produtos dentro de uma categoria |

### Vendas (`vendas/`)
| Arquivo | Responsabilidade |
|---|---|
| `SalesDashboard.tsx` | Painel geral e abas do módulo de Vendas |
| `POS.tsx` | Módulo Frente de Caixa (PDV) rápido |
| `SalesOrders.tsx` | Gestão de pedidos de vendas B2B |
| `SalesAnalyzer.tsx` | Importação, relatórios e simulação de demanda |

### Compras (`compras/`)
| Arquivo | Responsabilidade |
|---|---|
| `OrderManager.tsx` | Gestão de pedidos de compra (kanban + importação de NF) |
| `SupplierManager.tsx` | Orquestrador de fornecedores (~540 linhas, usa sub-componentes abaixo) |
| `QuoteCard.tsx` | Card de cotação no histórico (extraído do SupplierManager) |
| `SupplierEditModal.tsx` | Modal de edição de fornecedor (nome, logística, horários, template) |
| `BlacklistModal.tsx` | Modal da lista negra de itens do fornecedor |
| `PackRulesModal.tsx` | Modal de exceções de embalagem por fornecedor |
| `RawContentModal.tsx` | Modal de visualização de conteúdo bruto de cotação |
| `SupplierCatalogView.tsx` | Visualização de catálogo do fornecedor |
| `QuoteComparator.tsx` | Comparação de cotações multi-fornecedor |
| `QuoteRequest.tsx` | Solicitação e envio de cotação |
| `BuyingAssistant.tsx` | Assistente de compras com IA |

### Shared (`shared/`)
| Arquivo | Responsabilidade |
|---|---|
| `ConfirmDialog.tsx` | Modal de confirmação reutilizável (danger/warning/info) |
| `ExitUnsavedModal.tsx` | Modal de alerta ao sair com alterações não salvas |
| `Pagination.tsx` | Paginação genérica de listas |
| `useCheckboxSelection.ts` | Hook de seleção múltipla por checkbox |

### Módulos Principais (raiz `/components`)
| Arquivo | Responsabilidade |
|---|---|
| `Dashboard.tsx` | Painel geral do ERP |
| `ProductDatabase.tsx` | Base de produtos |
| `ProductCatalog.tsx` | Catálogo de produtos por fornecedor |
| `EditOrderModal.tsx` | Modal de conferência de carga / visualização de pedido completo |
| `QuoteActionsPanel.tsx` | Ações sobre cotação ativa |
| `QuoteDetailModal.tsx` | Modal de detalhe de cotação |
| `LinkProductModal.tsx` | Modal de vinculação de item de catálogo a produto master |
| `ReviewImportModal.tsx` | Modal de revisão pré-importação |
| `RightActionSidebar.tsx` | Sidebar de ações contextuais direita |
| `OfferFlyer.tsx` | Gerador de flyer de ofertas |
| `Schedule.tsx` | Cronograma / agenda de pedidos |
| `UploadCenter.tsx` | Central de importação de arquivos |
| `UploadItem.tsx` | Item individual de upload |
| `AppSettings.tsx` | Configurações do app |
| `UserProfile.tsx` | Perfil do usuário |

---

## Services (`/services`)

### Compras (`compras/`)
| Arquivo | Responsabilidade |
|---|---|
| `historyService.ts` | Histórico de cotações e detecção de duplicidades |
| `supplierCatalogService.ts` | Normalização de catálogos de fornecedores |
| `parseNFe.ts` | Parser de XML de NF-e (extração sem IA) |
| `parseQuoteLocal.ts` | Parser de arquivos locais de cotação |
| `packRulesService.ts` | **Fonte única** de regras de lote: `DEFAULT_GLOBAL_PACK_RULES`, `applyRule`, `applyRulesToQuotes`, `filterBlacklisted`, `recalculateItem` |

### Notificações e Logs (`notifications_and_logs/`)
| Arquivo | Responsabilidade |
|---|---|
| `loggerService.ts` | Log central com buffer em memória e persistência Firestore |

### Estoque (`inventory_count/`)
| Arquivo | Responsabilidade |
|---|---|
| `inventoryExportService.ts` | Exportação e relatórios de contagem física |

### Categorias (`category_manager/`)
| Arquivo | Responsabilidade |
|---|---|
| `categoryService.ts` | Lógica de persistência e árvore de categorias |

### Gerais
| Arquivo | Responsabilidade |
|---|---|
| `firebaseService.ts` | Integração Firestore (carregar/salvar dados de usuário) |
| `geminiService.ts` | Chamadas ao Gemini (parse PDF/imagem de cotações) |

---

## Hooks (`/hooks`)

| Arquivo | Responsabilidade |
|---|---|
| `useFileProcessor.ts` | Decide rota de parse (XML → parseNFe / PDF+img → Gemini), aplica packRules |
| `useUploadQueue.ts` | Gerencia fila de upload, drag-and-drop e processamento assíncrono sequencial de arquivos |

---

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
| `purchaseOrders` | Pedidos de compra (kanban) |
