import type { Order, ActionBudget, Nation } from '../types';
import GameIcon from './GameIcon';

export interface BottomBarProps {
  orders: Order[];
  budget: ActionBudget;
  nations: Nation[];
  onRemoveOrder: (index: number) => void;
  onEndTurn: () => void;
  gameOver: boolean;
}

/** Determine the category of an order for chip styling */
function getOrderCategory(order: Order): 'diplomatic' | 'military' | 'construction' | 'wildcard' {
  switch (order.type) {
    case 'propose_agreement':
    case 'break_agreement':
    case 'declare_war':
    case 'offer_peace':
      return 'diplomatic';
    case 'move_army':
    case 'retreat':
    case 'blockade':
      return 'military';
    case 'upgrade_dev':
    case 'set_focus':
    case 'build_fort':
      return 'construction';
    case 'spy':
    case 'restore_nation':
    case 'hire_mercenaries':
      return 'wildcard';
  }
}

/** Human-readable short label for an order */
function getOrderLabel(order: Order, nations: Nation[]): string {
  const nationName = (id: string) => nations.find((n) => n.id === id)?.name ?? id;

  switch (order.type) {
    case 'propose_agreement':
      return `${order.agreementType} \u2192 ${nationName(order.targetNationId)}`;
    case 'break_agreement':
      return `Break ${order.agreementType} with ${nationName(order.targetNationId)}`;
    case 'declare_war':
      return `War \u2192 ${nationName(order.targetNationId)}`;
    case 'offer_peace':
      return `Peace \u2192 ${nationName(order.targetNationId)}`;
    case 'move_army':
      return `Move army \u2192 ${order.toProvinceId}`;
    case 'retreat':
      return `Retreat \u2192 ${order.toProvinceId}`;
    case 'blockade':
      return `Blockade ${order.edgeSourceId}-${order.edgeTargetId}`;
    case 'upgrade_dev':
      return `Upgrade ${order.provinceId}`;
    case 'set_focus':
      return `Focus: ${order.focus} @ ${order.provinceId}`;
    case 'build_fort':
      return `Fort @ ${order.provinceId}`;
    case 'spy':
      return `Spy ${order.intelTrack} on ${nationName(order.targetNationId)}`;
    case 'restore_nation':
      return `Restore ${nationName(order.targetNationId)}`;
    case 'hire_mercenaries':
      return `Hire Mercs (${order.goldCost}g)`;
  }
}

export default function BottomBar({
  orders,
  budget,
  nations,
  onRemoveOrder,
  onEndTurn,
  gameOver,
}: BottomBarProps) {
  const diploRemaining = budget.diplomatic - budget.diplomaticUsed;
  const milRemaining = budget.military - budget.militaryUsed;
  const constRemaining = budget.construction - budget.constructionUsed;
  const wildRemaining = budget.wildcard - budget.wildcardUsed;

  return (
    <div className="bottombar">
      <div className="bottombar__orders">
        {orders.length === 0 ? (
          <span className="bottombar__empty">No orders queued</span>
        ) : (
          orders.map((order, idx) => {
            const category = getOrderCategory(order);
            return (
              <span
                key={idx}
                className={`bottombar__order-chip bottombar__order-chip--${category}`}
              >
                {getOrderLabel(order, nations)}
                <button
                  className="bottombar__order-remove"
                  onClick={() => onRemoveOrder(idx)}
                  title="Remove order"
                >
                  <GameIcon name="close" size={12} />
                </button>
              </span>
            );
          })
        )}
      </div>

      <div className="bottombar__budget">
        <span className="bottombar__budget-item">
          <span className="bottombar__budget-label">Diplo:</span>
          <span className="bottombar__budget-value">{diploRemaining}</span>
        </span>
        <span className="bottombar__budget-item">
          <span className="bottombar__budget-label">Mil:</span>
          <span className="bottombar__budget-value">{milRemaining}</span>
        </span>
        <span className="bottombar__budget-item">
          <span className="bottombar__budget-label">Build:</span>
          <span className="bottombar__budget-value">{constRemaining}</span>
        </span>
        <span className="bottombar__budget-item">
          <span className="bottombar__budget-label">Wild:</span>
          <span className="bottombar__budget-value">{wildRemaining}</span>
        </span>

        {!gameOver && (
          <button className="topbar__end-turn" onClick={onEndTurn}>
            END TURN
          </button>
        )}
      </div>
    </div>
  );
}
