## RELATÓRIO SOBRE PAGINAÇÃO
### SOLICITAÇÃO DO USUÁRIO:
localize onde mais temos paginação, e verifique se aplicar a pagination shared causaria algum problema, ou se conseguriamos já aplicar em todas. Logicamente reportando tudo antes de fazer modificação em código

### RESPOSTA DO AGENTE:

Relatório de Paginação — Estado Atual
Já usa o componente Pagination.tsx compartilhado
Componente	Seções	Tamanho padrão
CategoryProductList.tsx	Legado + Sem categoria	50 / pág
Paginação própria — candidatos à migração
Esses 4 componentes têm paginação funcional, mas implementada manualmente (estados locais + .slice() + UI própria). Todos podem ser migrados para o componente compartilhado.

Componente	Implementação atual	Tamanho	Compatível?	Ajuste necessário
ProductCatalog.tsx	ITEMS_PER_PAGE=20, botões Prev/Next custom, índice 1-based	500+ itens	✅ Sim	Apenas substituir a UI de paginação
InventoryCount.tsx	PAGE_SIZE=100, índice 0-based, botões + elipse custom	500+ itens	✅ Sim	Converter índice para 1-based
SupplierCatalogView.tsx	PAGE_SIZE=30 principal + ENTRIES_PER_PAGE=20 no modal de histórico, índice 0-based	100–1000+ itens	✅ Sim	Converter índice para 1-based nas duas seções
QuoteComparator.tsx	ITEMS_PER_PAGE=15, componente interno PaginatedTable sem UI navegável visível	100–500+ linhas	✅ Sim	Adicionar UI visível + substituir PaginatedTable
Ponto de atenção: O Pagination.tsx retorna null quando total <= pageSize. Os componentes existentes sempre renderizam a barra de paginação mesmo com poucos itens. Isso é na verdade um comportamento melhor (menos ruído visual), mas deve ser considerado.

Sem paginação — listas não limitadas
Componente	Lista afetada	Volume estimado	Impacto
ProductDatabase.tsx	Tabela de masterProducts (editável)	500–5000+	🔴 Crítico
OrderManager.tsx	Lista de pedidos filtrados	100–500+	🔴 Crítico
QuoteRequest.tsx	Grupos de produtos por categoria	100–300+	🟠 Alto
SupplierManager.tsx	Batches de cotações por fornecedor	50–200+	🟠 Alto
QuoteDetailModal.tsx	Itens de uma cotação individual	50–200+	🟠 Alto
NotificationCenter.tsx	Lista de notificações	10–100+	🟡 Médio
Intencionalmente limitados — não precisam de paginação
POS.tsx — .slice(0, 30) e .slice(0, 50), interface de atalhos, comportamento correto
Dashboard.tsx — .slice(0, 3) e .slice(0, 8), dashboard resumido por design
O que eu recomendo fazer agora
Migrar os 4 com paginação própria é seguro, zero risco funcional — apenas substitui a UI existente pelo componente canônico. A consistência visual aumenta muito (todos vão se comportar igual).

Os 6 sem paginação exigem mais trabalho (definir page size, estados, onde renderizar a barra) — especialmente ProductDatabase.tsx e QuoteRequest.tsx que têm tabelas complexas.

Pergunta: quer que eu comece pelos 4 candidatos à migração (troca direta), pelos críticos sem paginação, ou por uma combinação?