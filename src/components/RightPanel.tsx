import { useState } from 'react';
import type {
  Province,
  Nation,
  Army,
  Edge,
  Order,
  ActionBudget,
  ProvinceFocus,
  Scenario,
} from '../types';
import { getBuildings, getProvinceOutput } from '../engine/economics';
import { queuedOrderFeedback } from './dialogText';

export interface RightPanelProps {
  province: Province;
  nations: Nation[];
  armies: Army[];
  edges: Edge[];
  playerNationId: string;
  budget: ActionBudget;
  scenario: Scenario;
  onClose: () => void;
  onQueueOrder: (order: Order) => void;
}

/** Get the owner nation for a province */
function getOwnerNation(province: Province, nations: Nation[]): Nation | null {
  if (!province.ownerId || province.ownerId === 'rebel') return null;
  return nations.find((n) => n.id === province.ownerId) ?? null;
}

/** Get armies stationed in this province */
function getProvArmies(provinceId: string, armies: Army[]): Army[] {
  return armies.filter((a) => a.provinceId === provinceId);
}

/** Resolve a province ID to its display name, falling back to the ID if not found */
function getProvinceName(id: string, provinces: Province[]): string {
  return provinces.find((p) => p.id === id)?.name ?? id;
}

/** Get adjacent province IDs from edges */
function getAdjacentIds(provinceId: string, edges: Edge[]): string[] {
  const ids: string[] = [];
  for (const e of edges) {
    if (e.sourceId === provinceId) ids.push(e.targetId);
    if (e.targetId === provinceId) ids.push(e.sourceId);
  }
  return ids;
}

/** Format an unrest color based on level */
function unrestColor(unrest: number): string {
  if (unrest >= 70) return '#ef5350';
  if (unrest >= 40) return '#e6a023';
  if (unrest > 10) return '#f5c842';
  return '#3d9948';
}

const FOCUS_OPTIONS: ProvinceFocus[] = ['Agricultural', 'Industrial', 'Commercial', 'Military'];

export default function RightPanel({
  province,
  nations,
  armies,
  edges,
  playerNationId,
  budget,
  scenario,
  onClose,
  onQueueOrder,
}: RightPanelProps) {
  const owner = getOwnerNation(province, nations);
  const provArmies = getProvArmies(province.id, armies);
  const buildings = getBuildings(province.devLevel, province.focus);
  const output = getProvinceOutput(province, scenario);
  const adjacentIds = getAdjacentIds(province.id, edges);
  const isPlayerOwned = province.ownerId === playerNationId;
  const playerArmies = provArmies.filter((a) => a.ownerId === playerNationId);

  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const [isClosing, setIsClosing] = useState(false);

  function handleClose() {
    setIsClosing(true);
  }

  function handleAnimationEnd() {
    if (isClosing) {
      setIsClosing(false); // reset for safety before unmount
      onClose();
    }
  }

  function handleQueueOrder(order: Order) {
    setLastFeedback(queuedOrderFeedback(order, nations, scenario.world.provinces));
    onQueueOrder(order);
  }

  const diploRemaining = budget.diplomatic - budget.diplomaticUsed;
  const constRemaining = budget.construction - budget.constructionUsed;
  const milRemaining = budget.military - budget.militaryUsed;
  const wildRemaining = budget.wildcard - budget.wildcardUsed;

  return (
    <div
      className={`rightpanel-overlay${isClosing ? ' rightpanel-overlay--closing' : ''}`}
      onAnimationEnd={handleAnimationEnd}
    >
      <div className="rightpanel__header">
        <span className="rightpanel__title">{province.name}</span>
        <button className="rightpanel__close" onClick={handleClose}>
          &times;
        </button>
      </div>

      <div className="rightpanel__body">
        {/* ── Province Info ── */}
        <div className="rightpanel__section">
          <span className="rightpanel__section-title">Province Details</span>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Owner</span>
            {owner ? (
              <span className="rightpanel__owner-badge">
                <span
                  className="rightpanel__owner-dot"
                  style={{ background: owner.color }}
                />
                {owner.name}
              </span>
            ) : (
              <span className="rightpanel__row-value">
                {province.ownerId === 'rebel' ? 'Rebels' : 'Unowned'}
              </span>
            )}
          </div>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Terrain</span>
            <span className="rightpanel__row-value">{province.terrain}</span>
          </div>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Dev Level</span>
            <span className="rightpanel__row-value">{province.devLevel} / 5</span>
          </div>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Focus</span>
            <span className="rightpanel__row-value">
              {province.focus ?? 'None'}
            </span>
          </div>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Population</span>
            <span className="rightpanel__row-value">{province.population}</span>
          </div>

          <div className="rightpanel__row">
            <span className="rightpanel__row-label">Fort Level</span>
            <span className="rightpanel__row-value">{province.fortLevel} / 3</span>
          </div>

          {province.strategicTag && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Strategic</span>
              <span className="rightpanel__row-value">{province.strategicTag}</span>
            </div>
          )}
        </div>

        {/* ── Unrest ── */}
        <div className="rightpanel__section">
          <span className="rightpanel__section-title">
            Unrest: {province.unrest}
          </span>
          <div className="rightpanel__unrest-bar">
            <div
              className="rightpanel__unrest-fill"
              style={{
                width: `${Math.min(province.unrest, 100)}%`,
                background: unrestColor(province.unrest),
              }}
            />
          </div>
        </div>

        {isPlayerOwned && province.unrest >= 50 && (
          <div className="rightpanel__unrest-warning">
            ⚠ High unrest — risk of rebellion
          </div>
        )}

        {/* ── Output ── */}
        <div className="rightpanel__section">
          <span className="rightpanel__section-title">Output</span>
          {output.gold > 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Gold</span>
              <span className="rightpanel__row-value" style={{ color: 'var(--gold)' }}>
                +{output.gold}
              </span>
            </div>
          )}
          {output.food > 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Food</span>
              <span className="rightpanel__row-value" style={{ color: 'var(--food)' }}>
                +{output.food}
              </span>
            </div>
          )}
          {output.production > 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Production</span>
              <span className="rightpanel__row-value" style={{ color: 'var(--production)' }}>
                +{output.production}
              </span>
            </div>
          )}
          {output.manpower > 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Manpower</span>
              <span className="rightpanel__row-value" style={{ color: 'var(--manpower)' }}>
                +{output.manpower}
              </span>
            </div>
          )}
          {output.influence > 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label">Influence</span>
              <span className="rightpanel__row-value" style={{ color: 'var(--influence)' }}>
                +{output.influence}
              </span>
            </div>
          )}
          {output.gold === 0 && output.food === 0 && output.production === 0 &&
           output.manpower === 0 && output.influence === 0 && (
            <div className="rightpanel__row">
              <span className="rightpanel__row-label" style={{ fontStyle: 'italic' }}>
                No output
              </span>
            </div>
          )}
        </div>

        {/* ── Buildings ── */}
        <div className="rightpanel__section">
          <span className="rightpanel__section-title">Buildings</span>
          <div className="rightpanel__buildings">
            {buildings.length === 0 ? (
              <span className="rightpanel__building">None</span>
            ) : (
              buildings.map((b, i) => (
                <div key={i} className="rightpanel__building">
                  <span className="rightpanel__building-name">{b.name}</span>
                  {' \u2014 '}
                  {b.description}
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Armies ── */}
        {provArmies.length > 0 && (
          <div className="rightpanel__section">
            <span className="rightpanel__section-title">Armies</span>
            <div className="rightpanel__armies">
              {provArmies.map((army) => {
                const armyNation = nations.find((n) => n.id === army.ownerId);
                return (
                  <div key={army.id} className="rightpanel__army">
                    <span
                      className="rightpanel__owner-dot"
                      style={{ background: armyNation?.color ?? '#666' }}
                    />
                    <span className="rightpanel__army-type">
                      {army.type === 'Land' ? '\u2694' : '\u2693'} {army.type}
                    </span>
                    <span className="rightpanel__army-strength">
                      Str: {army.strength}
                    </span>
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      ({armyNation?.name ?? army.ownerId})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <hr className="rightpanel__divider" />

        {/* ── Actions ── */}
        <div className="rightpanel__section">
          <span className="rightpanel__section-title">Actions</span>
          <div className="rightpanel__actions">
            {lastFeedback && (
              <div className="rightpanel__feedback">{lastFeedback}</div>
            )}

            {/* Rebel province callout */}
            {province.ownerId === 'rebel' && (
              <div className="rightpanel__rebel-callout">
                <strong>Open Rebellion</strong>
                <p>
                  This province revolted after unrest reached 100. It produces
                  nothing and spreads unrest to adjacent provinces while under
                  rebel control.
                </p>
                <p>
                  To reclaim it, move a friendly army into this province from an
                  adjacent territory. A garrisoned army will reduce unrest by 5
                  per turn.
                </p>
                <div className="rightpanel__rebel-stats">
                  <span>Unrest: <strong>{province.unrest}</strong></span>
                  <span>Fort Level: <strong>{province.fortLevel} / 3</strong></span>
                </div>
              </div>
            )}

            {/* Construction actions — only for player-owned provinces */}
            {isPlayerOwned && (
              <>
                {province.devLevel < 5 && (
                  <button
                    className="rightpanel__action-btn"
                    disabled={constRemaining <= 0}
                    onClick={() =>
                      handleQueueOrder({
                        type: 'upgrade_dev',
                        nationId: playerNationId,
                        provinceId: province.id,
                      })
                    }
                  >
                    Upgrade Development (Lv {province.devLevel} → {province.devLevel + 1})
                    <div className="rightpanel__action-cost">
                      Construction action &middot; Gold + Production cost
                    </div>
                  </button>
                )}

                {province.devLevel >= 2 &&
                  FOCUS_OPTIONS.filter((f) => f !== province.focus).map((focus) => (
                    <button
                      key={focus}
                      className="rightpanel__action-btn"
                      disabled={constRemaining <= 0}
                      onClick={() =>
                        handleQueueOrder({
                          type: 'set_focus',
                          nationId: playerNationId,
                          provinceId: province.id,
                          focus,
                        })
                      }
                    >
                      Set Focus: {focus}
                      <div className="rightpanel__action-cost">Construction action</div>
                    </button>
                  ))}

                {province.fortLevel < 3 && (
                  <button
                    className="rightpanel__action-btn"
                    disabled={constRemaining <= 0}
                    onClick={() =>
                      handleQueueOrder({
                        type: 'build_fort',
                        nationId: playerNationId,
                        provinceId: province.id,
                      })
                    }
                  >
                    Build Fort (Lv {province.fortLevel} → {province.fortLevel + 1})
                    <div className="rightpanel__action-cost">
                      Construction action &middot; Production cost
                    </div>
                  </button>
                )}
              </>
            )}

            {/* Military actions — move player armies from this province */}
            {playerArmies.length > 0 &&
              adjacentIds.map((adjId) => (
                playerArmies.map((army) => (
                  <button
                    key={`move-${army.id}-${adjId}`}
                    className="rightpanel__action-btn"
                    disabled={milRemaining <= 0}
                    onClick={() =>
                      handleQueueOrder({
                        type: 'move_army',
                        nationId: playerNationId,
                        armyId: army.id,
                        fromProvinceId: province.id,
                        toProvinceId: adjId,
                      })
                    }
                  >
                    Move {army.type} ({army.strength}) → {getProvinceName(adjId, scenario.world.provinces)}
                    <div className="rightpanel__action-cost">Military action</div>
                  </button>
                ))
              ))}

            {/* Diplomatic actions — when viewing a foreign province */}
            {!isPlayerOwned && owner && province.ownerId !== 'rebel' && (
              <>
                <button
                  className="rightpanel__action-btn"
                  disabled={diploRemaining <= 0}
                  onClick={() =>
                    handleQueueOrder({
                      type: 'propose_agreement',
                      nationId: playerNationId,
                      targetNationId: owner.id,
                      agreementType: 'TradeDeal',
                    })
                  }
                >
                  Propose Trade Deal with {owner.name}
                  <div className="rightpanel__action-cost">Diplomatic action</div>
                </button>
                <button
                  className="rightpanel__action-btn"
                  disabled={diploRemaining <= 0}
                  onClick={() =>
                    handleQueueOrder({
                      type: 'propose_agreement',
                      nationId: playerNationId,
                      targetNationId: owner.id,
                      agreementType: 'NonAggressionPact',
                    })
                  }
                >
                  Propose NAP with {owner.name}
                  <div className="rightpanel__action-cost">Diplomatic action</div>
                </button>
                <button
                  className="rightpanel__action-btn"
                  disabled={diploRemaining <= 0}
                  onClick={() =>
                    handleQueueOrder({
                      type: 'propose_agreement',
                      nationId: playerNationId,
                      targetNationId: owner.id,
                      agreementType: 'MilitaryAlliance',
                    })
                  }
                >
                  Propose Alliance with {owner.name}
                  <div className="rightpanel__action-cost">Diplomatic action</div>
                </button>
                <button
                  className="rightpanel__action-btn"
                  disabled={diploRemaining <= 0}
                  onClick={() =>
                    handleQueueOrder({
                      type: 'declare_war',
                      nationId: playerNationId,
                      targetNationId: owner.id,
                    })
                  }
                >
                  Declare War on {owner.name}
                  <div className="rightpanel__action-cost">Diplomatic action</div>
                </button>
                <button
                  className="rightpanel__action-btn"
                  disabled={diploRemaining <= 0}
                  onClick={() =>
                    handleQueueOrder({
                      type: 'offer_peace',
                      nationId: playerNationId,
                      targetNationId: owner.id,
                    })
                  }
                >
                  Offer Peace to {owner.name}
                  <div className="rightpanel__action-cost">Diplomatic action</div>
                </button>
              </>
            )}

            {/* Wildcard: Spy on foreign nation */}
            {!isPlayerOwned && owner && province.ownerId !== 'rebel' && (
              <button
                className="rightpanel__action-btn"
                disabled={wildRemaining <= 0}
                onClick={() =>
                  handleQueueOrder({
                    type: 'spy',
                    nationId: playerNationId,
                    targetNationId: owner.id,
                    intelTrack: 'military',
                  })
                }
              >
                Spy on {owner.name} (Military Intel)
                <div className="rightpanel__action-cost">Wildcard action</div>
              </button>
            )}

            {/* No actions available message */}
            {!isPlayerOwned && !owner && province.ownerId !== 'rebel' && playerArmies.length === 0 && (
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No actions available for this province
              </span>
            )}
          </div>
        </div>

        {/* ── Owner Nation Relations (if foreign) ── */}
        {owner && owner.id !== playerNationId && (
          <div className="rightpanel__section">
            <span className="rightpanel__section-title">
              Relations with {owner.name}
            </span>
            <div className="rightpanel__nation-relations">
              {(() => {
                const playerNation = nations.find((n) => n.id === playerNationId);
                const relation = playerNation?.relations[owner.id] ?? 0;
                const className =
                  relation > 0
                    ? 'rightpanel__relation-value--positive'
                    : relation < 0
                      ? 'rightpanel__relation-value--negative'
                      : 'rightpanel__relation-value--neutral';
                return (
                  <div className="rightpanel__relation-row">
                    <span className="rightpanel__relation-name">Your relation</span>
                    <span className={className}>
                      {relation > 0 ? '+' : ''}{relation}
                    </span>
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
