import { useState } from 'react';
import type { Province, Edge, Nation, Army } from '../types';

export interface MapProps {
  provinces: Province[];
  edges: Edge[];
  nations: Nation[];
  armies: Army[];
  selectedProvinceId: string | null;
  onProvinceClick?: (provinceId: string) => void;
  highlightedNationId?: string | null;
  recentCaptureIds?: Set<string>;
  recentLossIds?: Set<string>;
  recentBattleIds?: Set<string>;
}

/** Return the nation color for a province owner, or a fallback */
function getProvinceFill(province: Province, nations: Nation[]): string {
  if (province.ownerId === null) return '#1a1c22';
  if (province.ownerId === 'rebel') return '#3a1e1e';
  const nation = nations.find((n) => n.id === province.ownerId);
  return nation?.color ?? '#333';
}

/** Terrain overlay tint color */
function terrainTint(terrain: Province['terrain']): string {
  switch (terrain) {
    case 'Plains': return 'rgba(190, 180, 130, 0.10)';
    case 'Forest': return 'rgba(40, 140, 65, 0.14)';
    case 'Mountain': return 'rgba(130, 135, 160, 0.12)';
    case 'Coastal': return 'rgba(40, 115, 180, 0.12)';
    case 'Desert': return 'rgba(210, 175, 75, 0.14)';
  }
}

/** Darker edge color for terrain (for depth gradient) */
function terrainEdgeDark(terrain: Province['terrain']): string {
  switch (terrain) {
    case 'Plains': return 'rgba(140, 130, 80, 0.15)';
    case 'Forest': return 'rgba(20, 90, 40, 0.18)';
    case 'Mountain': return 'rgba(80, 85, 110, 0.16)';
    case 'Coastal': return 'rgba(20, 70, 130, 0.16)';
    case 'Desert': return 'rgba(160, 130, 40, 0.18)';
  }
}

/** Get CSS class for unrest level */
function getUnrestOpacity(unrest: number): number {
  if (unrest >= 70) return 0.50;
  if (unrest >= 40) return 0.30;
  if (unrest > 10) return 0.12;
  return 0;
}

/** Convert polygon array to SVG points string */
function toPointsString(polygon: [number, number][]): string {
  return polygon.map(([x, y]) => `${x},${y}`).join(' ');
}

/** Label prefix based on strategic tag */
function tagPrefix(tag: Province['strategicTag']): string {
  switch (tag) {
    case 'Capital': return '\u265B '; // ♛
    case 'KeyRegion': return '\u2605 '; // ★
    default: return '';
  }
}

/** Label suffix for port */
function tagSuffix(tag: Province['strategicTag']): string {
  switch (tag) {
    case 'Port': return ' \u26F5'; // ⛵
    default: return '';
  }
}

/** Strategic tag small label */
function tagLabel(tag: Province['strategicTag']): string | null {
  switch (tag) {
    case 'Capital': return 'CAPITAL';
    case 'KeyRegion': return 'KEY REGION';
    case 'Port': return 'PORT';
    default: return null;
  }
}

/** Fort level indicator */
function fortIndicator(level: number): string {
  if (level <= 0) return '';
  return '\u{1F6E1}'.repeat(Math.min(level, 3));
}

/** Compute a curved edge path between two points using quadratic bezier */
function curvedEdgePath(
  x1: number, y1: number,
  x2: number, y2: number,
  edgeKey: string
): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;

  // Perpendicular offset — small curve based on edge hash
  const hash = simpleHash(edgeKey);
  const offsetScale = 0.06;
  const sign = hash % 2 === 0 ? 1 : -1;
  const nx = (-dy / len) * len * offsetScale * sign;
  const ny = (dx / len) * len * offsetScale * sign;

  const cx = mx + nx;
  const cy = my + ny;

  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

/** Simple string hash for deterministic edge curvature */
function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Edge stroke width based on trade value */
function edgeWidth(tradeValue: number): number {
  if (tradeValue >= 4) return 2;
  if (tradeValue >= 3) return 1.5;
  if (tradeValue >= 2) return 1.2;
  return 0.8;
}

export default function Map({
  provinces,
  edges,
  nations,
  armies,
  selectedProvinceId,
  onProvinceClick = () => {},
  highlightedNationId = null,
  recentCaptureIds,
  recentLossIds,
  recentBattleIds,
}: MapProps) {
  const [hoveredProvinceId, setHoveredProvinceId] = useState<string | null>(null);

  // Build a lookup from provinceId → center coordinates for edge drawing
  const centerLookup: Record<string, { x: number; y: number }> = {};
  for (const p of provinces) {
    centerLookup[p.id] = { x: p.layout.x, y: p.layout.y };
  }

  // Group armies by province
  const armiesByProvince: Record<string, Army[]> = {};
  for (const army of armies) {
    if (!armiesByProvince[army.provinceId]) {
      armiesByProvince[army.provinceId] = [];
    }
    armiesByProvince[army.provinceId].push(army);
  }

  return (
    <svg
      className="map-svg"
      viewBox="0 0 960 650"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Map background gradient */}
        <radialGradient id="map-bg-gradient" cx="50%" cy="48%" r="65%">
          <stop offset="0%" stopColor="#0e1218" />
          <stop offset="70%" stopColor="#080b12" />
          <stop offset="100%" stopColor="#04060a" />
        </radialGradient>

        {/* Vignette overlay */}
        <radialGradient id="map-vignette" cx="50%" cy="50%" r="72%">
          <stop offset="0%" stopColor="transparent" />
          <stop offset="85%" stopColor="rgba(0,0,0,0.15)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0.45)" />
        </radialGradient>

        {/* Subtle noise texture */}
        <filter id="map-noise" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" result="noise" />
          <feColorMatrix type="saturate" values="0" in="noise" result="grey" />
          <feBlend in="SourceGraphic" in2="grey" mode="overlay" result="blended" />
          <feComponentTransfer in="blended">
            <feFuncA type="linear" slope="1" />
          </feComponentTransfer>
        </filter>

        {/* Province drop shadow for owned provinces */}
        <filter id="province-shadow" x="-10%" y="-10%" width="120%" height="120%">
          <feDropShadow dx="0" dy="1" stdDeviation="2" floodColor="#000" floodOpacity="0.5" />
        </filter>

        {/* Selected province glow */}
        <filter id="selected-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" type="matrix"
            values="0 0 0 0 0.24
                    0 0 0 0 0.50
                    0 0 0 0 0.83
                    0 0 0 0.6 0" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Hover glow */}
        <filter id="hover-glow" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#fff" floodOpacity="0.15" />
        </filter>

        {/* Army icon glow */}
        <filter id="army-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Battle shockwave glow */}
        <filter id="battle-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Gold gradient for trade edges */}
        <linearGradient id="trade-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#ffc845" stopOpacity="0.6" />
          <stop offset="50%" stopColor="#ffd86a" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#ffc845" stopOpacity="0.6" />
        </linearGradient>

        {/* Chokepoint gradient */}
        <linearGradient id="chokepoint-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e84055" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#f25564" stopOpacity="0.7" />
          <stop offset="100%" stopColor="#e84055" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect x="0" y="0" width="960" height="650" fill="url(#map-bg-gradient)" />
      <rect width="100%" height="100%" fill="url(#map-vignette)" />

      {/* Compass rose — subtle corner decoration */}
      <g transform="translate(920, 620)" opacity="0.12">
        <line x1="0" y1="-12" x2="0" y2="12" stroke="#d8dce6" strokeWidth="1" />
        <line x1="-12" y1="0" x2="12" y2="0" stroke="#d8dce6" strokeWidth="1" />
        <line x1="-8" y1="-8" x2="8" y2="8" stroke="#d8dce6" strokeWidth="0.5" />
        <line x1="8" y1="-8" x2="-8" y2="8" stroke="#d8dce6" strokeWidth="0.5" />
        <polygon points="0,-14 -3,-6 3,-6" fill="#d8dce6" opacity="0.8" />
        <text x="0" y="-17" textAnchor="middle" fontSize="6" fill="#d8dce6" fontWeight="700">N</text>
      </g>

      {/* ════════════ EDGES ════════════ */}
      {edges.map((edge) => {
        const source = centerLookup[edge.sourceId];
        const target = centerLookup[edge.targetId];
        if (!source || !target) return null;

        const edgeKey = `${edge.sourceId}-${edge.targetId}`;
        const path = curvedEdgePath(source.x, source.y, target.x, target.y, edgeKey);
        const width = edgeWidth(edge.tradeValue);
        const isConnected = hoveredProvinceId !== null &&
          (edge.sourceId === hoveredProvinceId || edge.targetId === hoveredProvinceId);

        if (isConnected && !edge.tradeActive && !edge.chokepoint) {
          return (
            <path
              key={edgeKey}
              d={path}
              fill="none"
              stroke="#7aa4d4"
              strokeWidth={width + 1}
              strokeLinecap="round"
              opacity="0.9"
              className="map-edge--highlighted"
            />
          );
        }

        if (edge.tradeActive) {
          return (
            <path
              key={edgeKey}
              d={path}
              fill="none"
              stroke="url(#trade-gradient)"
              strokeWidth={width + 0.5}
              strokeLinecap="round"
              className="map-edge map-edge--trade-active"
            />
          );
        }

        if (edge.chokepoint) {
          return (
            <path
              key={edgeKey}
              d={path}
              fill="none"
              stroke="url(#chokepoint-gradient)"
              strokeWidth={width + 0.5}
              strokeLinecap="round"
              className="map-edge map-edge--chokepoint"
            />
          );
        }

        return (
          <path
            key={edgeKey}
            d={path}
            fill="none"
            stroke="var(--border-light)"
            strokeWidth={width}
            strokeDasharray="4 3"
            strokeLinecap="round"
            opacity="0.55"
          />
        );
      })}

      {/* ════════════ TERRAIN LAYER (beneath nation colors) ════════════ */}
      {provinces.map((province) => (
        <polygon
          key={`terrain-${province.id}`}
          points={toPointsString(province.layout.polygon)}
          fill={terrainTint(province.terrain)}
          stroke={terrainEdgeDark(province.terrain)}
          strokeWidth="0.5"
          style={{ pointerEvents: 'none' }}
        />
      ))}

      {/* ════════════ PROVINCE POLYGONS ════════════ */}
      {provinces.map((province) => {
        const fill = getProvinceFill(province, nations);
        const isSelected = province.id === selectedProvinceId;
        let className = 'map-province';
        if (isSelected) className += ' map-province--selected';
        if (province.ownerId === 'rebel') className += ' map-province--rebel';
        else if (province.ownerId === null) className += ' map-province--unowned';
        if (highlightedNationId) {
          if (province.ownerId === highlightedNationId) {
            className += ' map-province--highlighted';
          } else {
            className += ' map-province--dimmed';
          }
        }
        if (!isSelected) {
          if (recentCaptureIds?.has(province.id)) className += ' map-province--captured';
          else if (recentLossIds?.has(province.id)) className += ' map-province--lost';
        }

        // Dark outline beneath nation fill for contrast
        return (
          <g key={province.id}>
            {/* Dark border outline */}
            <polygon
              points={toPointsString(province.layout.polygon)}
              fill="#0a0e16"
              stroke="none"
              style={{ pointerEvents: 'none' }}
            />
            {/* Nation color fill with shadow */}
            <polygon
              points={toPointsString(province.layout.polygon)}
              fill={fill}
              className={className}
              filter={isSelected ? 'url(#selected-glow)' : 'url(#province-shadow)'}
              onClick={() => onProvinceClick(province.id)}
              onMouseEnter={() => setHoveredProvinceId(province.id)}
              onMouseLeave={() => setHoveredProvinceId(null)}
            />
            {/* Inner depth gradient — darker edges, lighter center */}
            <polygon
              points={toPointsString(province.layout.polygon)}
              fill="none"
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="1.5"
              style={{ pointerEvents: 'none' }}
            />
          </g>
        );
      })}

      {/* ════════════ UNREST OVERLAY ════════════ */}
      {provinces.map((province) => {
        const opacity = getUnrestOpacity(province.unrest);
        if (opacity <= 0) return null;
        return (
          <polygon
            key={`unrest-${province.id}`}
            points={toPointsString(province.layout.polygon)}
            fill={`rgba(242, 85, 100, ${opacity})`}
            className="map-unrest-overlay"
            style={{ pointerEvents: 'none' }}
          />
        );
      })}

      {/* ════════════ BATTLE RINGS ════════════ */}
      {recentBattleIds && provinces.map((province) => {
        if (!recentBattleIds.has(province.id)) return null;
        return (
          <g key={`battle-${province.id}`} filter="url(#battle-glow)">
            {/* Outer ring */}
            <circle
              cx={province.layout.x}
              cy={province.layout.y}
              r={20}
              fill="none"
              stroke="#f0a830"
              strokeWidth={2.5}
              className="map-battle-ring"
            />
            {/* Middle ring — delayed */}
            <circle
              cx={province.layout.x}
              cy={province.layout.y}
              r={14}
              fill="none"
              stroke="#f0a830"
              strokeWidth={2}
              className="map-battle-ring map-battle-ring--delay1"
            />
            {/* Inner ring — more delayed */}
            <circle
              cx={province.layout.x}
              cy={province.layout.y}
              r={8}
              fill="none"
              stroke="#ffc845"
              strokeWidth={1.5}
              className="map-battle-ring map-battle-ring--delay2"
            />
          </g>
        );
      })}

      {/* ════════════ PROVINCE LABELS ════════════ */}
      {provinces.map((province) => {
        const label = tagPrefix(province.strategicTag) + province.name + tagSuffix(province.strategicTag);
        return (
          <g key={`label-${province.id}`}>
            {/* Text shadow / outline for readability */}
            <text
              x={province.layout.x}
              y={province.layout.y - 2}
              className="map-province-label--bg"
            >
              {label}
            </text>
            {/* Foreground label */}
            <text
              x={province.layout.x}
              y={province.layout.y - 2}
              className="map-province-label"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ════════════ STRATEGIC TAGS ════════════ */}
      {provinces.map((province) => {
        const label = tagLabel(province.strategicTag);
        if (!label) return null;
        return (
          <g key={`tag-${province.id}`}>
            <text
              x={province.layout.x}
              y={province.layout.y + 11}
              className="map-strategic-tag"
            >
              {label}
            </text>
          </g>
        );
      })}

      {/* ════════════ FORT INDICATORS ════════════ */}
      {provinces.map((province) => {
        if (province.fortLevel <= 0) return null;
        const indicator = fortIndicator(province.fortLevel);
        return (
          <text
            key={`fort-${province.id}`}
            x={province.layout.x}
            y={province.layout.y + 22}
            className="map-fort-icon"
          >
            {indicator}
          </text>
        );
      })}

      {/* ════════════ ARMY ICONS ════════════ */}
      {provinces.map((province) => {
        const provArmies = armiesByProvince[province.id];
        if (!provArmies || provArmies.length === 0) return null;

        return provArmies.map((army: Army, idx: number) => {
          const nation = nations.find((n) => n.id === army.ownerId);
          const color = nation?.color ?? '#fff';
          const icon = army.type === 'Land' ? '\u2694' : '\u2693';
          const offsetX = (idx - (provArmies.length - 1) / 2) * 20;
          const cx = province.layout.x + offsetX;
          const cy = province.layout.y - 18;

          return (
            <g key={army.id} filter="url(#army-glow)">
              {/* Glow ring behind army */}
              <circle
                cx={cx}
                cy={cy}
                r={12}
                fill="none"
                stroke={color}
                strokeWidth={1}
                opacity={0.25}
              />
              {/* Army circle background */}
              <circle
                cx={cx}
                cy={cy}
                r={10}
                fill="rgba(6,8,14,0.85)"
                stroke={color}
                strokeWidth={1.8}
                className="map-army-bg"
              />
              {/* Army icon */}
              <text
                x={cx}
                y={cy + 1}
                className="map-army-icon"
                fill={color}
              >
                {icon}
              </text>
              {/* Strength inside circle */}
              <text
                x={cx}
                y={cy + 4.5}
                textAnchor="middle"
                fontSize="6"
                fontWeight="700"
                fill="#fff"
                style={{ pointerEvents: 'none' }}
              >
                {army.strength}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
}
