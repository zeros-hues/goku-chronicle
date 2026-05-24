---
name: project-chronicle-ui
description: Chronicle UI decisions and component patterns applied in May 2026 batch
metadata:
  type: project
---

Meeting form uses button pickers (not number inputs): people 1–8, duration 0.25–3h. Running TOTAL shown above pickers. Both new and edit drawer use the same `NewEntryDrawer` component.

`Client.hasRetainership` flag added to data.ts — Appasamy is `true`, Goku Studio is `false` (implied). When editing/adding a project under a retainer client, a 3-option segmented control (Retainer / Out of Retainer / Internal) appears. For non-retainer clients only INTERNAL badge shows.

Export page defaults: client=Appasamy, billing=Retainership, anon=ON, date=this-month (1st to today). Smart logic: changing client resets billing and auto-sets anon. Goku Studio auto-locks to Internal with no billing selector.

`isRetainerAnon` = `anon && billing === 'retainer'`. When true: column header is "Working Hours", meeting rows show duration only (not ×people), grand total row appears at bottom of table and CSV.

WhatsApp bot blocks all unknown numbers with a fixed message; no self-registration flow.

**Why:** Design refinement pass requested by user May 2026 — tactile meeting entry, cleaner export defaults for the most common workflow (Appasamy retainer, client-facing export).

**How to apply:** When touching export or entry drawer code, these are the intended defaults and column behaviours. The `isRetainerAnon` guard is the key branch point for export formatting.
