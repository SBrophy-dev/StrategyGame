# MiMo Spec — Visual Overhaul Session Summary

**Date:** 2026-03-20
**Model:** MiMo v2 Pro Free (via OpenCode)
**Project:** Pax Historia Clone — Browser-based grand strategy game
**Stack:** React 19, TypeScript (strict), Vite, Vitest

---

## Context

The user reported that the game's UI looked like a "metrics dashboard" rather than a turn-based strategy game. They wanted flashy animations, bold colors, and nice maps. After discussing target aesthetics and scope, we agreed on a **dark moody grand strategy** visual style (inspired by Stellaris) with a **full visual overhaul**.

---

## Changes Made (Chronological)

### 1. Visual Overhaul — Core Styling (`src/index.css`)

Full palette replacement for deeper, richer dark theme:

- **Backgrounds:** Deepened from `#0e1118` → `#06080e` (primary), all secondary/tertiary/panel backgrounds darkened proportionally
- **Borders:** Warmer, more visible — `#1e2a3a` (border), `#2e3e55` (border-light)
- **Resource colors:** More vivid and saturated — gold `#ffc845`, food `#3ec957`, production `#d4874a`, influence `#b44fd0`, manpower `#f25564`
- **Accents:** Brighter accent `#3d7fd4`, more vivid danger `#e84055`, success `#38b854`
- **New CSS variables:** Terrain overlay tints (plains, forest, mountain, coastal, desert), glow colors (accent, gold, danger, success)

### 2. Nation Color Fixes (`src/scenarios/shattered_kingdoms.json`)

Three nations had colors that were invisible or too similar on the dark background:

| Nation | Old Color | New Color | Problem |
|---|---|---|---|
| Blackspire Dominion (n08) | `#2c3e50` | `#5b7fa5` | Nearly invisible on dark bg |
| Stormwatch (n09) | `#3498db` | `#2ed8d8` | Too close to n01 Valdris blue |
| Windholme (n10) | `#e67e22` | `#db6ad4` | Too close to n04 Sunhaven orange |

### 3. Map Rendering Overhaul (`src/components/Map.tsx`)

Complete rewrite of the map SVG rendering:

- **SVG `<defs>`:** Added radial gradient backgrounds, noise texture filter, province drop-shadow filter, selected-province glow filter, hover glow filter, army glow filter, battle glow filter, trade edge gradient, chokepoint gradient
- **Terrain layer:** New polygon layer beneath nation colors — tinted by terrain type (green for forest, blue for coastal, grey for mountain, gold for desert, warm for plains)
- **Province borders:** Two-layer approach — dark `#0a0e16` outline beneath nation-color fill for clean separation, inner white stroke at 6% opacity for depth
- **Curved edges:** Replaced straight `line` elements with quadratic bezier `path` elements. Midpoint offset perpendicular to the line, direction determined by a hash of the edge key for deterministic variation
- **Edge widths:** Scale with `tradeValue` (thicker = more valuable)
- **Compass rose:** Simple SVG decoration in bottom-right corner
- **Province labels:** Crown (♛) prefix for Capitals, star (★) for KeyRegions, anchor (⚓) suffix for Ports. Paint-order stroke for readability
- **Army icons:** Larger circles (r=10, was 8), strength number inside circle, glow ring behind each, SVG filter for glow effect
- **Battle rings:** Three concentric rings with staggered CSS animation delays (0.3s, 0.6s)

### 4. UI Chrome Overhaul (`src/App.css`)

Complete restyling of all UI components:

- **TopBar:** Gradient background, golden border glow, resource icons with colored box-shadow glow, gradient END TURN button with hover lift
- **BottomBar:** Matching gradient background, order chips with category-colored left border stripe, slide-in animation for new chips, budget labels with uppercase styling
- **RightPanel:** Spring-like slide animation (`cubic-bezier(0.34, 1.56, 0.64, 1)`), gradient background, action buttons with hover lift and gradient fill, thicker unrest bar (8px), rebel callout with danger border
- **Title screen:** Radial gradient background with subtle color accent glows, large 64px title with golden glow animation, ornament divider lines, gradient buttons with hover effects
- **Nation select:** Gradient cards, hover lift, selected state with accent border glow, archetype badges
- **Turn summary modal:** Backdrop blur, staggered entry animation per list item, glowing progress dots, gradient buttons
- **Nation overview HUD:** Player row with accent border, leader crown with gold glow, army strength color coding

### 5. Animations (CSS `@keyframes` in `App.css`)

| Animation | Purpose | Duration |
|---|---|---|
| `provinceCaptured` | Gold flash → settle on province capture | 2s |
| `provinceLost` | Red flash → desaturate on province loss | 2s |
| `battleRing` | Expanding ring fade for battle sites | 2.5s with staggered delays |
| `selectedGlow` | Breathing glow on selected province | 2s infinite |
| `tradePulse` | Opacity pulse on active trade edges | 3s infinite |
| `titleGlow` | Golden glow pulse on title screen | 4s infinite |
| `pulseWarn` | Opacity pulse on unrest warning | 2s infinite |
| `rightPanelIn` | Spring-like slide from right | 0.3s |
| `rightPanelOut` | Slide out to right | 0.2s |
| `mapRefresh` | Vignette breathing on end turn | 0.5s |
| `chipSlideIn` | Order chip entrance | 0.2s |
| `entrySlideIn` | Turn summary list entry | staggered 40ms per item |
| `feedbackFadeIn` | Action feedback text | 0.2s |

### 6. Resource Icon Prefixes (`src/components/TopBar.tsx`)

Added Unicode symbols before each resource value:
- Gold: ⬡ (`\u2B21`)
- Food: ❋ (`\u274B`)
- Production: ⚒ (`\u2692`)
- Manpower: ⚔ (`\u2694`)
- Influence: ✦ (`\u2726`)

### 7. Staggered Turn Summary Entries (`src/components/TurnSummaryModal.tsx`)

Added `style={{ animationDelay: `${i * 0.04}s` }}` to each list item for cascading entry animation.

---

## Bug Fixes (Post-Overhaul)

### 8. Unused Import Cleanup (3 files)

| File | Removed Import | Reason |
|---|---|---|
| `TurnSummaryModal.tsx` | `FiredEvent` | Type was inferred from `turnLog.firedEvents`, explicit import was dead |
| `economics.test.ts` | `ResourceLedger` | Never referenced as a type annotation |
| `resolution.test.ts` | `War`, `GameEvent` | Neither referenced in code (War only in a comment) |

### 9. Duplicate END TURN Button Removal — Initial Attempt

**Problem:** Two END TURN buttons existed — one in TopBar, one in BottomBar. Toolbar buttons (Export/Import/Exit) covered the BottomBar one.

**Mistake:** Removed the BottomBar button. User wanted the TopBar one removed.

**Fix:** Reverted BottomBar changes, removed the TopBar END TURN button instead.

### 10. Duplicate END TURN Button Removal — Corrected

**Action:** Removed END TURN button, `onEndTurn`, `gameOver`, `winner` from TopBar. Restored them in BottomBar. Updated App.tsx wiring. Cleaned up dead `winnerName` useMemo.

### 11. Toolbar Overlap + Game-Over Indicator

**Problem:** After removing the TopBar button, the fixed-position game toolbar (`position: fixed; top: 10px; right: 10px; z-index: 30`) covered the resources in the TopBar.

**Root cause:** The `.game-toolbar` was a fixed overlay floating above the TopBar, not part of the layout flow.

**Fix:**
- Moved toolbar (Export Save, Import Save, Exit) **inside** TopBar as a `.topbar__toolbar` flex child
- Added `onExportSave`, `onImportSave`, `onExitToMenu` props to TopBar
- Restored game-over indicator in TopBar — shows a centered "WINNER: X" gold banner when `gameOver` is true, replacing the resource display
- END TURN button hides on game-over
- Removed standalone `.game-toolbar` CSS (position: fixed overlay)
- Kept hidden `<input type="file">` in App.tsx for import functionality
- Added `.topbar__toolbar`, `.topbar__toolbar-btn`, `.topbar__game-over`, `.topbar__game-over-label` CSS classes

### 12. PostCSS Syntax Error (`src/App.css:968`)

**Problem:** After removing the `.game-toolbar` CSS block, a dangling `}` remained at line 968 from the old `.game-toolbar--danger:hover` closing brace.

**Fix:** Removed the stray `}` character.

### 13. Edge Visibility Improvement (`src/components/Map.tsx`)

**Problem:** Default edges were too dark against the dark background (`--border` `#1e2a3a` at 0.4 opacity).

**Fix:** Changed to `--border-light` (`#2e3e55`) at 0.55 opacity — roughly twice as visible.

### 14. Province Spacing — Rejected Approach (Shrink)

**Attempted:** Added `shrinkPolygon()` function to scale each polygon to 90% of its size around its center. Applied to all polygon renderings via `POLYGON_SCALE = 0.9`.

**User response:** Rejected — wanted provinces moved apart, not shrunk.

**Reverted:** Removed `shrinkPolygon`, `POLYGON_SCALE`, and all references.

### 15. Province Spacing — Accepted Approach (Spread)

**Action:** Wrote a one-time Node script (`scripts/spread-provinces.mjs`) that:
1. Computed the map center from all 45 province centers
2. Pushed each province's center 8% further from the map center (scale factor 1.08)
3. Shifted all polygon corner points by the same delta (keeping polygon size unchanged)
4. Wrote updated `shattered_kingdoms.json`

**Result:** Visible gaps between all adjacent provinces. Edges now bridge the gaps.

**Cleanup:** Deleted the script after use.

### 16. Edge Hover Highlighting (`src/components/Map.tsx`)

**Action:**
- Added `useState` import and `hoveredProvinceId` state to Map component
- Added `onMouseEnter`/`onMouseLeave` handlers to province polygon
- In edge rendering, added `isConnected` check — if either edge endpoint matches `hoveredProvinceId`, render with brighter blue stroke (`#7aa4d4`), thicker width, 0.9 opacity
- Added `.map-edge--highlighted` CSS class with `transition` and `drop-shadow` glow

### 17. Map Legend (`src/components/MapLegend.tsx`, `src/App.tsx`, `src/App.css`)

**Action:** Created a small legend overlay in the top-left corner of the map area.

- **New file:** `src/components/MapLegend.tsx` — stateless component with four sections:
  - **Province Type:** ♛ Capital, ★ Key Region, ⛵ Port
  - **Military:** ⚔ Land Army, ⚓ Naval Fleet, 🛡 Fortification
  - **Routes:** Dashed path line (normal), Gold solid line (active trade), Red solid line (chokepoint) — using inline SVG for edge previews
  - **Status:** Red unrest tint swatch, Battle site ring icon
- **CSS:** `.map-legend` positioned `absolute; top: 10px; left: 10px` with `backdrop-filter: blur(6px)`, semi-transparent dark gradient background, max-width 140px, compact 11px font
- **App.tsx:** Imported `MapLegend` and rendered inside the `.map-area` div alongside the Map component

### 18. Port Icon Disambiguation (`src/components/Map.tsx`, `src/components/MapLegend.tsx`)

**Problem:** Port provinces and Naval Fleet armies both used ⚓ (anchor), making them visually identical on the map.

**Fix:** Changed the Port icon from ⚓ (`\u2693`) to ⛵ (`\u26F5`, sailboat) in both the map province label suffix and the legend entry. Naval Fleet retains the ⚓ anchor icon.

### 19. Hints Button & Modal (`src/components/HintsButton.tsx`, `src/App.tsx`, `src\App.css`)

**Action:** Added a "Hints" button in the lower-left corner of the map area (positioned above the bottom bar). Clicking it opens a modal with categorized gameplay tips.

- **New file:** `src/components/HintsButton.tsx` — stateless functional component with `useState` for open/category state
- **Modal structure:** Two-column layout — left sidebar with 7 category buttons, right panel showing tips for the selected category
- **Categories (7 total):**
  1. **Unrest & Rebellion** — garrison mechanics, unrest thresholds, rebel spread, reclamation
  2. **Diplomacy** — relation decay, trade deals, NAPs, alliances (50+ requirement), war declaration (negative relation), break penalties, vassal tribute
  3. **Economy** — resource types, food consumption, influence/manpower soft caps, trade bonus
  4. **Province Focus** — Agricultural/Industrial/Commercial/Military specialization, dev level scaling
  5. **Military** — combat basics, terrain/fort bonuses, major battles, naval blockade, mercenaries
  6. **Action Budget** — four categories (diplomatic/military/construction/wildcard), planning advice
  7. **Victory** — control regions, domination, score tiebreaker
- **CSS:** `.hints-btn` positioned `absolute; bottom: 10px; left: 10px` with backdrop blur. Modal uses existing turn-summary animation styles for consistency. Category buttons show active state with accent highlight.

---

## Files Modified Summary

| File | Type of Change |
|---|---|
| `src/index.css` | Palette overhaul, new CSS variables |
| `src/App.css` | Complete UI chrome restyling, all animations, map legend styles |
| `src/components/Map.tsx` | Map rendering rewrite, edge curves, hover highlighting |
| `src/components/MapLegend.tsx` | **New file** — map legend component |
| `src/components/HintsButton.tsx` | **New file** — hints button and modal with 7 gameplay tip categories |
| `src/components/TopBar.tsx` | Resource icons, toolbar integration, game-over indicator |
| `src/components/BottomBar.tsx` | END TURN button retained as primary action |
| `src/components/TurnSummaryModal.tsx` | Staggered entry animation, removed dead import |
| `src/App.tsx` | Toolbar wiring, prop updates, MapLegend integration |
| `src/scenarios/shattered_kingdoms.json` | 3 nation color fixes, 45 province coordinate shifts |
| `src/engine/economics.test.ts` | Removed dead import |
| `src/engine/resolution.test.ts` | Removed dead imports |

## Files NOT Modified (Per CLAUDE.md Conventions)

- No changes to `src/engine/` logic
- No changes to `src/ai/` logic
- No changes to `src/types/` interfaces
- No changes to `src/persistence.ts`
- No changes to `src/initGame.ts`, `src/eventLibrary.ts`, `src/validateScenario.ts`
- No external dependencies added — all CSS animations and SVG filters only

## Test Status

All 181 unit tests passing across 6 test files. Zero TypeScript compilation errors.
