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