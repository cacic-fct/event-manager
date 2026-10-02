---
version: 1
slug: "admin-event-workspace"
primary_target: "src/app/app-shell/admin-shell.component.ts"
related_targets: ["src/app/app-shell/admin-shell.component.html","src/app/event-workspace/event-workspace-page.component.ts","src/app/event-workspace/event-workspace-page.component.html","src/app/event-workspace/event-workspace-context.service.ts","src/app/shared/event-context-picker.component.ts","src/app/shared/event-context-dialog.component.ts"]
---

# Admin event workspace

Mode: Operate. Extend the established admin shell and event-management workflows.

## Direction contract

THESIS: Organizers select an event context once in the sidebar, then move among the operations permitted for that context without repeatedly searching or losing the current task. The surface refuses a second top-level tab bar or duplicated context header.

OWN-WORLD: Preserve Angular Material light and dark themes, violet primary and rose tertiary palettes, Inter interface typography, Material Symbols, Twemoji for saved event emoji, flat outlined surfaces, 8px working panels, 48px navigation targets, and the existing compact desktop density. Context selection uses a native Material dialog and the shared record language.

STORY: An organizer opens the context selector, chooses an event, group, or major event, sees its name and emoji anchored in the sidebar, and opens its configuration before moving through subscriptions, attendances, forms, draws, interests, certificates, publication, or sports as permissions and target kind allow. A major event can browse only its groups or direct events, and a group can browse only its events. Entering an event opens its editor with participation counts; entering a group opens its programming overview; a named Twemoji shortcut returns directly to its immediate parent. “Menu global” reveals ordinary admin destinations without leaving the current page or discarding unsaved work; “Menu do contexto” returns to the operation list.

FIRST VIEWPORT: The sticky toolbar remains above a desktop sidebar and one focused content surface. The sidebar begins with the context selector, followed by the immediate parent, child browse and parent-aware creation shortcuts when they apply, then contextual operations or global destinations and the persistent menu toggle. Events open directly in Configurações with participation counts above the editor. Groups and major events have separate Configurações and programming overview destinations. The page header names the operation; the desktop content does not repeat the context or operations above the editor. On mobile, the sidebar becomes a 280px overlay and the page header pairs the selected Twemoji with the context name.

FORM: Code-led extension of an established operational shell. The signature interaction is the sidebar context selector opening a 640px, viewport-capped dialog. With no query, the picker lazily pages hierarchical roots and child branches; with a query, it shows a flat backend-ranked list with visible ancestry and operational metadata. Scoped shortcuts constrain the same API by parent and child kind. The dialog offers global creation shortcuts and closes into the equivalent operation route when available. Parent shortcuts use canonical `/event-workspace/new/*` routes with query-prefilled associations. The shared picker also exposes date and event-membership filters over the complete server inventory. Focused configuration editors omit duplicate catalogs while retaining draft/version controls and a permission-gated “Mais ações” menu for clone and delete.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
