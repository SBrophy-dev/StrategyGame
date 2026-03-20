export type AgreementType = 'NonAggressionPact' | 'TradeDeal' | 'MilitaryAlliance' | 'Vassalage';

export interface Agreement {
  type: AgreementType;
  partnerNationId: string;
  startedOnTurn: number;
  expiresOnTurn: number | null; // null = until broken
  active: boolean;
}

export type AgendaType = 'control_region_cluster' | 'economic_dominance' | 'military_supremacy' | 'diplomatic_hegemony';

export interface Agenda {
  type: AgendaType;
  targetRegions?: string[];
  priority: 'low' | 'medium' | 'high';
}
