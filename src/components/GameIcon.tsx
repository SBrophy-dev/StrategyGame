/**
 * GameIcon — centralized icon mapping for Realms of Iron.
 *
 * Wraps Lucide React icons with game-specific naming so components use
 * semantic icon names (e.g. "gold", "land-army") instead of raw unicode.
 */
import {
  Coins,
  Wheat,
  Hammer,
  Swords,
  Anchor,
  Sparkles,
  Crown,
  Star,
  Ship,
  ShieldCheck,
  Handshake,
  AlertTriangle,
  Zap,
  Lightbulb,
  Compass,
  Timer,
  ChevronUp,
  ChevronDown,
  X,
  Axe,
  Settings,
  Eye,
  UserPlus,
  Circle,
  Activity,
  type LucideProps,
} from 'lucide-react';
import type { FC } from 'react';

// ── Named icon map ──────────────────────────────────────────────────────

export type GameIconName =
  // Resources
  | 'gold'
  | 'food'
  | 'production'
  | 'influence'
  | 'manpower'
  // Province
  | 'capital'
  | 'key-region'
  | 'port'
  // Military
  | 'land-army'
  | 'naval-fleet'
  | 'fortification'
  | 'swords'
  // Context
  | 'diplomacy'
  | 'warning'
  | 'action-budget'
  | 'hints'
  | 'suggestions'
  | 'timer'
  | 'victory'
  // UI
  | 'chevron-up'
  | 'chevron-down'
  | 'close'
  | 'settings'
  | 'eye'
  | 'user-plus'
  | 'circle'
  // Additional icons we might need
  | 'activity'
  | 'zap';

const ICON_MAP: Record<GameIconName, FC<LucideProps>> = {
  // Resources
  gold: Coins,
  food: Wheat,
  production: Hammer,
  influence: Sparkles,
  manpower: Swords,
  // Province
  capital: Crown,
  'key-region': Star,
  port: Ship,
  // Military
  'land-army': Axe,
  'naval-fleet': Anchor,
  fortification: ShieldCheck,
  swords: Swords,
  // Context
  diplomacy: Handshake,
  warning: AlertTriangle,
  'action-budget': Zap,
  hints: Lightbulb,
  suggestions: Compass,
  timer: Timer,
  victory: Star,
  // UI
  'chevron-up': ChevronUp,
  'chevron-down': ChevronDown,
  close: X,
  settings: Settings,
  eye: Eye,
  'user-plus': UserPlus,
  circle: Circle,
  activity: Activity,
  zap: Zap,
};

// ── React component ─────────────────────────────────────────────────────

export interface GameIconProps extends LucideProps {
  name: GameIconName;
  title?: string;
}

export default function GameIcon({ name, size = 16, ...rest }: GameIconProps) {
  const Icon = ICON_MAP[name];
  return <Icon size={size} {...rest} />;
}

// ── SVG path data for inline SVG contexts (e.g. Map.tsx) ────────────────

/**
 * Lucide icon node data for embedding directly inside an SVG.
 * Each entry is [elementType, attributes].
 * Used in Map.tsx where Lucide React components can't be nested.
 */
export type IconNode = [string, Record<string, string>][];

export const MAP_ICON_NODES: Record<string, IconNode> = {
  swords: [
    ['polyline', { points: '14.5 17.5 3 6 3 3 6 3 17.5 14.5' }],
    ['line', { x1: '13', x2: '19', y1: '19', y2: '13' }],
    ['line', { x1: '16', x2: '20', y1: '16', y2: '20' }],
    ['line', { x1: '19', x2: '21', y1: '21', y2: '19' }],
    ['polyline', { points: '14.5 6.5 18 3 21 3 21 6 17.5 9.5' }],
    ['line', { x1: '5', x2: '9', y1: '14', y2: '18' }],
    ['line', { x1: '7', x2: '4', y1: '17', y2: '20' }],
    ['line', { x1: '3', x2: '5', y1: '19', y2: '21' }],
  ],
  anchor: [
    ['path', { d: 'M12 6v16' }],
    ['path', { d: 'm19 13 2-1a9 9 0 0 1-18 0l2 1' }],
    ['path', { d: 'M9 11h6' }],
    ['circle', { cx: '12', cy: '4', r: '2' }],
  ],
  crown: [
    [
      'path',
      {
        d: 'M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z',
      },
    ],
    ['path', { d: 'M5 21h14' }],
  ],
  star: [
    [
      'path',
      {
        d: 'M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z',
      },
    ],
  ],
  ship: [
    ['path', { d: 'M12 10.189V14' }],
    ['path', { d: 'M12 2v3' }],
    ['path', { d: 'M19 13V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6' }],
    [
      'path',
      {
        d: 'M19.38 20A11.6 11.6 0 0 0 21 14l-8.188-3.639a2 2 0 0 0-1.624 0L3 14a11.6 11.6 0 0 0 2.81 7.76',
      },
    ],
    [
      'path',
      {
        d: 'M2 21c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1s1.2 1 2.5 1c2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1',
      },
    ],
  ],
  'shield-check': [
    [
      'path',
      {
        d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
      },
    ],
    ['path', { d: 'm9 12 2 2 4-4' }],
  ],
  axe: [
    ['path', { d: 'm14 12-8.5 8.5a2.12 2.12 0 1 1-3-3L11 9' }],
    ['path', { d: 'M15 13 9 7l4-4 6 4h0a2 2 0 0 1 0 4l-5.5 5.5' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
};
