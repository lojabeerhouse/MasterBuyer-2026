
# MasterBuyer — Agent Directives

## A. PROTOCOLO DE EXECUÇÃO (obrigatório em toda task)

Antes de qualquer alteração de código, responda com:

1. **Entendi:** 1 frase do que o usuário quer.
2. **Vou mexer em:** lista de arquivos + o que muda em cada um.
3. **Riscos:** regressões possíveis ou conflitos com código existente.
4. **Skills consultadas:** quais skills você leu para esta task (ver seção D).
5. **Aguardando aprovação.**

Só execute após "ok", "pode", "vai" ou equivalente explícito do usuário.

### Gatilhos de aviso adicional

Adicione ao final do plano, antes do "Aguardando aprovação":

- **Se vai modificar >3 arquivos** OU **tocar `types.ts` ou `App.tsx`** (mesmo que 1 arquivo só):
  > ⚠️ Vai mexer em N arquivos. Considere fazer commit antes de aprovar.

- **Se a task é reestruturação de componente existente** (não criação nem ajuste pontual):
  > ⚠️ Reestruturação altera bastante código. Salvou o progresso atual?

### Princípios

- Bug apontado = resolver causa raiz, sem band-aid.
- Solução simples e nativa do React antes de abstrair.
- Não assuma que funciona — valide impactos em dados legados.

## B. REGRAS IMUTÁVEIS (quebrar = quebrar produção)

- **`types.ts`:** nunca renomeie ou delete campos. Novos campos sempre opcionais (`?`).
  Motivo: dados em produção em `users/{userId}/data/{key}`.
  Exceção: só com pedido explícito do usuário para migração planejada de campo.

- **`firebaseConfig.ts`:** intocável.

- **Estado novo em `App.tsx`** exige os 3 passos:
  1. Inicialização vazia no `useState`.
  2. Sync dentro de `loadAllData` (carregar do Firestore ao logar).
  3. `useEffect` com `saveUserData` (persistir ao mudar).

- **Props existentes em componentes:** só adicionar, nunca remover sem pedido explícito.

- **Firestore (criar/alterar/remover campo ou coleção):** 
  ler `app/DATA_MODEL/DATA_MODEL.skill.md` antes de executar.

## Mover arquivos
Sempre usar `git mv`. Nunca deletar e recriar para "mover" um arquivo.
Após mover, atualizar imports com `sed` em massa. Nunca editar arquivos um a um.
O `sed` deve usar o path mais específico possível para evitar substituições indesejadas.
Sempre rodar `sed` sem `-i` primeiro para simular. Só aplicar com `-i` após aprovação.

## C. STACK & ESTILO

- React 18 + TS + Vite + Tailwind + Firebase (Auth/Firestore) + Gemini API.
- Ícones: só `lucide-react`.
- Estilo: só classes Tailwind (sem CSS inline ou custom).
- Componentes novos: em `/components`, TS tipado, props com `interface`.

### Tokens de cor (resumo — detalhes em FORCATO-ERP-Design)

| Uso | Classe |
|---|---|
| Fundo | `bg-slate-950` |
| Cards/Nav | `bg-slate-900` |
| Bordas | `border-slate-800` |
| Texto principal | `text-slate-200` |
| Texto secundário | `text-slate-400` |
| Accent geral | `amber-600` |
| Accent ofertas | `red-600` |

## D. SKILLS — QUANDO LER

### Design e padrões de componente

Qualquer task que envolva UI, layout, ou componente novo/refatorado:
**leia `app/SKILLS/FORCATO-ERP-Design/SKILL.md`** — ele direciona para as sub-skills específicas (listas, filtros, modais, formulários, etc.) conforme a task.

Não invente padrões visuais ou de interação sem consultar essa skill primeiro.

### Modelo de dados Firestore

### Modelo de dados Firestore
Ao tocar no Firestore, siga `app/DATA_MODEL/DATA_MODEL.skill.md`.

### Banco de ideias

Quando o usuário citar uma ideia para anotar/trabalhar depois:
**siga `app/SKILLS/IDEIAS/IDEIA_PLANEJAMENTO.skill.md`**.
Não execute a ideia — apenas registre com observações suas dentro do planejamento dela.

### Assinatura de skills lidas
Ao final de toda resposta que envolveu leitura de skill, adicione as 
assinaturas das skills consultadas (declaradas no topo de cada skill, 
formato `emoji+sigla.`).

Exemplo: `📋list. 🐱fd. 🔍sear.` indica que foram lidas Lista, 
Forcato-Design e Search nesta task.

## E. SYSTEM MAP

Caso precise localizar componentes, services ou Firestore keys, 
consulte `app/SKILLS/SYSTEM_MAP/SMAP_MASTERB.md`.

Após criar, renomear ou deletar arquivo em `/components` ou `/services`, 
**atualize `SMAP_MASTERB.md` no mesmo turno da modificação**.