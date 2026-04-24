# Realms of Iron

A browser-based grand strategy game built with React and TypeScript. Lead a nation to glory through diplomacy, economic management, and military conquest in a fractured continent where ancient empires have fallen.

No backend. No API calls. Runs entirely in the browser.

![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue)
![React](https://img.shields.io/badge/React-19-61dafb)
![License](https://img.shields.io/badge/License-MIT-green)

## Features

- **WEGO simultaneous resolution** — all nations act on the same information each turn, with a priority system for resolving conflicts
- **10 unique factions** with distinct archetypes (Expansionist, Trader, Isolationist, Hegemon) and behavioral modifiers
- **Utility-based AI** — NPC nations generate orders using archetype weights, modifier functions, and agenda-driven scoring
- **5 resource economy** — Gold, Food, Production, Influence, and Manpower, each with distinct mechanics and soft caps
- **Diplomacy system** — Trade Deals, Non-Aggression Pacts, Military Alliances, and Vassalage with relation tracking and intel
- **Deterministic combat** — seeded RNG ensures reproducible battle outcomes
- **JSON-driven events** — 9 generic events (rebellion, plague, war exhaustion, etc.) triggered by game conditions
- **Province development** — 5 dev levels, 4 focus specializations, derived buildings, and fortifications
- **Save/load** — autosave to localStorage with JSON export/import

## Getting Started

```bash
# Install dependencies
npm install

# Start the dev server
npm run dev

# Run tests (181 unit tests)
npm test

# Production build
npm run build
```

## Tech Stack

| Tool | Choice |
|---|---|
| Language | TypeScript (strict mode) |
| Framework | React 19 — functional components and hooks only |
| Icons | Lucide React |
| Map | SVG rendered inside React |
| Bundler | Vite |
| Tests | Vitest |
| Persistence | localStorage + JSON export/import |

## Project Structure

```
src/
  types/          — All TypeScript interfaces (province, nation, orders, events, etc.)
  engine/         — Pure game logic (resolution, combat, economics, diplomacy, events)
  ai/             — NPC decision-making (archetypes, modifiers, order generation)
  components/     — React UI (Map, TopBar, BottomBar, RightPanel, modals, etc.)
  scenarios/      — Scenario JSON (The Shattered Kingdoms — 10 nations, 45 provinces)
  events/         — Generic event JSON files
  useGameLoop.ts  — Core game loop hook (state, orders, budget, turn resolution)
  persistence.ts  — Save/load (only module that touches localStorage)
  initGame.ts     — Scenario → GameState initialization
  validateScenario.ts — Schema + cross-reference validation
```

## How to Play

1. Start a new game and choose one of 10 nations
2. Each turn, queue orders across four categories: Diplomatic, Military, Construction, and Wildcard
3. Click **End Turn** — all nations resolve simultaneously
4. Review the turn summary, then plan your next move
5. Achieve the scenario's victory condition before the turn limit

Use the **Hints** button for gameplay tips and the **Suggestions** button for strategic advice based on your current situation.

## License

[MIT](LICENSE)
