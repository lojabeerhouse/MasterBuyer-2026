# MasterBuyer 2026 — Agent Directives

## 1. Workflow Orchestration
- **Plan First:** Para tarefas >3 passos ou que alterem `App.tsx`/Tipagens, entre em "Modo Planejamento" (detalhe arquivos, riscos de regressão e dependências).
- **Verification:** Nunca assuma que funciona. Valide impactos em dados legados.
- **Elegance vs Pragmatism:** Evite over-engineering. Soluções simples e nativas do React primeiro.
- **Autonomous Fix:** Se apontado um bug, resolva a causa raiz. Sem "band-aids".

## 2. Critical Constraints (Database & Types)
- **IMMUTABLE TYPES:** NUNCA renomeie ou delete campos em `types.ts`. Dados de produção no Firestore (path `users/{userId}/data/{key}`) quebrarão.
- **BACKWARD COMPATIBILITY:** Novos campos em interfaces devem SEMPRE ser opcionais (`?`).
- **STATE SYNC:** Novo estado no `App.tsx` OBRIGA: inicialização vazia -> sync no `loadAllData` -> `useEffect` com `saveUserData`.
- **LOCKED FILES:** `firebaseConfig.ts` é intocável.

## 3. Tech & Styling Context
- **Stack:** React 18, TS, Vite, Tailwind CSS, Firebase (Auth/Firestore), Gemini API.
- **UI Strict:** Apenas `lucide-react` para ícones. Apenas classes Tailwind (sem CSS inline).
- **Theme Tokens:** Fundo `bg-slate-950` | Cards `bg-slate-900` | Borders `border-slate-800` | Accent `amber-600` (Geral) e `red-600` (Ofertas) | Text `slate-200` & `slate-400`.

## 4. Contextual Triggers
- **[PLANEJAMENTO]:** Se o usuário solicitar um "PLANEJAMENTO"/"PLAN":
- PARE e NÃO execute nenhuma alteração no código
- Antes de responder, escreva:
  - Um breve resumo do que entendeu que o usuário quer
  - Um plano em etapas contendo:
    - Quais arquivos serão criados ou modificados
    - Quais cuidados tomar (regressões, breaking changes, dependências)
    - O que haverá de novo no app
    - O que será removido ou alterado
    - Se há chance de quebrar alguma coisa ou um conflito negativo com outra função já existente
- Ao final, adicione uma seção **Recomendação do Agente** com:
  - pontos positivos
  - riscos
  - motivação para cada um

## 5. System Map (No Discovery Needed)
- `/components`: SupplierManager, ProductDatabase, SalesAnalyzer, ProductCatalog, QuoteComparator, OrderManager, OfferFlyer.
- `/services`: firebaseService.ts, geminiService.ts.
- `Firestore Keys`: suppliers, salesData, salesConfig, forecast, cart, mappings, ignoredMappings, masterProducts, dbSheetUrl, salesUrl, considerStock, globalPackRules, globalNamingRules.

### EM CASO DE PLANEJAMENTO


### NUNCA altere firebaseConfig.ts
As credenciais do Firebase estão corretas. Não modifique esse arquivo.

### Preserve props existentes
Os componentes recebem props do App.tsx. Nunca remova props existentes — apenas adicione novas se necessário.

### Padrões de Código

### Ícones
Usar apenas `lucide-react`. Não instalar outras bibliotecas de ícones.

### Estilização
Usar apenas classes Tailwind CSS. Não adicionar CSS customizado inline desnecessário.

### Cores
- Fundo principal: `bg-slate-950`
- Cards/Nav: `bg-slate-900`
- Bordas: `border-slate-800`
- Destaque/Primária: `amber-600`
- Destaque Ofertas: `red-600`
- Texto principal: `text-slate-200`
- Texto secundário: `text-slate-400`

### Componentes novos
- Criar dentro de `/components`
- Usar TypeScript com tipagem completa
- Props sempre tipadas com interface

## Antes de Qualquer Modificação Grande
1. Confirmar que o usuário fez commit no GitHub
2. Verificar se a mudança afeta `types.ts` — se sim, seguir as regras acima
3. Verificar se a mudança afeta o estado do `App.tsx` — se sim, atualizar `loadAllData` e os `useEffect`s de persistência
4. Preferir adicionar funcionalidades novas a modificar as existentes
