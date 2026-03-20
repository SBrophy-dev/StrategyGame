export interface Edge {
  sourceId: string;
  targetId: string;
  movementCost: number;
  tradeValue: number;
  chokepoint: boolean;
  tradeActive: boolean;
}
