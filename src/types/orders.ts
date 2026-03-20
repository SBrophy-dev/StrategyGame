export type ArmyType = 'Land' | 'Naval';

// --- Diplomatic Orders ---

export interface ProposeAgreementOrder {
  type: 'propose_agreement';
  nationId: string;
  targetNationId: string;
  agreementType: 'NonAggressionPact' | 'TradeDeal' | 'MilitaryAlliance' | 'Vassalage';
  duration?: number; // turns; omit for indefinite
}

export interface BreakAgreementOrder {
  type: 'break_agreement';
  nationId: string;
  targetNationId: string;
  agreementType: 'NonAggressionPact' | 'TradeDeal' | 'MilitaryAlliance' | 'Vassalage';
}

export interface DeclareWarOrder {
  type: 'declare_war';
  nationId: string;
  targetNationId: string;
}

export interface OfferPeaceOrder {
  type: 'offer_peace';
  nationId: string;
  targetNationId: string;
}

export type DiplomaticOrder =
  | ProposeAgreementOrder
  | BreakAgreementOrder
  | DeclareWarOrder
  | OfferPeaceOrder;

// --- Military Orders ---

export interface MoveArmyOrder {
  type: 'move_army';
  nationId: string;
  armyId: string;
  fromProvinceId: string;
  toProvinceId: string;
}

export interface RetreatOrder {
  type: 'retreat';
  nationId: string;
  armyId: string;
  toProvinceId: string;
}

export interface BlockadeOrder {
  type: 'blockade';
  nationId: string;
  armyId: string; // must be Naval
  edgeSourceId: string;
  edgeTargetId: string;
}

export type MilitaryOrder = MoveArmyOrder | RetreatOrder | BlockadeOrder;

// --- Construction Orders ---

export interface UpgradeDevOrder {
  type: 'upgrade_dev';
  nationId: string;
  provinceId: string;
}

export interface SetFocusOrder {
  type: 'set_focus';
  nationId: string;
  provinceId: string;
  focus: 'Agricultural' | 'Industrial' | 'Commercial' | 'Military';
}

export interface BuildFortOrder {
  type: 'build_fort';
  nationId: string;
  provinceId: string;
}

export type ConstructionOrder = UpgradeDevOrder | SetFocusOrder | BuildFortOrder;

// --- Wildcard / Special Orders ---

export interface SpyOrder {
  type: 'spy';
  nationId: string;
  targetNationId: string;
  intelTrack: 'military' | 'economic' | 'diplomatic' | 'political';
}

export interface RestoreNationOrder {
  type: 'restore_nation';
  nationId: string;
  targetNationId: string; // eliminated nation to restore
}

export interface HireMercenariesOrder {
  type: 'hire_mercenaries';
  nationId: string;
  goldCost: number;
  manpowerGain: number;
}

export type WildcardOrder = SpyOrder | RestoreNationOrder | HireMercenariesOrder;

// --- Union of all orders ---

export type Order = DiplomaticOrder | MilitaryOrder | ConstructionOrder | WildcardOrder;

// --- Action Budget ---

export interface ActionBudget {
  diplomatic: number; // base 2
  diplomaticUsed: number;
  military: number; // 1 per army unit
  militaryUsed: number;
  construction: number; // 1 per owned province
  constructionUsed: number;
  wildcard: number; // base 1
  wildcardUsed: number;
}
