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

### Contatos (`contatos/`)
| Arquivo | Responsabilidade |
|---|---|
| `ContactsDashboard.tsx` | Orquestrador da aba Contatos com sub-abas Clientes/Colaboradores |
| `ContactList.tsx` | Lista paginada de contatos filtrada por role com busca debounced |
| `ContactFormModal.tsx` | Modal de criação/edição; guard: id='consumidor-final' não pode ser deletado nem ter nome alterado |
| `ContactAutocomplete.tsx` | Dropdown de autocomplete de clientes para o PDV; sempre mostra 'Consumidor Final' primeiro |

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
| `ConfirmActionDialog.tsx` | Dialog de ban/delete com checkbox "não perguntar de novo" (extraído do QuoteDetailModal) |
| `UnsavedChangesDialog.tsx` | Dialog de alterações não salvas ao fechar QuoteDetailModal |
| `QuoteSection.tsx` | Seção de categoria com color map estático e render prop `renderRow` |
| `ItemRow.tsx` | Linha de item de cotação (~288 linhas, extraído do QuoteDetailModal — renderItemRow) |
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
| `parseQuoteLocal.ts` | Parser de arquivos locais de cotação (texto/CSV); aceita `sourceOverride?: ParseSource` |
| `extractTextFromPdf.ts` | Extração de texto de PDF via pdfjs-dist (client-side); gate de confiança heurístico |
| `packRulesService.ts` | **Fonte única** de regras de lote: `DEFAULT_GLOBAL_PACK_RULES`, `applyRule`, `applyRulesToQuotes`, `filterBlacklisted`, `recalculateItem` |
| `itemCategorizationService.ts` | `getItemCategory(item, productMappings, masterProducts, seenNames): ItemCategory` — função pura, sem closure sobre estado |

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

### Contatos (`contatos/`)
| Arquivo | Responsabilidade |
|---|---|
| `contactService.ts` | Funções puras: `filterActiveCustomers`, `filterContactsByRole`, `searchContacts` (tokenized, sem Firestore) |

### Gerais
| Arquivo | Responsabilidade |
|---|---|
| `firebaseService.ts` | Integração Firestore. **Blob** (`loadUserData`/`saveUserData` + guards `hydrated`/`lastCount`). **Chunked** (`loadChunkedData`/`saveChunkedData`, usado por masterProducts). **Delta** (`loadAllSuppliers`/`upsertSuppliers`/`deleteSuppliers`, `loadAllPurchaseOrders`/`upsertPurchaseOrders`/`deletePurchaseOrders`, `loadAllSaleOrders`/`upsertSaleOrders`/`deleteSaleOrders`, `loadAllPdvSessions`/`upsertPdvSessions`, `loadAllStockMovements`/`appendStockMovements`, `loadAllContacts`/`upsertContacts`/`deleteContacts` — escrita por item, nunca dataset inteiro). `resetSessionGuards()` deve ser chamado no logout. |
| `geminiService.ts` | Chamadas ao Gemini (parse PDF/imagem de cotações) |

---

## Hooks (`/hooks`)

| Arquivo | Responsabilidade |
|---|---|
| `useFileProcessor.ts` | Decide rota de parse (XML → parseNFe / PDF → local first → fallback Gemini / outros → Gemini); aplica packRules; aceita `options.forceGemini` |
| `useUploadQueue.ts` | Gerencia fila de upload, drag-and-drop e processamento assíncrono sequencial de arquivos |

---

## Firestore — Coleções delta (1 doc por item)

> Padrão: `users/{uid}/{collection}/{itemId}` · Escrita via `writeBatch` com upsert/delete por id.
> Nunca escreve o array inteiro. Migração one-shot automática a partir do blob legado.

| Coleção | Conteúdo | API em firebaseService.ts |
|---|---|---|
| `users/{uid}/suppliers/{id}` | Fornecedores parceiros | `loadAllSuppliers` / `upsertSuppliers` / `deleteSuppliers` |
| `users/{uid}/purchaseOrders/{id}` | Pedidos de compra (kanban) | `loadAllPurchaseOrders` / `upsertPurchaseOrders` / `deletePurchaseOrders` |
| `users/{uid}/catalogs/{supplierId}` | Catálogo de cotações por fornecedor | `loadAllCatalogs` / `saveCatalog` (em `supplierCatalogService.ts`) |
| `users/{uid}/saleOrders/{id}` | Pedidos de venda (PDV/B2B) — status: pending→stock_committed→invoiced→cancelled | `loadAllSaleOrders` / `upsertSaleOrders` / `deleteSaleOrders` |
| `users/{uid}/pdvSessions/{id}` | Sessões de caixa do PDV | `loadAllPdvSessions` / `upsertPdvSessions` |
| `users/{uid}/stockMovements/{id}` | Movimentos de estoque imutáveis (append-only) — nunca deletar/editar | `loadAllStockMovements` / `appendStockMovements` |
| `users/{uid}/contacts/{id}` | Contatos (clientes e colaboradores). `id='consumidor-final'` é imutável e nunca deletado | `loadAllContacts` / `upsertContacts` / `deleteContacts` |

---

## Firestore — Blobs (`users/{uid}/data/{key}`)

> Padrão: `{ value: JSON.stringify(dado), updatedAt: number }`.
> Protegidos por guards `hydrated` + `lastCount` em `firebaseService.ts`.
> `suppliers` e `purchaseOrders` estão nesta tabela como **deprecated** (legado preservado para rollback).

| Key | Conteúdo | Status |
|---|---|---|
| `suppliers` | Fornecedores parceiros | **DEPRECATED** — migrado para coleção delta em 2026-05-28 |
| `purchaseOrders` | Pedidos de compra (kanban) | **DEPRECATED** — migrado para coleção delta em 2026-05-28 |
| `salesData` | Histórico de vendas | ativo |
| `salesConfig` | Configurações do dashboard de vendas | ativo |
| `forecast` | Previsão de demanda consolidada | ativo |
| `cart` | Carrinho de compras planejadas | ativo |
| `mappings` | Mapeamentos catálogo fornecedor → produto master | ativo |
| `ignoredMappings` | Associações ignoradas pelo operador | ativo |
| `masterProducts` | Cadastro de produtos master (chunked: `_meta` + `_0`,`_1`...) | ativo — candidato à migração delta futura |
| `dbSheetUrl` | URL das planilhas integradas | ativo |
| `salesUrl` | URL da fonte de dados de vendas | ativo |
| `considerStock` | Boolean — considerar estoque no assistente | ativo |
| `globalPackRules` | Regras globais de conversão caixa/unidade | ativo |
| `globalNamingRules` | Regras globais de nomenclatura | ativo |
| `error_logs` | Logs de erro persistidos em produção | ativo |
| `hiddenProducts` | Produtos ocultados no catálogo | ativo |
| `appSettings` | Configurações gerais do app | ativo |
| `userProfile` | Perfil do usuário (nome, empresa, endereços) | ativo |
| `quoteStages` | Etapas de pipeline de cotação | ativo |
| `inventoryCount` | Contagens de estoque pendentes (não confirmadas) | ativo |
| `inventoryTimestamps` | Timestamps de última contagem por produto | ativo |
| `categoryTree` | Árvore de categorias de produtos | ativo |
| `priceValidityConfig` | Configuração de validade de preços | ativo |
