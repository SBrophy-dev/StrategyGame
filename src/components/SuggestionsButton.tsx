import { useState, useMemo } from 'react';
import type { GameState, ActionBudget, Province } from '../types';
import type { GameIconName } from './GameIcon';
import GameIcon from './GameIcon';
import { getProvinceOutput, getArmyFoodConsumption, getInfluenceSoftCap, getManpowerSoftCap } from '../engine/economics';

export interface SuggestionsButtonProps {
  gameState: GameState;
  playerNationId: string;
  budget: ActionBudget;
}

interface Suggestion {
  icon: GameIconName;
  title: string;
  detail: string;
  category: 'urgent' | 'warning' | 'opportunity' | 'info';
}

function getProvinceName(id: string, provinces: Province[]): string {
  return provinces.find((p) => p.id === id)?.name ?? id;
}

function generateSuggestions(state: GameState, playerNationId: string, budget: ActionBudget): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const { provinces, edges, nations, armies, scenario, wars } = state;
  const playerNation = nations.find((n) => n.id === playerNationId);
  if (!playerNation) return suggestions;

  const playerProvinces = provinces.filter((p) => p.ownerId === playerNationId);
  const otherNations = nations.filter((n) => n.id !== playerNationId && n.eliminatedOnTurn === undefined);

  // ── Urgent: High unrest provinces ──
  const highUnrestProvinces = playerProvinces
    .filter((p) => p.unrest >= 50)
    .sort((a, b) => b.unrest - a.unrest);

  for (const p of highUnrestProvinces.slice(0, 3)) {
    const hasGarrison = armies.some((a) => a.provinceId === p.id && a.ownerId === playerNationId);
    if (p.unrest >= 80) {
      suggestions.push({
        icon: 'warning',
        title: `${p.name} is on the brink of rebellion (${p.unrest} unrest)`,
        detail: hasGarrison
          ? 'Move additional armies here or consider upgrading development for stability.'
          : 'Garrison a friendly army here immediately to reduce unrest by 5 per turn.',
        category: 'urgent',
      });
    } else {
      suggestions.push({
        icon: 'warning',
        title: `${p.name} has rising unrest (${p.unrest})`,
        detail: hasGarrison
          ? 'A garrison is present but unrest is still climbing. Consider development upgrades.'
          : 'Station a friendly army here to reduce unrest by 5 per turn before it gets worse.',
        category: 'warning',
      });
    }
  }

  // ── Urgent: Rebel provinces adjacent to player ──
  const adjacentToPlayer = new Set<string>();
  for (const edge of edges) {
    const src = provinces.find((p) => p.id === edge.sourceId);
    const tgt = provinces.find((p) => p.id === edge.targetId);
    if (src?.ownerId === playerNationId && tgt?.ownerId === 'rebel') adjacentToPlayer.add(tgt.id);
    if (tgt?.ownerId === playerNationId && src?.ownerId === 'rebel') adjacentToPlayer.add(src.id);
  }
  for (const rebelId of adjacentToPlayer) {
    const rebel = provinces.find((p) => p.id === rebelId);
    if (rebel) {
      suggestions.push({
        icon: 'land-army',
        title: `${rebel.name} is in rebellion and spreading unrest to your provinces`,
        detail: 'Move an army into this province to reclaim it. Rebel provinces spread +5 unrest to all adjacent owned provinces each turn.',
        category: 'urgent',
      });
    }
  }

  // ── Warning: Ungarrisoned provinces ──
  const ungarrisoned = playerProvinces.filter(
    (p) => !armies.some((a) => a.provinceId === p.id && a.ownerId === playerNationId)
  );
  if (ungarrisoned.length > 0 && budget.military - budget.militaryUsed > 0) {
    const count = ungarrisoned.length;
    const sample = ungarrisoned.slice(0, 3).map((p) => p.name).join(', ');
    suggestions.push({
      icon: 'land-army',
      title: `${count} province${count > 1 ? 's' : ''} without a garrison`,
      detail: `Ungarrisoned provinces gain +2 unrest per turn. Affected: ${sample}${count > 3 ? ', and more' : ''}.`,
      category: 'warning',
    });
  }

  // ── Warning: Food deficit ──
  const playerArmies = armies.filter((a) => a.ownerId === playerNationId);
  const foodIncome = playerProvinces.reduce((sum, p) => sum + getProvinceOutput(p, scenario).food, 0);
  const foodConsumption = getArmyFoodConsumption(playerNationId, playerArmies);
  const netFood = playerNation.resources.food + foodIncome - foodConsumption;
  if (netFood < 0) {
    suggestions.push({
      icon: 'food',
      title: `Food deficit: ${netFood} food per turn`,
      detail: `Your armies consume ${foodConsumption} food but you only produce ${foodIncome}. Set provinces to Agricultural focus or disband weak armies to survive.`,
      category: 'urgent',
    });
  } else if (netFood < 10 && playerArmies.length > 0) {
    suggestions.push({
      icon: 'food',
      title: `Food is running low (${netFood} surplus)`,
      detail: 'Consider setting more provinces to Agricultural focus to ensure your armies can be fed.',
      category: 'warning',
    });
  }

  // ── Warning: Influence over cap ──
  const influenceCap = getInfluenceSoftCap(playerNation);
  if (playerNation.resources.influence > influenceCap) {
    const excess = playerNation.resources.influence - influenceCap;
    suggestions.push({
      icon: 'influence',
      title: `Influence exceeds soft cap (${playerNation.resources.influence} / ${influenceCap})`,
      detail: `You're losing ${Math.ceil(excess * 0.1)} influence per turn. Spend it on proposals or sign more Trade Deals (+5 cap each) to avoid waste.`,
      category: 'warning',
    });
  }

  // ── Warning: Manpower at cap ──
  const manpowerCap = getManpowerSoftCap(playerNationId, provinces);
  if (playerNation.resources.manpower >= manpowerCap - 2 && manpowerCap > 0) {
    suggestions.push({
      icon: 'manpower',
      title: `Manpower at cap (${playerNation.resources.manpower} / ${manpowerCap})`,
      detail: 'Manpower is capped by your provinces\' population and dev level. Raise armies or upgrade provinces to increase the cap.',
      category: 'warning',
    });
  }

  // ── Warning: At war with strong neighbor ──
  for (const war of wars) {
    const enemyId = war.aggressorId === playerNationId ? war.defenderId
      : war.defenderId === playerNationId ? war.aggressorId : null;
    if (!enemyId) continue;
    const enemy = nations.find((n) => n.id === enemyId);
    if (!enemy) continue;
    const enemyArmies = armies.filter((a) => a.ownerId === enemyId);
    const playerArmiesStr = playerArmies.reduce((s, a) => s + a.strength, 0);
    const enemyArmiesStr = enemyArmies.reduce((s, a) => s + a.strength, 0);
    if (enemyArmiesStr > playerArmiesStr * 1.3) {
      suggestions.push({
        icon: 'manpower',
        title: `${enemy.name} has a stronger military (Str ${enemyArmiesStr} vs ${playerArmiesStr})`,
        detail: 'Consider hiring mercenaries, building forts, or offering peace to avoid costly defeats.',
        category: 'urgent',
      });
    }
  }

  // ── Opportunity: Friendly relations for alliance ──
  for (const nation of otherNations) {
    const relation = playerNation.relations[nation.id] ?? 0;
    const hasAlliance = (playerNation.agreements[nation.id] ?? []).some(
      (a) => a.type === 'MilitaryAlliance' && a.active
    );
    const hasTrade = (playerNation.agreements[nation.id] ?? []).some(
      (a) => a.type === 'TradeDeal' && a.active
    );

    if (relation > 50 && !hasAlliance && budget.diplomatic - budget.diplomaticUsed > 0) {
      suggestions.push({
        icon: 'diplomacy',
        title: `${nation.name} has high relations (+${relation}) — alliance possible`,
        detail: 'Relations above 50 allow alliance proposals. Allied nations auto-join your wars.',
        category: 'opportunity',
      });
    }

    if (relation > 10 && !hasTrade && !hasAlliance && budget.diplomatic - budget.diplomaticUsed > 0) {
      suggestions.push({
        icon: 'gold',
        title: `${nation.name} is open to a Trade Deal (relation +${relation})`,
        detail: 'Trade Deals activate shared-border routes for gold bonuses and raise your influence cap.',
        category: 'opportunity',
      });
    }

    if (relation < -30 && !wars.some((w) =>
      (w.aggressorId === playerNationId && w.defenderId === nation.id) ||
      (w.defenderId === playerNationId && w.aggressorId === nation.id)
    )) {
      suggestions.push({
        icon: 'manpower',
        title: `${nation.name} has very negative relations (${relation})`,
        detail: 'Negative relations allow war declarations. Consider if a preemptive strike or a NAP would serve you better.',
        category: 'info',
      });
    }
  }

  // ── Opportunity: Upgradeable provinces ──
  const upgradable = playerProvinces.filter((p) => p.devLevel < 5);
  if (upgradable.length > 0 && budget.construction - budget.constructionUsed > 0) {
    const best = upgradable.sort((a, b) => b.devLevel - a.devLevel)[0];
    suggestions.push({
      icon: 'production',
      title: `${best.name} can be upgraded (Dev ${best.devLevel} \u2192 ${best.devLevel + 1})`,
      detail: 'Higher dev levels dramatically increase resource output and provide stability bonuses at level 3+.',
      category: 'opportunity',
    });
  }

  // ── Opportunity: Unfocused provinces at Dev 2+ ──
  const unfocused = playerProvinces.filter((p) => p.devLevel >= 2 && p.focus === null);
  if (unfocused.length > 0 && budget.construction - budget.constructionUsed > 0) {
    suggestions.push({
      icon: 'production',
      title: `${unfocused.length} province${unfocused.length > 1 ? 's' : ''} at Dev 2+ with no focus set`,
      detail: `Set a focus (Agricultural, Industrial, Commercial, or Military) to specialize output. Affected: ${unfocused.map((p) => p.name).join(', ')}.`,
      category: 'opportunity',
    });
  }

  // ── Opportunity: Unprotected valuable provinces ──
  const unfortified = playerProvinces.filter(
    (p) => p.fortLevel === 0 && p.devLevel >= 3 && !armies.some((a) => a.provinceId === p.id && a.ownerId === playerNationId)
  );
  if (unfortified.length > 0 && budget.construction - budget.constructionUsed > 0) {
    suggestions.push({
      icon: 'fortification',
      title: `High-value province${unfortified.length > 1 ? 's' : ''} undefended: ${unfortified[0].name}`,
      detail: 'Build forts or garrison armies to protect valuable provinces from easy capture.',
      category: 'opportunity',
    });
  }

  // ── Info: Victory progress ──
  const vc = scenario.meta.victoryConditions;
  if (vc.primaryObjective.type === 'control_regions') {
    const targetIds = vc.primaryObjective.regions;
    const held = targetIds.filter((id) => provinces.find((p) => p.id === id)?.ownerId === playerNationId);
    if (held.length === targetIds.length) {
      suggestions.push({
        icon: 'victory',
        title: `You control all ${targetIds.length} objective regions!`,
        detail: `Hold them for ${vc.primaryObjective.turnsHeld} consecutive turns to win. Defend them at all costs.`,
        category: 'info',
      });
    } else {
      suggestions.push({
        icon: 'victory',
        title: `Victory: controlling ${held.length} / ${targetIds.length} objective regions`,
        detail: `You need to control ${targetIds.map((id) => getProvinceName(id, provinces)).join(', ')} for ${vc.primaryObjective.turnsHeld} turns.`,
        category: 'info',
      });
    }
  } else if (vc.primaryObjective.type === 'domination') {
    const threshold = Math.ceil(vc.primaryObjective.threshold * provinces.length);
    suggestions.push({
      icon: 'victory',
      title: `Victory: you control ${playerProvinces.length} / ${threshold} provinces for domination`,
      detail: `Domination requires controlling ${Math.round(vc.primaryObjective.threshold * 100)}% of all provinces.`,
      category: 'info',
    });
  }

  // ── Info: Turns remaining ──
  const turnsLeft = scenario.meta.turnLimit - state.turn;
  if (turnsLeft <= 5 && turnsLeft > 0) {
    suggestions.push({
      icon: 'timer',
      title: `Only ${turnsLeft} turns remaining!`,
      detail: 'Focus on your victory objective. Aggressive plays may be needed to secure a win before time runs out.',
      category: turnsLeft <= 2 ? 'urgent' : 'warning',
    });
  }

  // ── Info: Unused action budget ──
  const remaining = {
    diplo: budget.diplomatic - budget.diplomaticUsed,
    mil: budget.military - budget.militaryUsed,
    con: budget.construction - budget.constructionUsed,
    wild: budget.wildcard - budget.wildcardUsed,
  };
  const unusedCategories = [
    remaining.diplo > 0 ? `${remaining.diplo} diplomatic` : '',
    remaining.mil > 0 ? `${remaining.mil} military` : '',
    remaining.con > 0 ? `${remaining.con} construction` : '',
    remaining.wild > 0 ? `${remaining.wild} wildcard` : '',
  ].filter(Boolean);

  if (unusedCategories.length > 0) {
    suggestions.push({
      icon: 'action-budget',
      title: `Unused actions: ${unusedCategories.join(', ')}`,
      detail: 'You have actions remaining this turn. Use them before ending the turn to maximize your advantage.',
      category: 'info',
    });
  }

  return suggestions;
}

const CATEGORY_ORDER: Suggestion['category'][] = ['urgent', 'warning', 'opportunity', 'info'];
const CATEGORY_LABELS: Record<Suggestion['category'], string> = {
  urgent: 'Urgent',
  warning: 'Warning',
  opportunity: 'Opportunity',
  info: 'Info',
};
const CATEGORY_COLORS: Record<Suggestion['category'], string> = {
  urgent: '#e84055',
  warning: '#f0a830',
  opportunity: '#38b854',
  info: '#3d7fd4',
};

export default function SuggestionsButton({ gameState, playerNationId, budget }: SuggestionsButtonProps) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(
    () => generateSuggestions(gameState, playerNationId, budget),
    [gameState, playerNationId, budget]
  );

  const grouped = useMemo(() => CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      label: CATEGORY_LABELS[cat],
      color: CATEGORY_COLORS[cat],
      items: suggestions.filter((s) => s.category === cat),
    }))
    .filter((g) => g.items.length > 0), [suggestions]);

  return (
    <>
      <button
        className="suggestions-btn"
        onClick={() => setOpen(true)}
        title="Strategic Suggestions"
      >
        <GameIcon name="suggestions" size={14} /> Suggestions
        {suggestions.filter((s) => s.category === 'urgent').length > 0 && (
          <span className="suggestions-btn__badge">
            {suggestions.filter((s) => s.category === 'urgent').length}
          </span>
        )}
      </button>

      {open && (
        <div className="hints-backdrop" onClick={() => setOpen(false)}>
          <div className="hints-modal" onClick={(e) => e.stopPropagation()}>
            <div className="hints-modal__header">
              <span className="hints-modal__title">Strategic Suggestions</span>
              <button className="hints-modal__close" onClick={() => setOpen(false)}>
                <GameIcon name="close" size={16} />
              </button>
            </div>

            <div className="suggestions-modal__body">
              {suggestions.length === 0 ? (
                <div className="suggestions-modal__empty">
                  No suggestions right now. Your position looks stable.
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.category} className="suggestions-modal__group">
                    <div
                      className="suggestions-modal__group-label"
                      style={{ color: group.color }}
                    >
                      <span className="suggestions-modal__group-dot" style={{ background: group.color }} />
                      {group.label}
                    </div>
                    {group.items.map((s, i) => (
                      <div
                        key={i}
                        className="suggestions-modal__item"
                        style={{ borderLeftColor: group.color }}
                      >
                        <div className="suggestions-modal__item-title">
                          <span className="suggestions-modal__item-icon">
                            <GameIcon name={s.icon} size={14} />
                          </span>
                          {s.title}
                        </div>
                        <div className="suggestions-modal__item-detail">{s.detail}</div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
