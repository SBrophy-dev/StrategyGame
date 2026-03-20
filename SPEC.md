# Pax Historia Clone — Game Design Specification (v1)

> A browser-based grand strategy game with fully deterministic, rules-based systems.
> No backend. No API calls. Zero running costs.

---

## Implementation Progress

| Phase | Scope | Status |
|---|---|---|
| 1. Types | `src/types/` — all interfaces | ✅ Complete |
| 2. Engine | `src/engine/` — resolution, combat, economics, events, diplomacy | ✅ Complete |
| 3. AI | `src/ai/` — archetypes, modifiers, NPC orders | ✅ Complete |
| 4. Scenario Infrastructure | `validateScenario.ts`, scenario JSON, event library JSON | ✅ Complete |
| 5. Persistence | `src/persistence.ts` | ✅ Complete |
| 6. UI Components | `src/components/` — Map, TopBar, BottomBar, RightPanel | ✅ Complete |
| 7. App Integration | Game loop, state management, wiring | ✅ Complete |
| 8. Testing | Unit tests for engine, CONFLICT_PRIORITY, validateScenario | ✅ Complete |

**V1 Implementation: COMPLETE** — All 8 phases finished. 181 unit tests passing across 6 test files.

---

## 1. Overview

The player controls a nation turn-by-turn in a fantasy world, making structured decisions resolved by local game logic. All NPC nations are driven by rules-based AI (scripted agendas + utility scoring). The game is designed for a solo TypeScript developer.

### 1.1 Target Session Profile
- 8–12 nations
- 40–60 provinces
- 30–50 turns
- ~30–60 minutes per session

All of these are **scenario data**, not engine constants. The engine makes no assumptions about scale.

---

## 2. Tech Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| UI framework | React 18 (functional components, hooks only) |
| Map rendering | SVG (stateless pure component) |
| Bundler | Vite |
| Test runner | Vitest |
| Persistence | localStorage autosave + export/import JSON |
| Distribution | Browser (no install, no backend) |

---

## 3. Core Architecture Principles

These are non-negotiable invariants enforced by CLAUDE.md conventions:

1. **Province + Edge objects are the single source of truth.** No system stores derived copies of province data. Systems read directly from the province object at the moment they need it.
2. **All game logic is implemented as pure functions.** Inputs in, result out, no side effects. Side effects (persistence, UI updates) happen at designated boundaries only.
3. **Buildings are derived, never stored.** `getBuildings(devLevel, focus)` is a pure function. Province state holds only `devLevel` and `focus`.
4. **TypeScript interfaces are defined first.** All types live in `src/types/` before any system code is written. ✅ COMPLETE
5. **Scenario data drives all scale.** Turn limits, nation counts, province counts, victory conditions — all come from scenario JSON. Nothing hardcoded in the engine.
6. **The WEGO conflict priority table is a named constant** at the top of `src/engine/resolution.ts`. Never inlined or moved.
7. **Events are a data library.** Generic events defined as JSON files. Event handlers are pure functions keyed to event type. No event logic hardcoded.
8. **Archetypes and modifiers are in separate files.** `archetypes.ts` is constants only. `modifiers.ts` is pure functions only.
9. **Only `persistence.ts` touches storage.** All other modules are storage-agnostic.

---

## 4. World Model ✅ IMPLEMENTED in `src/types/province.ts`, `src/types/edge.ts`

### 4.1 Province Node

```typescript
interface Province {
  id: string
  name: string
  ownerId: string | 'rebel' | null
  terrain: TerrainType        // Plains | Forest | Mountain | Coastal | Desert
  devLevel: 1 | 2 | 3 | 4 | 5
  focus: ProvinceFocus | null // null until devLevel >= 2
                              // Agricultural | Industrial | Commercial | Military
  unrest: number              // 0–100; rebellion triggers at 100
  fortLevel: number           // 0–3
  population: 'Low' | 'Medium' | 'High' | 'Thriving'
                              // war, plague, and occupation events can reduce population (min: Low)
  strategicTag: StrategicTag | null // Capital | KeyRegion | Port | null
                              // Port: enables Land army projection across adjacent water edges
                              // NOTE: 'Chokepoint' is an Edge property only — never a strategicTag value
  layout: {                   // PRESENTATION ONLY — never read by engine or AI code; only Map.tsx may access this
    x: number                 // SVG centre x coordinate
    y: number                 // SVG centre y coordinate
    polygon: [number, number][] // SVG polygon vertices for province shape
  }
  // NOTE: buildings and resource output are DERIVED — never stored here
}
```

### 4.2 Edge Object

```typescript
interface Edge {
  sourceId: string
  targetId: string
  movementCost: number    // turns of movement cost along this edge
  tradeValue: number      // flat Gold bonus when tradeActive
  chokepoint: boolean     // strategic flag for AI and UI hints
  tradeActive: boolean    // true when a Trade Deal is active between both owners
}
```

The adjacency graph (province nodes + edge objects) is the map. The `layout` field is stored on the Province node for SVG rendering purposes only — it must never be read by engine or AI code. Only `Map.tsx` may access `province.layout`.

---

## 5. Nation Model ✅ IMPLEMENTED in `src/types/nation.ts`, `src/types/resources.ts`, `src/types/diplomacy.ts`

```typescript
interface Nation {
  id: string
  name: string
  color: string                // hex color string, e.g. '#c0392b'; used by Map.tsx to fill owned provinces
  archetype: Archetype         // Expansionist | Trader | Isolationist | Hegemon
  modifiers: Modifier[]        // up to 2 of 6 flags (see §10.2)
  agenda: Agenda               // scripted long-term goal (see §10.3)
  utilityWeights: UtilityWeights // derived from archetype at load time
  resources: ResourceLedger
  relations: Record<string, number>         // nationId → -100 to +100
  agreements: Record<string, Agreement[]>  // nationId → active agreements
  intelOf: Record<string, IntelRecord>     // nationId → intel object (see §9)
  eliminatedOnTurn?: number
  exileWindowExpires?: number
}
```

### 5.1 Resource Ledger

Five resources, updated in a single bookkeeping pass as the last step of turn resolution:

| Resource | Role | Constraint |
|---|---|---|
| Gold | Funds buildings, diplomacy, agreements | Stockpile; negative triggers debt penalty modifier |
| Food | Sustains armies; drives population growth | Consumed per army unit per turn |
| Production | Builds military and infrastructure | Spent on construction actions |
| Influence | Diplomatic action currency | Soft cap = archetype base cap + (active Trade Deals × 5); exceeding cap causes Influence to decay 10%/turn until back within cap; bonus diplo actions cost it |
| Manpower | Army replenishment pool | Soft cap = sum of (populationMultiplier × devLevel) across owned provinces; populationMultiplier: Low=1, Medium=2, High=3, Thriving=4 |

**Influence base caps by archetype** (defined as `baseInfluenceCap` constants in `src/ai/archetypes.ts`):

| Archetype | Base Influence Cap |
|---|---|
| Expansionist | 60 |
| Trader | 120 |
| Isolationist | 50 |
| Hegemon | 90 |

---

## 6. Turn Structure (WEGO Simultaneous) — ✅ IMPLEMENTED in `src/engine/resolution.ts`

All nations — player and AI — submit orders simultaneously. Orders are resolved in deterministic phases.

### 6.1 Phase Order

1. **Order collection** — Player and all AI nations submit their full order set
2. **Diplomatic phase** — Peace offers, new agreements, relation modifiers applied
3. **Military movement phase** — Army moves resolved; collisions detected
4. **Combat phase** — Battles resolved using CONFLICT_PRIORITY; conflict report generated
5. **Bookkeeping phase** (in strict order):
   - a. Resource income (province outputs → national ledger)
   - b. Resource consumption (army Food cost, maintenance)
   - c. Unrest modifiers (occupation, garrison presence, economic state)
   - d. Condition-triggered events evaluated and fired
   - e. Rebellion resolution (unrest=100 provinces → rebel owner)
   - f. Nation elimination check
   - g. Victory condition check (scenario object evaluated)

### 6.2 WEGO Conflict Priority Table

Defined as `CONFLICT_PRIORITY` constant at top of `src/engine/resolution.ts`:

```
Priority 1: Peace offers beat war declarations (same-turn paradox → peaceful resolution)
Priority 2: Defender beats attacker in province-swap (armies cross paths → battle in defender's origin)
Priority 3: Blockade beats trade route activation (naval blockade cancels trade_active on edge)
Priority 4: Earlier-queued diplomatic agreement beats later one for the same nation pair
Priority 5: Two armies simultaneously moving into the same empty province → both halt at the border;
            province remains unoccupied; contest resolves next turn
Priority 6: Two nations simultaneously declaring war on the same third nation → both wars are valid;
            the third nation fights both; wars resolve sequentially ordered by aggressor military
            strength (highest first)
Priority 7: Two nations simultaneously proposing an alliance to the same third nation → the proposal
            from the nation with the higher current relation score toward the third nation is accepted;
            the other is declined and logged in the ConflictReport
Rule:       Every conflict is logged to the per-turn ConflictReport — nothing silently discarded
```

### 6.3 Action Budget (Player & AI)

| Category | Per-turn allocation | Overflow cost |
|---|---|---|
| Diplomatic | 2 | +1 action costs Influence |
| Military | 1 per army unit | — |
| Construction | 1 per owned province | — |
| Wildcard/Special | 1 | — |

All available actions and remaining budget are displayed in the UI **before** the player commits.

---

## 7. Military System — ✅ IMPLEMENTED in `src/engine/combat.ts`, `src/engine/resolution.ts`

### 7.1 Unit Types

- **Land Army**: entity with `strength` value; moves along graph edges; blocked by water edges without a Port province
- **Naval Army**: moves along coastal edges; can blockade trade routes (sets `tradeActive=false` on adjacent edges); required to project Land force across water

### 7.2 Province Fortification

Fort level (0–3) is a field on the Province node — not a unit. Sieges are automatic: a Land Army occupying a fortified province for N consecutive turns (configurable per scenario) triggers siege resolution, reducing fort level by 1.

### 7.3 Combat Resolution

Combat is a **pure function**:

```typescript
function resolveCombat(params: CombatParams): CombatResult
// CombatParams: attackerStrength, defenderStrength, fortBonus, terrainModifier, seed
// CombatResult: winner, attackerCasualties, defenderCasualties, rounds (if major battle)
```

**Base resolution**: seeded RNG dice roll + modifiers. Same seed = reproducible result.

**Major battle trigger** (either condition):
- Combined army strength exceeds scenario-defined threshold, OR
- Battle is for a Capital or KeyRegion province

**Major battle resolution**: multi-round attrition. Each round reduces both sides proportionally to power ratio. Retreat is a valid order (costs 1 military action). Rounds continue until one side retreats or is eliminated.

---

## 8. Diplomacy System — ✅ IMPLEMENTED in `src/engine/diplomacy.ts`

### 8.1 Relation Score

- Per nation-pair integer: -100 to +100
- Gates available actions (war declaration requires relation < 0 or a casus belli; alliances require > 50)
- Decays toward 0 by a configurable amount per turn (set in scenario JSON, default: 1/turn)

### 8.2 Agreement Types

| Agreement | Mechanical Effect | Expiry |
|---|---|---|
| Non-Aggression Pact | War declaration requires breaking pact first (costs relation score) | N turns or until broken |
| Trade Deal | Sets `tradeActive=true` on shared edges; surplus exchange fires in bookkeeping | N turns or until broken |
| Military Alliance | Auto-joins wars when ally is attacked; shares Military + Diplomatic intel tracks | Until broken |
| Vassalage | Vassal pays Gold + Production tribute per turn; liege may call to war | Until vassal revolts or liege releases |

### 8.3 Trade Deal Mechanic (per active deal, per bookkeeping pass)

1. Identify each nation's highest-surplus resource (output − consumption that turn)
2. If the surpluses are **different resources** → exchange: each nation receives the other's surplus amount
3. Apply `edge.tradeValue` as a flat Gold bonus to both nations

---

## 9. Intel System — ✅ IMPLEMENTED in `src/engine/diplomacy.ts`

Each nation maintains an `IntelRecord` for every other nation, with four independent tracks:

| Track | What it reveals |
|---|---|
| Military | Army positions, unit strength |
| Economic | Resource ledger values |
| Diplomatic | Active agreements, relation scores toward third parties |
| Political | Archetype, active modifiers, agenda hint |

Each track has three visibility levels: `Hidden` | `Approximate` | `Revealed`

**Default visibility** is based on proximity (adjacent province owners get Approximate on Military).

**Improvements**:
- Military Alliance → Military + Diplomatic tracks Revealed
- Trade Deal → Economic track Revealed
- Spy action (wildcard) → player targets one specific track on one nation

Intel object is updated each turn resolution pass as a side effect of agreement state changes.

Displayed in UI as partially revealed information (e.g., "~200 Gold", "Large army") rather than hidden entirely.

---

## 10. NPC AI System — ✅ IMPLEMENTED in `src/ai/archetypes.ts`, `src/ai/modifiers.ts`, `src/ai/npcOrders.ts`

### 10.1 Architecture

- `src/ai/archetypes.ts` — `ARCHETYPE_WEIGHTS` (Archetype → UtilityWeights), `BASE_INFLUENCE_CAPS`; constants only
- `src/ai/modifiers.ts` — `opportunist()`, `paranoid()`, `honorable()`, `navalFocus()`, `grudgeholder()`, `militarist()`; `MODIFIER_FNS` lookup map; pure functions only
- `src/ai/npcOrders.ts` — `generateNpcOrders(nationId, state)` → Order[]; `generateAllNpcOrders(state, playerNationId)` → Record<string, Order[]>; utility-based scoring with archetype weights + modifier adjustment + agenda multiplier

AI orders pass through the same resolution engine as player orders. There is no special AI resolution path.

### 10.2 Archetypes & Modifiers

**Four archetypes** (pre-tuned utility weights and base Influence cap, all defined as constants in `archetypes.ts`):
- `Expansionist` — weights military actions and territory gain heavily; base Influence cap: 60
- `Trader` — weights trade deals, economic development, and Influence accumulation; base Influence cap: 120
- `Isolationist` — weights internal development, non-aggression, and defensive posture; base Influence cap: 50
- `Hegemon` — weights alliance-building, vassalage, and indirect power projection; base Influence cap: 90

**Six boolean modifiers** (each nation gets up to 2):
- `Opportunist` — boosts utility score when a neighbor is weakened or at war
- `Paranoid` — inflates perceived threat from adjacent nations; prefers defensive agreements
- `Honorable` — reduces likelihood of breaking agreements; penalty to utility for betrayal actions
- `NavalFocus` — multiplies utility for actions involving Naval armies and coastal provinces
- `Grudgeholder` — relation recovery toward nations that attacked them is significantly slower
- `Militarist` — bonus to utility for any military action regardless of archetype

### 10.3 Agenda System

Each nation has a scripted `Agenda` object (defined in scenario JSON):

```json
{
  "type": "control_region_cluster",
  "targetRegions": ["r12", "r13", "r14"],
  "priority": "high"
}
```

Agenda drives long-term goal priority. Utility scoring (via archetype weights + modifiers) governs turn-level tactical decisions. If an opportunity aligns with the agenda, utility score receives a multiplier.

---

## 11. Province Development System — ✅ IMPLEMENTED in `src/engine/economics.ts`

- **Dev level** (1–5): integer stored on province node; upgraded by spending Production + Gold (1 construction action)
- **Focus** (enum: `Agricultural | Industrial | Commercial | Military`): unlocked at dev level 2; switching costs 1 construction action
- **Buildings**: derived by `getBuildings(devLevel, focus)` — a pure function returning an array; never stored on province
- **Output**: derived by `getProvinceOutput(province)` — returns a `ResourceLedger` delta; never stored

**Output multiplier table** (default values, tuned in balance pass; scenarios may override via optional `developmentOutputTable` in `scenario.meta` — see §17):

| Dev Level | Agricultural | Industrial | Commercial | Military |
|---|---|---|---|---|
| 1 | Food +2 | Production +2 | Gold +2 | Manpower +2 |
| 2 | Food +4 | Production +4 | Gold +4 | Manpower +4 |
| 3 | Food +6, Gold +1 | Production +6, Gold +1 | Gold +7 | Manpower +6, Production +1 |
| 4 | Food +9, Gold +2 | Production +9, Gold +2 | Gold +11 | Manpower +9, Production +3 |
| 5 | Food +13, Gold +3 | Production +13, Gold +3 | Gold +16 | Manpower +13, Production +5 |

---

## 12. Unrest & Rebellion — ✅ IMPLEMENTED in `src/engine/resolution.ts`, `src/engine/events.ts`

- `unrest` (0–100) is a field on every province node
- Calculated and applied during the bookkeeping phase

**Unrest increases** (per turn):
- Province occupied by a foreign army: +8/turn
- No friendly army present in owned province: +2/turn
- Lost battle in adjacent province: +5 (one-time)
- Over-exploitation (dev 5, focus-mismatch, no food surplus): +3/turn

**Unrest decreases** (per turn):
- Friendly army garrisoned in province: −5/turn
- Dev level ≥ 3: −1/turn (stability bonus)
- N turns since conquest (linear reduction): −1/turn per 5 turns held

**Rebellion**: When unrest reaches 100, a condition-triggered rebellion event fires. Province `ownerId` is set to `'rebel'`. A rebel province has no army, produces nothing, and applies +5 unrest to all adjacent owned provinces per turn until reconquered.

**Population effects**: Some events can reduce a province's `population` level by one tier (minimum: `Low`). Population reductions are applied during the bookkeeping phase alongside unrest. Events that trigger population reduction: war (province occupied by foreign army for 5+ consecutive turns), plague (all affected provinces), and conquest (one-time reduction on province transfer to a new owner).

---

## 13. Nation Elimination — ✅ IMPLEMENTED in `src/engine/resolution.ts`

### 13.1 Hard Elimination
When a nation owns zero provinces, it is removed from active game state. A historical log entry is created:
```typescript
{ nationId, eliminatedOnTurn, eliminatorId, activeAgreementsAtTime }
```

### 13.2 Exile Window
- For 5 turns after elimination, any surviving nation may spend X **Influence** (configured as `exileRestoreCost` in scenario JSON) to **restore** the eliminated nation
- Restored nation receives: capital province at dev 1, 0 military, 50 unrest
- Restored nation re-enters as **independent NPC** with original archetype + agenda
- Starting relation toward restorer: +60 (obligated, not puppet)
- If exile window expires without restoration: option disappears permanently

---

## 14. Event System — ✅ IMPLEMENTED (types in `src/types/events.ts`, engine in `src/engine/events.ts`)

All events are defined as JSON data in `src/events/`. No event logic is hardcoded.

### 14.1 Event Schema
```json
{
  "id": "war_exhaustion",
  "trigger": {
    "type": "condition",
    "conditions": ["nation.wars.length > 0", "nation.resources.manpower < 30", "war_turns >= 5"]
  },
  "effects": [
    { "type": "resource_delta", "resource": "manpower", "amount": -10 },
    { "type": "relation_delta", "targets": "all_at_war", "amount": -5 }
  ],
  "narrative": "Prolonged conflict drains {nation.name}'s manpower reserves."
}
```

### 14.2 Generic Condition-Triggered Events (15–20 to author)

| ID | Trigger | Effect |
|---|---|---|
| `rebellion` | `province.unrest >= 100` | Province → rebel owner |
| `war_exhaustion` | War ≥ 5 turns AND manpower < 30 | Manpower −10, relations deteriorate |
| `assassination_attempt` | Relation < −80 with neighboring major power | Relation −20, target nation AI threat response |
| `economic_collapse_warning` | Gold < 0 for 3 consecutive turns | Influence −5/turn until resolved |
| `breakthrough` | Gold + Production above threshold for 5+ turns | Dev upgrade cost −20% next turn |
| `natural_disaster` | Province dev 5, Agricultural focus, food surplus < 0 | Province unrest +15, output −30% next turn |
| `succession_crisis` | Nation size large, no military action for 10+ turns | Internal unrest surge, relation penalties from neighbors |
| `plague` | Multiple provinces with `High` or `Thriving` population adjacent | Manpower −15, Food consumption +50% for 3 turns; reduces `population` by one tier in affected provinces (min: `Low`) |
| `mercenary_offer` | Manpower < 10, nation at war | Can hire temporary Manpower for Gold (wildcard action) |

### 14.3 Scripted Scenario Events

3–5 per scenario, defined in `scenario.scriptedEvents`. Fire on a specific turn number or when a named condition is met. Give each scenario its narrative identity.

---

## 15. Victory System — ✅ IMPLEMENTED (types in `src/types/scenario.ts`, engine in `src/engine/resolution.ts`)

Victory is defined as a data object on the scenario JSON — not hardcoded in the engine.

```json
{
  "primaryObjective": {
    "type": "control_regions",
    "regions": ["r01", "r04", "r09"],
    "turnsHeld": 3
  },
  "dominationThreshold": 0.65,
  "turnLimit": 40,
  "tiebreaker": "total_score"
}
```

**Victory check order** (end of each bookkeeping phase):
1. Check `primaryObjective` for all living nations → first to satisfy it wins
2. Check `dominationThreshold` (fraction of provinces controlled) → early domination win
3. Check `turnLimit` → if reached without a winner, call `calculateNationScore` for all nations → highest score wins

**Tiebreaker score function** (defined in `src/engine/resolution.ts` alongside the victory check logic):

```typescript
function calculateNationScore(nation: Nation, provinces: Province[]): number
// score = (sum of devLevel across owned provinces × 10) + gold stockpile + (active agreements count × 15)
```

---

## 16. Persistence

All handled by `src/persistence.ts`. No other file touches storage.

- **Autosave**: serializes full game state to `localStorage` after each turn resolution
- **Manual save**: serializes to a downloaded JSON file (named with scenario id + turn number)
- **Load**: accepts a JSON file upload OR reads from `localStorage`
- **State format**: full `GameState` object, JSON-serializable (no Maps — stored as `Record<string, T>`)

---

## 17. Scenario JSON Format (types ✅ IMPLEMENTED in `src/types/scenario.ts`)

Validated by `validateScenario(json)` at load time. Throws descriptive errors on schema violations.

```json
{
  "meta": {
    "id": "scenario_id",
    "name": "Scenario Name",
    "description": "...",
    "turnLimit": 40,
    "victoryConditions": { ... },
    "exileWindowTurns": 5,
    "exileRestoreCost": 30,           // resource: Influence
    "siegeTurns": 3,
    "relationDecayPerTurn": 1,
    "developmentOutputTable": { ... } // optional — overrides default output multiplier table from SPEC §11
  },
  "world": {
    "provinces": [ ...Province[] ],   // each Province includes the layout field (x, y, polygon)
    "edges": [ ...Edge[] ]
  },
  "nations": [ ...NationDefinition[] ],
  "startingState": {
    "provinceOwnership": { "provinceId": "nationId" },
    "armies": [ { "type": "Land|Naval", "strength": 10, "provinceId": "p01", "ownerId": "n01" } ],
    "resources": { "nationId": { "gold": 100, "food": 50, ... } },
    "relations": { "n01_n02": 20, ... }
  },
  "scriptedEvents": [ ...EventDefinition[] ],
  "genericEvents": ["war_exhaustion", "rebellion", "assassination_attempt", ...]
}
```

---

## 18. UI Layout

```
+----------------------------------------------------------+
| Turn 12 | Gold:240 Food:80 Prod:60 Man:45 Inf:30 | [END] |  ← TopBar.tsx (fixed height)
+----------------------------------------------------------+
|                                          |
|              SVG MAP                     |  ← Map.tsx (fills remaining space)
|  (stateless; receives GameState as       |  ← RightPanel.tsx slides OVER this
|   props, fires action callbacks)         |     map never compresses
|                                          |
+------------------------------------------+
| [Diplo: Veldran NAP ×] [Farm: IronCst ×]|  ← BottomBar.tsx (fixed height)
| Budget: 1 diplo · 2 army · END TURN     |
+------------------------------------------+
```

### Map Component
- SVG rendered from province/edge graph using layout coordinates in scenario JSON
- Stateless: receives `GameState`, selected province, and action callbacks as props
- Province fill color derived from `nation.color` for the owning nation, with unrest overlay
- Click on province → fires `onProvinceClick(provinceId)` callback

### Right Panel
- Slides over the map (map does not compress)
- Triggered by province or nation click
- Shows: province stats, available actions for selected province, nation summary
- All available actions shown with cost, remaining budget updated live

---

## 19. V2 Roadmap (Out of Scope for v1)

- Global tech tree (research unlocks building types nationally)
- Scenario editor UI (visual graph editor + event authoring)
- Multiplayer (same-device hot-seat or network)
- Large scale (15+ nations, 80+ provinces)
- Procedural map generation (seed-based world builder)
- Replay system (turn-by-turn playback using seeded resolution)
