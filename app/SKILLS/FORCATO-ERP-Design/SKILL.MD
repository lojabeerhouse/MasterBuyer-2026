---
name: Forcato-ERP-Design
description: Design operational-grade ERP, dashboard, and enterprise management interfaces with extreme attention to density, responsiveness, alignment, workflow efficiency, and anti-fragile UX patterns. Use this skill when building admin panels, industrial systems, CRUD interfaces, management software, inventory systems, production systems, finance modules, operational dashboards, or any data-heavy interface where usability and spatial optimization are critical.
---

This skill focuses on production-grade operational interfaces for ERP systems, industrial software, management platforms, and high-density business applications.

The objective is NOT aesthetic-first design.
The objective is operational efficiency, clarity, scalability, and frictionless workflows under real-world pressure.

Interfaces must feel:
- Industrial
- Precise
- Fast
- Dense
- Stable
- Predictable
- Operationally intelligent

Avoid generic SaaS aesthetics that prioritize whitespace over productivity.

Every pixel must justify its existence.

## Core Philosophy

Operational software is not marketing.
Users are not browsing — they are working.

The interface should optimize:
- Speed of reading
- Speed of interaction
- Data visibility
- Cognitive scanning
- Multi-hour usage comfort
- Workflow continuity
- Error prevention
- Information hierarchy

Design for operators, analysts, production staff, finance teams, logistics teams, and power users — not casual consumers.

## Industrial & ERP Design Patterns

When designing operational modules (ERPs, Dashboards, Master Data Management):

- **Horizontal Scrolling is an Anti-Pattern**: The user's screen is a hard boundary. Horizontal scrolling reads as poor optimization. Prioritize responsiveness by shrinking elements proportionally, truncating non-essential text (`min-w-0`), or changing the axis to vertical (`flex-col`). Avoid fixed minimum widths that force screen overflow.

- **Data-Density over Whitespace**: Vertical space is precious. Use dense horizontal designs (e.g., condensed data tables or rich lists). Allocate surgical, tight widths for predictable fields (dates, currencies, quantities — e.g., ~40-80px), reserving the flexible space (`flex-1`) for critical unpredictable fields like Names, preventing harsh truncation.

- **Pixel-Perfect Harmonic Alignment**: Visual hierarchy fails if margins don't align. A container's content should start on the exact same X-axis as its header. Avoid "double padding" (e.g., a parent with `p-6` and a child with `px-4`) that pushes content unnecessarily to the right. Ensure an impeccable vertical line on the left edge.

- **Operational Priority over Visual Novelty**: Animations, oversized cards, excessive blur, floating panels, oversized border radii, and excessive empty spacing reduce operational efficiency. Use restraint.

- **Dense Interfaces Must Still Breathe**: Compact does not mean chaotic. Use rhythm, grouping, typography contrast, tonal hierarchy, and alignment precision to preserve readability.

- **State Visibility is Critical**: Errors, warnings, synchronization states, loading states, locked records, and operational statuses must be instantly recognizable without visual noise.

- **Tables are Weapons**: Data tables are not secondary components. Treat them as core operational surfaces. Support scanning, sorting, filtering, sticky headers, sticky actions, fast inline actions, and keyboard-friendly interactions whenever possible.

- **Design for Continuous Usage**: These interfaces may remain open for 8-12 hours daily. Avoid visual fatigue, high-contrast abuse, excessive saturation, and unnecessary motion.

- **Responsiveness Means Reflow, Not Shrinkage**: Mobile responsiveness should preserve usability and workflow logic, not simply compress desktop layouts into unusable miniature grids.

## Pagination Pattern

All paginated lists in the app MUST follow this canonical structure. No exceptions, no variations per module. The component is shared — never reimplemented per page.

### Layout — Single Horizontal Bar

A pagination control is one bar with three semantic zones, aligned on a single baseline:

[ Showing X–Y of Z items ]    [ ‹ Prev  1  2  3 … 25 26  Next › ]    [ per page: 50 ▾ ]
LEFT (context)                    CENTER (navigation)              RIGHT (density)

- **Left zone — Context**: `Showing {start}–{end} of {total} items`. Always visible when total > pageSize. Never omit; the user MUST know where they are in the dataset.
- **Center zone — Navigation**: Page buttons + Prev/Next. Center-aligned within the bar.
- **Right zone — Density**: Items-per-page selector. Options: 50 / 100 / 200. Default 50. Only render when total > 50.

### Navigation Rules

- **Prev and Next are buttons, both with icon + label**, identical styling. Never one as plain text and the other as a styled button. Symmetry is mandatory.
- **Disabled state on edges**: Prev disabled on page 1, Next disabled on last page. Use `opacity: 0.35` + `pointer-events: none`. Never hide — buttons must stay in place to preserve spatial memory.
- **Page button window**: Show at most first page + 3 central pages + last page, separated by ellipsis (`…`). Example with 26 pages on page 1: `1 2 3 … 25 26`. Example on page 13: `1 … 12 13 14 … 26`. Ellipsis without anchor pages is forbidden (`1 2 26` is wrong — `1 2 … 26` is correct).
- **Active page**: Use the system's primary accent color only on the currently active page button. All other page buttons stay neutral (transparent background, border-tertiary).

### Density & Spacing

- Bar height: 40px. Vertical padding 8px. Horizontal padding aligns to the parent container's content X-axis (no double padding — see Pixel-Perfect Harmonic Alignment).
- Button size: 32px × 32px minimum (square for numbers, auto-width for Prev/Next with label).
- Gap between page buttons: 6px. Gap between zones: `space-between` via flex.
- Font: 13px for buttons, 12px for context text and density selector.

### Responsive Behavior

Horizontal scrolling on the pagination bar is forbidden (per Horizontal Scrolling Anti-Pattern). On narrow viewports:

1. First, drop the label from Prev/Next, keep only the chevron icon.
2. Second, shrink the page window to first + active + last (`1 … 13 … 26`).
3. Last resort, stack zones vertically: context on top, navigation center, density bottom — never let any zone overflow horizontally.

### Forbidden Patterns

- ❌ Prev/Next placed at opposite extremes of the bar, isolated from the page numbers
- ❌ Mixing button styles between Prev and Next
- ❌ Showing page numbers without context (no "X of Y items" text)
- ❌ Hiding Prev/Next on edges instead of disabling them
- ❌ Ellipsis without anchor (e.g., `1 2 26`)
- ❌ Hard-coded page size with no user control when dataset exceeds 50 items
- ❌ Decorative colors on inactive page buttons

### Apply to

Every list in the app

## Checkbox Selection Pattern

Operational lists with multi-select must follow this structure:

- **Row layout**: checkbox (left, `w-3.5 h-3.5`, `shrink-0`) → content (`flex-1 min-w-0`) → hover-only inline action (`shrink-0`, `opacity-0 group-hover:opacity-100`). Checkbox is always the leftmost element.
- **Shift+click range selection is mandatory** on any multi-select list. Implement via a shared hook (`useCheckboxSelection`) that tracks `lastClickedId` in a ref and computes ranges from the flat visible list in DOM order. Range is always additive — shift+click never deselects.
- **"Select all page"** header checkbox selects only the current page slice — never all records. Disabled when section is collapsed.
- **Bulk action bar** appears only when `selectedIds.size > 0`, positioned below search, above list. Always shows count so user sees selection even when items are off-screen. Pre-fill target when context is unambiguous (e.g., current leaf node).
- **3-stage visual hierarchy** (when applicable): Stage 1 active (`bg-emerald-900/15`, `text-emerald-400`) → Stage 2 needs-action (`bg-slate-800/60`, `text-slate-300`) → Stage 3 informational (`bg-slate-900/40`, `text-slate-500`, collapsed). Never invert this order.
- **Reuse `useCheckboxSelection` hook** (located at `app/components/shared/useCheckboxSelection.ts`) for all lists — do not inline selection logic per component.

## Collapsible Group Pattern

Grouped lists (multiple named sections within a single scrollable container) must follow this structure:

- **All named groups are collapsible** — no group may have a static, non-interactive header. The entire header row is the toggle target (single `<button>` wrapping chevron + label + count).
- **Chevron anatomy**: `ChevronDown` (`w-3.5 h-3.5`), rotated `-rotate-90` when collapsed. Always leftmost element inside the header button. Rotation uses `transition-transform`.
- **Header layout**: `[chevron] [label] [count] → flex-1 button` + optional right-side action (`shrink-0`, visible only when section is expanded). Never put the action inside the toggle button.
- **Default expansion rules**: Primary group (the contextually active section — e.g., "Nesta categoria") starts **expanded**. Secondary and informational groups start **collapsed**.
- **State reset on context switch**: When the user navigates to a different record or context, all groups reset to their default expansion state (primary → expanded, others → collapsed).
- **Collapsed groups are excluded from `visibleList`**: Shift+click range selection (via `useCheckboxSelection`) only spans visible DOM rows. Items in a collapsed section are not selectable and not part of any range.
- **"Select all" checkbox on header**: Disabled when section is collapsed (`disabled={!showSection || slice.length === 0}`). Enabled only for the current page slice, never all records.
- **Empty state inside group**: Render only when the section is expanded. A collapsed group shows nothing below its header.

## Search Logic / Campos de busca e pesquisa multi-termo - Flexible implementation

Search and filter inputs in operational lists must follow this multi-term flexible implementation:

- **Tokenized Search**: The search term must be split into independent tokens (separated by whitespace). A match is successful only if **all tokens** are found within the target fields (Name, SKU, EAN, etc.), regardless of their order or position.
- **Normalization and Case-Insensitivity**: All strings must be converted to lowercase and normalized to remove accents before comparison (e.g., "Cerveja" matches "cerveja").
- **Canonical Implementation**:
  ```typescript
  const tokens = searchTerm.toLowerCase().trim().split(/\s+/).filter(t => t);
  const isMatch = tokens.every(token => 
      normalizedName.includes(token) || normalizedSku.includes(token)
  );
  ```
- **UX Requirements**: Search interaction must reset pagination to page 1. When no results are found, show a clear "No results found" message that preserves the layout density.

### Search Debounce (Performance & UX)

To prevent UI lag and unnecessary re-renders in large datasets (e.g., Inventory, Product Database), all search inputs MUST implement a debounce pattern:

- **Timing**: Use exactly **400ms** (`400`) as the default debounce interval. This is the sweet spot between perceived responsiveness and system performance.
- **Implementation**: Use a local state for the input value (`searchTerm`) and a separate state for the effective filter (`debouncedSearch`).
- **Canonical Code Pattern**:
  ```tsx
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);
  ```
- **Filter Hook**: The heavy filtering logic (`useMemo`) must depend on `debouncedSearch`, not `searchTerm`.

## Implementation Standards

Generated code must be:
- Production-grade
- Componentized
- Scalable
- Accessible
- Maintainable
- Realistically implementable

Avoid fake/demo aesthetics that collapse under real operational data.

Design systems should feel internally coherent across:
- Forms
- Tables
- Filters
- Modals
- Sidebars
- Command bars
- KPIs
- Status indicators
- Navigation
- CRUD workflows

The interface should feel like software built by people who understand operations, not just UI trends.

## Unsaved Changes Guard Pattern (Exit_Unsaved_Modal)

Operational safety is paramount. Any interface that allows destructive or non-auto-saved changes MUST protect the user from accidental data loss:

- **State Awareness**: The app must track a `isDirty` state (boolean) that becomes true as soon as the first edit is made.
- **Navigation Interception**: All navigation targets (sidebar, mobile menu, breadcrumbs) must be intercepted. If `isDirty` is true, the navigation is blocked and the `ExitUnsavedModal` is displayed.
- **Canonical Modal Structure**:
  - **Header**: High-visibility warning icon (`AlertTriangle` in Red/Amber), bold title in uppercase, and a concise subtitle.
  - **Body**: Clear explanation of what will be lost. Use bold text for critical words like **perdidas** or **descartadas**.
  - **Actions (Footer)**:
    - `Primary`: [Salvar e Sair] (if applicable) - Highlighted with the system's primary accent.
    - `Secondary`: [Sair sem Salvar] - Clearly labeled, often with a `LogOut` or `Trash` icon. High-contrast vs the primary action.
    - `Cancel`: [Voltar e Editar] - Neutral, standard button style.
- **Draft Logic**: Implement a "Draft" vs "Master" state pattern. Edits happen in the draft. Saving applies draft to master. Canceling clears draft. This ensures "Exit without Saving" is physically impossible to fail.
- **Browser Protection**: In addition to app-level navigation, use the `beforeunload` browser event for power users who might close the tab or reload.

### Apply to:
Any complex form, inline table editing, or multi-step configuration wizard.

## Timezone / Timestamps Locais

Sempre que gerar uma data representando o **momento exato em que um evento ocorreu** (timestamp de contagem, data de exportação, nome de arquivo, comparação de "hoje"), usar os métodos locais do objeto `Date` em vez de `toISOString()`.

**Motivo:** `toISOString()` retorna sempre UTC. No fuso de Brasília (UTC-3), após as 21:00 o UTC já está no dia seguinte — datas e comparações aparecem erradas para o usuário.

**Regra:**
- **Armazenamento** (Firestore, localStorage): manter `new Date().toISOString()` — ISO UTC é o formato canônico para persistência.
- **Extração de data local** (comparação de "hoje", nome de arquivo, filtro por dia): usar a helper abaixo.

**Helper canônico — usar em todos os componentes que extraem parte de data:**
```typescript
const localDateStr = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
```

Exemplos de uso correto:
```typescript
// ✅ data local de hoje
const today = localDateStr(new Date());

// ✅ comparar se timestamp pertence a hoje
const isToday = localDateStr(new Date(isoTimestamp)) === localDateStr(new Date());

// ✅ nome de arquivo exportado
const dateStr = localDateStr(new Date()); // "2026-05-15", nunca "2026-05-16"
```

Exemplos do que **não** fazer:
```typescript
// ❌ extrai data UTC — errado após 21h BRT
new Date().toISOString().split('T')[0]

// ❌ compara UTC do timestamp com UTC do momento — errado para datas locais
timestamp.split('T')[0] === new Date().toISOString().split('T')[0]
```