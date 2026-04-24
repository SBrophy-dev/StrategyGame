// Province & World
export type {
  TerrainType,
  ProvinceFocus,
  StrategicTag,
  PopulationLevel,
  DevLevel,
  ProvinceLayout,
  Province,
} from './province';

export type { Edge } from './edge';

// Resources
export type { ResourceType, ResourceLedger } from './resources';

// Nation
export type {
  Archetype,
  Modifier,
  UtilityWeights,
  VisibilityLevel,
  IntelTrack,
  IntelRecord,
  Nation,
} from './nation';

// Diplomacy
export type {
  AgreementType,
  Agreement,
  AgendaType,
  Agenda,
} from './diplomacy';

// Combat
export type { CombatParams, CombatResult } from './combat';

// Orders
export type {
  ArmyType,
  ProposeAgreementOrder,
  BreakAgreementOrder,
  DeclareWarOrder,
  OfferPeaceOrder,
  DiplomaticOrder,
  MoveArmyOrder,
  RetreatOrder,
  BlockadeOrder,
  MilitaryOrder,
  UpgradeDevOrder,
  SetFocusOrder,
  BuildFortOrder,
  ConstructionOrder,
  SpyOrder,
  RestoreNationOrder,
  HireMercenariesOrder,
  WildcardOrder,
  Order,
  ActionBudget,
} from './orders';

// Events
export type {
  EventCondition,
  EventTrigger,
  ResourceDeltaEffect,
  RelationDeltaEffect,
  UnrestDeltaEffect,
  OwnerChangeEffect,
  PopulationChangeEffect,
  DevCostModifierEffect,
  OutputModifierEffect,
  EventEffect,
  GameEvent,
  ScriptedEvent,
} from './events';

// Scenario
export type {
  ControlRegionsObjective,
  DominationObjective,
  PrimaryObjective,
  TiebreakerMethod,
  VictoryConditions,
  FocusOutputRow,
  DevelopmentOutputTable,
  ScenarioMeta,
  NationDefinition,
  ArmyDefinition,
  StartingState,
  Scenario,
} from './scenario';

// Game State
export type {
  Army,
  War,
  ConflictType,
  ConflictReportEntry,
  ConflictReport,
  EliminationRecord,
  FiredEvent,
  TurnLog,
  GameState,
  GameContext,
} from './state';

// UI Icons
export type { GameIconName } from '../components/GameIcon';
