# MasterBuyer 2026 — Instruções para Modificações

## Visão Geral do Projeto
App pessoal de compras profissionais para a BeerHouse. Desenvolvido em React + TypeScript + Vite.
Usa Firebase (Firestore + Authentication) para persistência de dados e login com Google.

## Stack
- React 18 + TypeScript
- Vite
- Tailwind CSS
- Firebase (Firestore + Auth)
- Lucide React (ícones)
- Gemini API (geminiService.ts)

## Estrutura de Arquivos
```
/components         → Abas do app (SalesAnalyzer, QuoteComparator, etc.)
/services
  firebaseService.ts  → Funções saveUserData / loadUserData
  geminiService.ts    → Integração com Gemini AI
App.tsx             → Componente principal, gerencia todo o estado
firebaseConfig.ts   → Configuração Firebase (NÃO MODIFICAR)
types.ts            → Interfaces TypeScript (VER REGRAS ABAIXO)
```

## Abas do App
1. **Fornecedores** (`SupplierManager`) — cadastro de fornecedores e cotações
2. **Produtos** (`ProductDatabase`) — catálogo master de produtos
3. **Vendas** (`SalesAnalyzer`) — análise de vendas e forecast
4. **Catálogo** (`ProductCatalog`) — visualização de produtos por fornecedor
5. **Comparador** (`QuoteComparator`) — comparação de preços entre fornecedores
6. **Pedidos** (`OrderManager`) — carrinho e geração de pedidos
7. **Ofertas** (`OfferFlyer`) — criação de encartes de ofertas

## Persistência de Dados (Firebase)
Todos os dados são salvos no Firestore sob o path:
`users/{userId}/data/{key}`

As chaves salvas são:
- `suppliers` — fornecedores e suas cotações
- `salesData` — histórico de vendas
- `salesConfig` — configurações de forecast
- `forecast` — previsão de demanda
- `cart` — carrinho de compras
- `mappings` — mapeamentos de produtos
- `ignoredMappings` — mapeamentos ignorados
- `masterProducts` — catálogo master
- `dbSheetUrl` — URL da planilha de produtos
- `salesUrl` — URL da planilha de vendas
- `considerStock` — flag de considerar estoque
- `globalPackRules` — regras globais de embalagem
- `globalNamingRules` — regras globais de nomenclatura

---

## Palavras-chave de Modo

### PLANEJAMENTO
Quando o prompt iniciar com "PLANEJAMENTO":
- NÃO execute nenhuma alteração no código
- Antes de responder, escreva um breve resumo do que entendeu que o usuário quer
- Retorne um plano em etapas pontuais e consecutivas contendo:
  - Quais arquivos serão criados ou modificados
  - Quais cuidados tomar (regressões, breaking changes, dependências)
  - O que haverá de novo no app
  - O que será removido ou alterado
  - Se há chance de quebrar alguma coisa ou um conflito negativo com outra função já existente
- Ao final, adicione uma seção "💬 Recomendação do Agente" com sua opinião honesta: pontos positivos, riscos, e motivação para cada um

### PESQUISA
Quando a palavra "PESQUISA" aparecer nos primeiros 40 caracteres do prompt:
- Não execute código
- Pesquise e sintetize o tema citado no prompt
- Foque em como o tema se aplica ao contexto do MasterBuyer 2026
- Retorne um resumo objetivo com pontos práticos e relevantes para o projeto
- A pesquisa deve ser um adicional ao prompt, não uma substituição

## ⚠️ REGRAS CRÍTICAS — LEIA ANTES DE QUALQUER MODIFICAÇÃO

### 1. NUNCA renomeie campos existentes em types.ts
Os dados já estão salvos no Firebase com os nomes atuais. Renomear quebra tudo.

```ts
// ✅ CORRETO — adiciona campo novo opcional
interface Supplier {
  id: string;
  name: string;
  phone?: string; // novo campo, sempre com "?"
}

// ❌ ERRADO — renomear campo existente apaga dados salvos
interface Supplier {
  id: string;
  supplierName: string; // era "name" — NUNCA FAÇA ISSO
}
```

### 2. Novos campos em interfaces SEMPRE opcionais (`?`)
Dados antigos no Firebase não têm o novo campo. Se não for opcional, o TypeScript vai reclamar e o app pode quebrar ao carregar dados antigos.

```ts
// ✅ CORRETO
interface Supplier {
  email?: string; // opcional
}

// ❌ ERRADO
interface Supplier {
  email: string; // obrigatório — quebra dados antigos
}
```

### 3. NUNCA delete campos de interfaces existentes
Mesmo que não use mais no frontend, manter o campo evita erros ao carregar dados antigos do Firebase.

### 4. Ao adicionar novo estado no App.tsx, sempre:
- Inicializar com valor vazio/padrão (não depender do Firebase para o estado inicial)
- Adicionar o `useEffect` de persistência correspondente
- Adicionar o `loadUserData` dentro da função `loadAllData`

```ts
// Exemplo de como adicionar novo estado corretamente:
const [novoEstado, setNovoEstado] = useState<Tipo[]>([]);

// Em loadAllData:
const savedNovo = await loadUserData<Tipo[]>(uid, 'novoEstado', []);
setNovoEstado(savedNovo);

// useEffect de persistência:
useEffect(() => { if (uid) saveUserData(uid, 'novoEstado', novoEstado); }, [novoEstado, uid]);
```

### 5. NUNCA altere firebaseConfig.ts
As credenciais do Firebase estão corretas. Não modifique esse arquivo.

### 6. Ao modificar componentes, preserve as props existentes
Os componentes recebem props do App.tsx. Nunca remova props existentes — apenas adicione novas se necessário.

---

## Padrões de Código

### Ícones
Usar apenas `lucide-react`. Não instalar outras bibliotecas de ícones.

### Estilização
Usar apenas classes Tailwind CSS. Não adicionar CSS customizado inline desnecessário.

### Cores do tema
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

---

## Antes de Qualquer Modificação Grande
1. Confirmar que o usuário fez commit no GitHub
2. Verificar se a mudança afeta `types.ts` — se sim, seguir as regras acima
3. Verificar se a mudança afeta o estado do `App.tsx` — se sim, atualizar `loadAllData` e os `useEffect`s de persistência
4. Preferir adicionar funcionalidades novas a modificar as existentes
