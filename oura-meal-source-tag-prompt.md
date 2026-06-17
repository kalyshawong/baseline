# Claude Code Prompt: Meal Source Tag for Oura Food Logging

## Context

I'm prototyping a feature for the Oura app's food logging flow. Today, when users log a meal, there's no way to distinguish where the food came from — home-cooked, takeout, restaurant, or pre-packaged. This matters because:

1. The nutrition database systematically underestimates macros for takeout and restaurant meals (bigger portions, hidden oils/sauces, generic database entries).
2. Without a source tag, we can't analyze how a user's body responds differently to takeout vs. home-cooked meals — which is the long-term insight we want to surface.
3. Users currently have no way to scan back through their log and see at a glance which meals were eaten out.

The tag itself is the foundation. No clever ML, no calibration loop, no restaurant database — just a single field that captures the meal's source.

## What to build

Add a **meal source** field to the food log entry data model and UI.

### Data model

Each logged meal should have a new `source` field with one of four enum values:

- `home_cooked` (default)
- `takeout` (delivery or pickup)
- `restaurant` (dine-in)
- `pre_packaged` (store-bought, frozen meal, protein bar, etc.)

The field is optional in the schema but always shown in the UI so the choice is one tap away.

### UI

In the meal logging flow, after the user has added the food items but before they save:

- Show a single row labeled "Source" with four selectable chips/segments for the four options above.
- Default selection: `home_cooked`.
- One tap to change. No required action — if the user just hits save, default sticks.

In the meal log/history view:

- Show a small icon or label next to each logged meal indicating its source (e.g., a house icon for home-cooked, a bag for takeout, etc.).
- Make it visually subtle — this is metadata, not a primary feature.

### Out of scope for this version

- Restaurant name field (free text) — explicitly NOT in v1. Tag alone is enough.
- Cuisine type, portion confidence, who-cooked-it — all v2+.
- Any logic that uses the tag (multipliers, filtering, analysis) — that's a separate feature. Just capture the data for now.

## Acceptance criteria

- [ ] Data model has a new `source` field on the meal entry, with the four enum values above.
- [ ] Existing meals get `home_cooked` as a default on migration (or null, depending on what's cleaner).
- [ ] Meal logging flow shows the four-option selector with `home_cooked` pre-selected.
- [ ] Meal history view shows a small visual indicator of source per meal.
- [ ] The selector is optional — saving without touching it works fine.
- [ ] Tests cover the happy path (log meal with each source, verify it persists and renders).

## Stack notes

This is a Next.js + Prisma project. Add the field to the Prisma schema, generate a migration, update the relevant API routes and React components. Match the existing code style — check a recent meal-related PR if one exists.

## Open decisions to flag

If any of these come up while you're working, surface them rather than picking silently:

- Whether to backfill existing meals with `home_cooked` or leave them null.
- Which icons to use for the four sources (I have opinions but want to see the options).
- Whether to put the selector above or below the food items list in the logging flow.

Start by reading the current meal model + logging flow so you understand the existing shape, then propose a brief plan before writing code.
