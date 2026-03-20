# CLAUDE.md — Pax Historia Clone

Solo developer project. Browser-based grand strategy game. No backend, no API calls, no external AI services. Full spec in SPEC.md.

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

## Stack

| Tool | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | React 18 — functional components and hooks only, no class components |
| Map rendering | SVG inside React |
| Bundler | Vite |
| Tests | Vitest |
| Persistence | localStorage + export/import JSON |

---

## File Structure

```
src/
  types/              ✅ COMPLETE — all interfaces defined and compiling
    province.ts       ← Province, TerrainType, ProvinceFocus, StrategicTag, PopulationLevel, DevLevel, ProvinceLayout
    nation.ts         ← Nation, Archetype, Modifier, UtilityWeights, IntelTrack, IntelRecord, VisibilityLevel
    edge.ts           ← Edge
    resources.ts      ← ResourceLedger, ResourceType
    diplomacy.ts      ← Agreement, AgreementType, Agenda, AgendaType
    combat.ts         ← CombatParams, CombatResult
    orders.ts         ← Order (union of 13 subtypes), ActionBudget, category unions
    events.ts         ← GameEvent, EventTrigger, EventEffect (7 effect types), ScriptedEvent
    scenario.ts       ← Scenario, ScenarioMeta, VictoryConditions, DevelopmentOutputTable, NationDefinition, StartingState
    state.ts          ← GameState, GameContext, Army, War, ConflictReport, TurnLog, EliminationRecord
    index.ts          ← Barrel re-export of all types

  engine/             ← COMPLETE — all engine modules implemented and compiling
    resolution.ts     ← WEGO turn resolver; CONFLICT_PRIORITY constant; resolveOrders() entry point; calculateNationScore()
    combat.ts         ← resolveCombat() (normal + major), getTerrainModifier(), getFortBonus(); seeded RNG
    economics.ts      ← getBuildings(), getProvinceOutput(), runBookkeeping(), getNationIncome(), getInfluenceSoftCap(), getManpowerSoftCap()
    events.ts         ← evaluateCondition(), evaluateAndApplyEvents(), applyEventEffects(); pure handlers keyed to effect type
    diplomacy.ts      ← createAgreement(), breakAgreement(), modifyRelation(), executeTradeExchange(), activateTradeRoutes(), updateIntelFromAgreements()

  ai/                ← COMPLETE — all AI modules implemented and compiling
    archetypes.ts     ← ARCHETYPE_WEIGHTS (Archetype → UtilityWeights), BASE_INFLUENCE_CAPS; constants ONLY
    modifiers.ts      ← opportunist(), paranoid(), honorable(), navalFocus(), grudgeholder(), militarist(); MODIFIER_FNS lookup map; pure functions ONLY
    npcOrders.ts      ← generateNpcOrders(), generateAllNpcOrders(); utility-based scoring with archetype weights + modifier adjustment + agenda multiplier

  components/         ✅ COMPLETE — all UI components implemented and compiling
    Map.tsx           ← Stateless SVG map; province polygons, edges, armies, labels, unrest overlay; props in, callbacks out
    TopBar.tsx        ← Turn counter, player resource display, end turn button
    BottomBar.tsx     ← Queued orders as removable chips, action budget display
    RightPanel.tsx    ← Province detail panel; slides over map; shows stats, output, buildings, armies, available actions

  scenarios/          ✅ COMPLETE
    shattered_kingdoms.json ← 10 nations, 45 provinces, 40-turn starter scenario

  events/             ✅ COMPLETE — 9 generic condition-triggered events
    rebellion.json
    war_exhaustion.json
    assassination_attempt.json
    economic_collapse_warning.json
    breakthrough.json
    natural_disaster.json
    succession_crisis.json
    plague.json
    mercenary_offer.json

  persistence.ts      ✅ COMPLETE — autosave (localStorage), exportSave (JSON download), importSave (file upload), PersistenceError, SaveEnvelope validation
  validateScenario.ts ✅ COMPLETE — schema + cross-reference validation; throws ScenarioValidationError
  initGame.ts         ✅ COMPLETE — initializeGameState(scenario) → GameState; builds nations, armies, relations, intel from scenario data
  eventLibrary.ts     ✅ COMPLETE — loadEventLibrary(genericEventIds, scriptedEvents) → GameEvent[]; static imports of all event JSON
  useGameLoop.ts      ✅ COMPLETE — useGameLoop() custom hook; state management, order queuing, budget computation, turn resolution, autosave
  App.tsx             ✅ COMPLETE — Title screen, scenario loading, game screen wiring, save/load/export, exit to menu
```

---

## Conventions

### 1. Interfaces Before Implementation ✅ COMPLETE
All TypeScript interfaces live in `src/types/` and must be defined and reviewed before writing any system that uses them. If you are about to write engine or AI code and the relevant types don't exist yet, write the types first.

### 2. Pure Functions Everywhere
Game logic functions take state in and return new state out. No mutations, no side effects. If a function reads from or writes to anything outside its arguments, it belongs in a designated side-effect module (only `persistence.ts` and the React component tree).

### 3. Province + Edge Objects Are the Source of Truth
No system stores a derived copy of province or edge data. If combat needs fort level, it reads `province.fortLevel` at resolution time. If economics needs terrain, it reads `province.terrain`. Never cache these values elsewhere.

**Exception — `province.layout` is presentation-only**: The `layout` field (x, y, polygon) is stored on the Province node solely for SVG rendering. Engine code (`src/engine/`) and AI code (`src/ai/`) must never read `province.layout`. Only `Map.tsx` may access it.

### 4. Derived Data Is Never Stored
Buildings and resource output are computed on demand:
- `getBuildings(devLevel, focus)` → `Building[]`
- `getProvinceOutput(province)` → `ResourceLedger`

These are pure functions in `src/engine/economics.ts`. Province state holds only `devLevel` and `focus`.

### 5. Scenario Data Drives All Scale
Turn limits, nation counts, province counts, victory conditions, siege duration, exile window length — all live in scenario JSON. The engine reads these from the scenario object at runtime. Nothing is hardcoded as a constant in engine files.

**Development output overrides**: The output multiplier table in SPEC.md §11 contains default values only. A scenario may supply an optional `developmentOutputTable` field in its `meta` block to override these values for that playthrough. The engine must always read output values from the scenario object — never from a hardcoded fallback in engine files.

### 6. CONFLICT_PRIORITY Is a Named Constant
The WEGO collision resolution rules live as `CONFLICT_PRIORITY` at the top of `src/engine/resolution.ts`. Do not inline these rules into resolution logic or move them elsewhere. They must be auditable at a glance.

### 7. Events Are Data
All events (generic and scripted) are defined as JSON in `src/events/`. Event handlers in `src/engine/events.ts` are pure functions keyed to event type. No event resolution logic is hardcoded outside of the handler map.

### 8. Archetypes and Modifiers Are Separate Files
- `src/ai/archetypes.ts` — constants only. Maps archetype name → `UtilityWeights` object. No functions.
- `src/ai/modifiers.ts` — pure functions only. Each modifier: `(score: number, context: GameContext) => number`. No constants.

Tuning an archetype must not require touching modifier logic, and vice versa.

### 9. Persistence Is Isolated
Only `src/persistence.ts` calls `localStorage.setItem/getItem` or triggers file downloads/uploads. All other modules are storage-agnostic and receive/return serializable state.

### 10. AI Orders Use the Same Types as Player Orders
NPC nations generate the same `Order` structs that the player submits. There is no special AI resolution path — all orders pass through the same `resolveOrders()` function.

---

## Testing Requirements

- All pure functions in `src/engine/` must have unit tests in Vitest
- Every case in `CONFLICT_PRIORITY` must have an explicit unit test before that case is integrated into full resolution
- `validateScenario()` must have tests for both valid and invalid scenario shapes
- Run tests: `npx vitest`

---

## Do Not

- Do not hardcode turn limits, nation counts, or province counts anywhere in `src/engine/` or `src/ai/`
- Do not store derived data (buildings, resource output) on province state
- Do not add any external API calls, AI service calls, or server-side logic — ever
- Do not add a tech tree in v1 (v2 roadmap item)
- Do not add a scenario editor UI in v1 (v2 roadmap item)
- Do not use class components in React
- Do not let any file other than `persistence.ts` touch localStorage or file I/O
- Do not duplicate province/edge data into other state objects
- Do not add multiplayer in v1

---

## Key Design Decisions (rationale summary)

| Decision | Rationale |
|---|---|
| WEGO simultaneous resolution | Realistic; all nations act on the same information; requires priority table for conflicts |
| Abstract region graph (not hex grid) | Simpler state, cleaner logic, easier to balance; graph edges carry strategic meaning |
| Buildings as derived data | Eliminates inconsistency bugs where province state and building list diverge |
| 5 resources (Gold/Food/Production/Influence/Manpower) | Each resource is distinct with no overlap; Manpower has a soft cap to prevent stockpiling |
| Seeded RNG combat | Deterministic and reproducible; same seed = same battle outcome |
| JSON event library | Events can be authored without touching engine code; moddable in v2 |
| Archetype + modifier AI | Archetypes provide distinct behavioral templates; modifiers add individual variation without rewriting archetypes |
| Scenario-defined victory | Victory logic is not a special engine case; any scenario can define any objective type |
| Hard elimination + exile window | Elimination is definitive but creates a brief diplomatic opportunity (restore as independent NPC) |
