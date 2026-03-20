import type { GameState, Nation } from '../types';

// ── Tuneable constants ─────────────────────────────────────────────────────

/** Number of AI nation rows shown below the pinned player row. */
const TOP_AI_COUNT = 4;

/** Total army strength below this threshold → "Small". */
const ARMY_SMALL_THRESHOLD = 20;

/** Total army strength at or above this threshold → "Large". */
const ARMY_LARGE_THRESHOLD = 50;

// ── Types ──────────────────────────────────────────────────────────────────

type MilitaryLabel = 'None' | 'Small' | 'Medium' | 'Large';

interface NationRowData {
  nation: Nation;
  provinceCount: number;
  score: number;
  totalStrength: number;
  militaryLabel: MilitaryLabel;
  isPlayer: boolean;
  isLeader: boolean;
}

interface NationOverviewHUDProps {
  gameState: GameState;
  playerNationId: string;
  visible: boolean;
  onToggle: () => void;
}

// ── Pure helpers ───────────────────────────────────────────────────────────

/**
 * Compute the tiebreaker score for a nation.
 * Mirrors the formula in calculateNationScore() from src/engine/resolution.ts.
 * score = (Σ devLevel × 10 across owned provinces) + gold stockpile + (active agreements × 15)
 */
function computeScore(nation: Nation, gameState: GameState): number {
  const ownedProvinces = gameState.provinces.filter((p) => p.ownerId === nation.id);
  const devScore = ownedProvinces.reduce((sum, p) => sum + p.devLevel * 10, 0);
  const goldScore = nation.resources.gold;
  const agreementCount = Object.values(nation.agreements)
    .flat()
    .filter((a) => a.active).length;
  return devScore + goldScore + agreementCount * 15;
}

function militaryLabel(strength: number): MilitaryLabel {
  if (strength === 0) return 'None';
  if (strength < ARMY_SMALL_THRESHOLD) return 'Small';
  if (strength < ARMY_LARGE_THRESHOLD) return 'Medium';
  return 'Large';
}

/**
 * Build the ordered list of rows for the HUD.
 * Exported for unit testing.
 *
 * Row order:
 *   1. Player nation (pinned first)
 *   2. Up to TOP_AI_COUNT highest-scoring living AI nations
 */
export function computeHUDRows(
  gameState: GameState,
  playerNationId: string
): NationRowData[] {
  const living = gameState.nations.filter((n) => n.eliminatedOnTurn === undefined);

  // Build full row data for all living nations
  const allRows: NationRowData[] = living.map((nation) => {
    const provinceCount = gameState.provinces.filter(
      (p) => p.ownerId === nation.id
    ).length;
    const totalStrength = gameState.armies
      .filter((a) => a.ownerId === nation.id)
      .reduce((sum, a) => sum + a.strength, 0);
    const score = computeScore(nation, gameState);
    return {
      nation,
      provinceCount,
      score,
      totalStrength,
      militaryLabel: militaryLabel(totalStrength),
      isPlayer: nation.id === playerNationId,
      isLeader: false, // filled in below
    };
  });

  // Mark the overall leader (highest score)
  const maxScore = Math.max(...allRows.map((r) => r.score));
  for (const row of allRows) {
    if (row.score === maxScore) {
      row.isLeader = true;
      break; // only one leader
    }
  }

  // Sort by score descending for AI selection
  const sorted = [...allRows].sort((a, b) => b.score - a.score);

  const playerRow = allRows.find((r) => r.isPlayer);
  const aiRows = sorted
    .filter((r) => !r.isPlayer)
    .slice(0, TOP_AI_COUNT);

  const result: NationRowData[] = [];
  if (playerRow) result.push(playerRow);
  result.push(...aiRows);
  return result;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function NationOverviewHUD({
  gameState,
  playerNationId,
  visible,
  onToggle,
}: NationOverviewHUDProps) {
  const rows = computeHUDRows(gameState, playerNationId);

  return (
    <div className="hud">
      {/* Always-visible header with column labels + toggle */}
      <div className="hud__header">
        <span className="hud__label">Power Rankings</span>

        {/* Column label spacer mirrors row layout: swatch + name flex + stats */}
        <div className="hud__col-labels">
          {/* crown placeholder width */}
          <span style={{ width: '14px', flexShrink: 0 }} />
          {/* swatch placeholder */}
          <span style={{ width: '10px', flexShrink: 0 }} />
          {/* name: flex:1 */}
          <span style={{ flex: 1 }} />
          <span className="hud__col-label hud__stat--provs">Provs</span>
          <span className="hud__col-label hud__stat--score">Score</span>
          <span className="hud__col-label hud__stat--gold">Gold</span>
          <span className="hud__col-label hud__stat--army">Army</span>
        </div>

        <button
          className="hud__toggle"
          onClick={onToggle}
          title={visible ? 'Collapse HUD' : 'Expand HUD'}
        >
          {visible ? '▲' : '▼'}
        </button>
      </div>

      {/* Nation rows — only when expanded */}
      {visible && (
        <div className="hud__rows">
          {rows.map((row) => {
            const rowClass = [
              'hud__row',
              row.isPlayer ? 'hud__row--player' : '',
              row.isLeader ? 'hud__row--leader' : '',
            ]
              .filter(Boolean)
              .join(' ');

            const armyClass = [
              'hud__stat',
              'hud__stat--army',
              row.militaryLabel === 'Large'
                ? 'hud__stat--army--large'
                : row.militaryLabel === 'Medium'
                  ? 'hud__stat--army--medium'
                  : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <div key={row.nation.id} className={rowClass}>
                {/* Crown for current leader */}
                <span className="hud__crown">
                  {row.isLeader ? '★' : ''}
                </span>

                {/* Nation color swatch */}
                <span
                  className="hud__swatch"
                  style={{ background: row.nation.color }}
                />

                {/* Name + YOU badge */}
                <span
                  className={`hud__name${row.isPlayer ? ' hud__name--player' : ''}`}
                >
                  {row.nation.name}
                  {row.isPlayer && (
                    <span className="hud__you-badge">you</span>
                  )}
                </span>

                {/* Province count */}
                <span className="hud__stat hud__stat--provs">
                  {row.provinceCount}
                </span>

                {/* Score */}
                <span className="hud__stat hud__stat--score">
                  {row.score}
                </span>

                {/* Gold stockpile */}
                <span className="hud__stat hud__stat--gold">
                  {row.nation.resources.gold}
                </span>

                {/* Military indicator */}
                <span className={armyClass}>
                  {row.militaryLabel}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
