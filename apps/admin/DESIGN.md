---
name: CACiC Event Manager Admin
description: A calm, compact operations workspace for trusted event staff.
colors:
  primary: "var(--mat-sys-primary)"
  on-primary: "var(--mat-sys-on-primary)"
  secondary-container: "var(--mat-sys-secondary-container)"
  on-secondary-container: "var(--mat-sys-on-secondary-container)"
  tertiary-container: "var(--mat-sys-tertiary-container)"
  on-tertiary-container: "var(--mat-sys-on-tertiary-container)"
  surface: "var(--mat-sys-surface)"
  surface-container: "var(--mat-sys-surface-container)"
  on-surface: "var(--mat-sys-on-surface)"
  on-surface-variant: "var(--mat-sys-on-surface-variant)"
  outline-variant: "var(--mat-sys-outline-variant)"
  error: "var(--mat-sys-error)"
  on-error: "var(--mat-sys-on-error)"
typography:
  title:
    fontFamily: "Inter Variable"
    fontWeight: 600
  body:
    fontFamily: "Inter Variable"
  code:
    fontFamily: "Source Code Pro Variable"
rounded:
  square: "0"
  panel: "8px"
  mobile-navigation: "1rem"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.25rem"
  page-inline: "1.5rem"
components:
  workspace-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.lg}"
  workspace-record:
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    padding: "{spacing.md}"
    height: "64px"
  workspace-record-selected:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.panel}"
  context-selector:
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    height: "56px"
  navigation-item-active:
    backgroundColor: "{colors.secondary-container}"
    textColor: "{colors.on-secondary-container}"
    rounded: "{rounded.pill}"
    size: "48px"
  notice:
    textColor: "{colors.on-surface-variant}"
    rounded: "{rounded.panel}"
    padding: "{spacing.md}"
  risk-summary:
    textColor: "{colors.on-surface}"
    rounded: "{rounded.panel}"
    padding: "0.875rem"
---

# Design System: CACiC Event Manager Admin

## Overview

**Creative North Star: "The Academic Operations Desk"**

The admin is a practical working surface for people maintaining events, records, permissions, communications, and high-impact operations. It should feel quiet, trustworthy, and ready for repeated use: compact enough for dense work, with clear hierarchy and enough space to prevent mistakes.

The visual world remains close to Angular Material. Inter, semantic Material 3 colors, light and dark system themes, outlined panels, and familiar controls carry the interface. The event workspace adds a stable operational context to the shell; it does not add a second visual identity or a second navigation bar above each task.

**Key Characteristics:**

- Semantic Material color roles that adapt to light and dark themes.
- A sidebar context selector that turns global navigation into a focused operations menu.
- Compact, top-aligned workspaces with clear list-and-detail structure.
- Visible permission, loading, draft, publication, and consequence states.
- Bounded server search with keyboard-safe dialogs and independent editor state.

## Colors

Violet primary and rose tertiary palettes give the restrained neutral workspace a small amount of institutional color. Components consume semantic Material system roles so contrast and tone continue to adapt with the operating-system theme.

### Primary

- **Operational Violet:** identifies primary actions, progress, and informative emphasis. Use the semantic primary roles rather than a fixed light-theme swatch.

### Secondary

- **Selected Violet Neutral:** marks the current navigation item or selected record with the secondary-container pair. Reserve it for real selection.

### Tertiary

- **Internal Rose:** supports limited status accents such as the internal badge. It is a supporting role, not a second action color.

### Neutral

- **Adaptive Surface:** is the page and panel ground in both themes.
- **Container Surface:** distinguishes shell navigation and grouped regions without decorative card stacking.
- **Outline Variant:** separates panels, headings, dialog content, and nested sections with one-pixel structure.
- **Surface Text:** carries primary and secondary text through the on-surface role pair.

### Named Rules

**The Semantic Color Rule.** App-owned styles use Material system roles; theme-specific literals are limited to content that owns an independent palette, such as syntax highlighting.

**The Selection Has Meaning Rule.** Secondary-container color always communicates the active destination or selected record.

## Typography

**Display Font:** Inter Variable

**Body Font:** Inter Variable

**Label/Mono Font:** Source Code Pro Variable for code content only

**Character:** Inter keeps dense administrative copy plain and legible. The interface relies on Material type roles instead of creating an independent editorial scale.

### Hierarchy

- **Page title:** compact and firm, with the shell heading at weight 600.
- **Section, context, and record title:** use Material title roles to identify the current task and selectable records.
- **Body:** uses the Material body-medium role for instructions, form context, and operational detail.
- **Supporting text:** uses on-surface-variant and body-small or label roles for counts, dates, and context descriptions.
- **Code:** uses Source Code Pro only inside technical or markdown code content.

### Named Rules

**The Operational Copy Rule.** Interface strings are concrete Brazilian Portuguese labels that name the task, state, scope, or consequence.

## Layout

The shell uses a 72px desktop navigation rail, a 17.5rem expanded navigation, a sticky toolbar, and a content region that can shrink without horizontal overflow. The context selector occupies the first sidebar region with a 56px minimum target. Selecting it opens a 640px Material dialog capped at the viewport width minus 2rem. Dialog results remain bounded to the smaller of 26rem and 45dvh.

When an event, group, or major event is active, the sidebar swaps global destinations for the operations permitted in that context. The visible set can include overview, subscriptions, attendances, forms, draws, interests, certificates, publication, and sports according to target kind and permissions. Configuration has its own sidebar destination. Events open directly into that editor with participation counts above it; groups and major events retain a separate programming overview. The persistent “Menu global” and “Menu do contexto” control changes only the navigation list; it preserves the current page and selected context. Global destinations remain real routes and stay reachable.

The context menu also reflects the selected hierarchy. Groups and events expose their immediate parent as a named Twemoji shortcut. Major events can browse their groups or direct events, and groups can browse their events, through the same dialog constrained to that parent and child type. A child picker never mixes unrelated contexts into its results.

Desktop task pages place an inventory beside a wider editor using an 18rem minimum list column and a flexible detail column. Inside the scoped shell, focused configuration editors hide their catalog column and use the available content width. Global tools retain their catalog or inline scope controls. Old event editor and tournament-ID routes are removed. Panels align to the top so short inventories do not stretch to match long editors.

Use a 1rem rhythm between workspace regions and inside primary panels. Headings and action groups wrap before their labels collide. At 900px, list-and-detail grids stack and long record lists return to document flow. At 768px, the shell moves navigation into a 280px overlay and reduces page padding. At 760px, headings and action groups stack. At 480px, record actions move below the main selection control.

Search is live and debounced at 250ms. The context dialog requests unified pages of up to 20 authorized nodes. Empty-query pages form the hierarchy; query pages preserve backend relevance ranking and ancestor metadata. Server-backed work inventories show 50 records per page and request one extra record to determine whether a next page exists. Changing a query or operational scope resets pagination.

**The Context Lives in Navigation Rule.** The shell owns event context and operation switching. Scoped pages do not repeat it as a top tab bar or page-level context header.

## Elevation & Depth

The workspace is flat by default. One-pixel outline-variant borders and tonal surface roles provide structure. Panels do not gain resting shadows. Material dialogs provide protected focus for choosing context. The auto-expanding desktop navigation is the visual exception: while temporarily open on hover or keyboard focus, it uses a small lateral shadow to clarify that it overlays content.

### Shadow Vocabulary

- **Temporary navigation overlay:** `4px 0 8px color-mix(in srgb, var(--mat-sys-shadow) 16%, transparent)` while the automatic rail is expanded.

### Named Rules

**The Flat at Rest Rule.** Prefer borders and tonal surfaces; reserve shadow for a temporary layer that physically overlaps another region.

## Shapes

Working panels, notices, risk summaries, context selectors, and reusable record rows use gently curved 8px corners. Desktop navigation destinations are 48px pills; mobile destinations use a 1rem radius as they expand to full width. The sidenav itself and nested surfaces remain square where they meet the shell or parent panel.

Avoid stacking independent rounded cards inside a panel. A nested surface becomes a border-top section with square corners so the hierarchy reads as one workflow.

## Components

### Material controls

Buttons, inputs, tabs within task-specific workflows, dialogs, menus, lists, progress indicators, and focus state come from Angular Material. Keep their native variants and state layers. Use filled or emphasized actions for the primary next step, stroked actions for peers, text actions for low-emphasis recovery, and icon buttons only when the icon has an accessible Brazilian Portuguese name.

### Sidebar context selector

The first sidebar control displays the selected context name and its saved emoji through Twemoji, or a search icon and “Escolher evento” when no context is active. It opens the context dialog and becomes disabled when a scoped editor reports unsaved changes that block switching. Below it, immediate-parent and child-browse shortcuts use names and Twemoji from fetched context data. Long context names wrap instead of clipping.

### Context dialog and picker

The dialog is a protected, interruptive choice because switching context changes the operational meaning of many destinations. It autofocuses the search input and closes after a record is selected. Without a query, the shared picker presents a lazy hierarchy: major events contain direct events and groups, groups contain their events, and independent events or groups remain roots. Only top-level parents are paginated. Expanding a parent loads all its children; child branches and parent-scoped pickers have no pagination controls. Hierarchy shortcuts pass a parent and child kind so the picker requests only groups or events belonging to that parent.

Search returns a flat, backend-ranked result list with visible ancestry instead of forcing ranked matches back into alphabetical tree order. Result metadata identifies kind, schedule, location, publication state, and parent path when available. The picker preserves server order, guards stale responses, and provides loading, empty, unavailable, retry, cancel, expand, pagination, and selected states.

### Navigation

Desktop navigation supports icon, expanded, and automatic modes. Automatic mode expands on pointer hover and `:focus-visible`, and its 180ms transition becomes 0ms under reduced-motion preference. The active destination uses secondary-container color and `aria-current="page"`. Mobile navigation always exposes labels and repeats the selected context beside the page title.

The global/context menu toggle changes the navigation list without navigating away. Context operations retain stable routes and permission filtering. Groups expose the operations that apply to groups; event-only operations are not shown as disabled decoration.

### Event workspace hub

The global “Eventos” destination opens the event workspace hub. With no selection, it displays the shared searchable hierarchy directly, beside permission-gated creation actions. It does not repeat global-tool links or require an intermediate chooser button. With a selection, events open their configuration editor with participation counts; groups and major events show a searchable program hierarchy and open configuration through a separate sidebar destination. Major-event and group sidebars provide parent-aware shortcuts for creating children. The context dialog also provides global creation shortcuts that use the canonical `/event-workspace/new/*` routes.

The global “Certificados avulsos” destination opens a folder-only browser with a visible “Nova pasta” action. Folder creation and editing use a dedicated inline section for name and emoji. Selecting a folder collapses the bounded folder list behind “Trocar pasta” and reveals its existing configuration, issuance, reissuance, download, clone, and delete tools. Event, group, and major-event certificate pages receive their scope from the contextual URL and do not expose a second generic scope selector.

### Workspace record

A record is a minimum 64px selection control with a title, optional description, `aria-pressed`, and a distinct selected state. The main control owns selection. Secondary actions occupy a separate projected action region, so opening a menu or invoking a row action cannot also change the selected record. Saved event emojis render with Twemoji; emoji inputs remain available in editors.

### Focused editors and resource actions

Inside the scoped shell, event, group, and major-event editors have a dedicated Configurações sidebar destination and remove their catalog column while preserving draft-versus-published version choice, history, save and publication behavior. Clone and delete move into a permission-gated “Mais ações” menu. Canonical creation uses `/event-workspace/new/event`, `/event-workspace/new/group`, and `/event-workspace/new/major-event`; old editor aliases are removed; settings use `/event-workspace/:kind/:id/settings`.

### Lists, search, and pagination

Search and scope filters operate on the full server-backed inventory rather than filtering only the visible page. The shared context picker retains date-range, group-membership and major-event-membership filters under Filtros. Active event filters show a flat list of matching events with ancestry and reset the root cursor; they never filter only the current hierarchy page. Editor pages do not maintain duplicate context catalogs. Attendance and subscription subcomponents consume their routed selection without a second picker or catalog loader. Forms and prize draws share an independently searchable, paginated event-target control; draw targets include historical events, and the current target remains visible beyond the first page. Pagination has explicit previous and next controls with disabled boundary states. A detail editor may remain open when a list query or page changes, but a change to an incompatible operational context clears or blocks that selection.

### Conditional policy and risk

Keep frequent fields visible. Reveal membership rules, permission policy, scheduling, and destructive options only when the selected mode makes them relevant. High-impact operations pair permission checks with an adjacent consequence summary or confirmation. Disabled controls retain enough nearby text to explain the state without exposing inaccessible action paths.

## Do's and Don'ts

### Do:

- **Do** keep the selected context, navigation mode, visible menu, current route, list query, page, record selection, and editor state as separate concepts.
- **Do** let the sidebar context selector open a bounded, keyboard-safe search dialog and return to the corresponding operation when possible.
- **Do** keep global destinations and canonical workspace routes reachable; remove obsolete route aliases instead of retaining compatibility redirects.
- **Do** prefill parent associations when creating an event from a group or major event, or a group from a major event.
- **Do** let organizers move down to children and back to the immediate parent without returning to a global search.
- **Do** paginate top-level contexts only; load every child page internally when expanding a parent and reset child state when its owning query changes.
- **Do** keep `/certificates` focused on standalone certificate folders, while event, group, and major-event certificate routes inherit their fixed context from the URL.
- **Do** retain draft/version controls and permission-gated clone/delete actions when a catalog is hidden in focused shell editors.
- **Do** render saved emojis through Twemoji while preserving the existing emoji inputs.
- **Do** reset list pagination when its query or scope changes, and keep server ordering deterministic across page boundaries.
- **Do** restore or deliberately move focus when navigation, dialog closure, scope collapse, or a route change removes the focused element.

### Don't:

- **Don't** add a top operation tab bar or duplicate context header to pages already hosted by the scoped shell.
- **Don't** make “Menu global” or “Menu do contexto” navigate, clear the selected context, or reset the current editor.
- **Don't** hide global access inside an event-only workflow or make standalone records unreachable.
- **Don't** use client-side filtering of the current page as a substitute for bounded server search.
- **Don't** let a secondary row action trigger the row's main selection behavior.
- **Don't** carry an editor selection into a different incompatible context or discard unsaved changes during a context transition.
- **Don't** stretch short panels to the height of long editors, add nested decorative card outlines, or replace Material controls with custom equivalents.
