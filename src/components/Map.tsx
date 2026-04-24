import { useState, useEffect, useMemo, memo } from 'react';
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
  mapBust?: number;
  mapImage?: string | null;
}

 // ── Map helpers ─────────────────────────────────────────────────────────

/** Terrain-based base fill color */
function getTerrainBaseFill(terrain: Province['terrain']): string {
  switch (terrain) {
    case 'Plains': return 'rgba(30, 48, 28, 0.6)';
    case 'Forest': return 'rgba(16, 38, 18, 0.6)';
    case 'Mountain': return 'rgba(48, 50, 58, 0.6)';
    case 'Coastal': return 'rgba(22, 38, 42, 0.6)';
    case 'Desert': return 'rgba(62, 52, 28, 0.6)';
    default: return 'rgba(30, 48, 28, 0.6)';
  }
}

/** Terrain texture overlay for added visual interest */
function getTerrainTextureOverlay(terrain: Province['terrain']): string {
  switch (terrain) {
    case 'Plains':   return 'rgba(40, 58, 38, 0.15)';
    case 'Forest':   return 'rgba(10, 28, 12, 0.2)';
    case 'Mountain': return 'rgba(58, 60, 68, 0.18)';
    case 'Coastal':  return 'rgba(32, 48, 52, 0.12)';
    case 'Desert':   return 'rgba(72, 62, 38, 0.16)';
    default:         return 'rgba(40, 58, 38, 0.15)';
  }
}

/** Terrain-based border color */
function getTerrainBorderColor(terrain: Province['terrain'], ownerId: string | null, nations: Nation[]): string {
  if (ownerId !== null && ownerId !== 'rebel') {
    const nation = nations.find((n) => n.id === ownerId);
    if (nation) return nation.color;
  }

  switch (terrain) {
    case 'Plains':   return 'rgba(30, 48, 28, 0.8)';
    case 'Forest':   return 'rgba(16, 38, 18, 0.8)';
    case 'Mountain': return 'rgba(48, 50, 58, 0.8)';
    case 'Coastal':  return 'rgba(22, 38, 42, 0.8)';
    case 'Desert':   return 'rgba(62, 52, 28, 0.8)';
    default:         return 'rgba(30, 48, 28, 0.8)';
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

/** Strategic tag small label */
function tagLabel(tag: Province['strategicTag']): string | null {
  switch (tag) {
    case 'Capital': return 'CAPITAL';
    case 'KeyRegion': return 'KEY REGION';
    case 'Port': return 'PORT';
    default: return null;
  }
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

  const hash = simpleHash(edgeKey);
  const offsetScale = 0.06;
  const sign = hash % 2 === 0 ? 1 : -1;
  const nx = (-dy / len) * len * offsetScale * sign;
  const ny = (dx / len) * len * offsetScale * sign;

  return `M ${x1} ${y1} Q ${mx + nx} ${my + ny} ${x2} ${y2}`;
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

// ── Small SVG shape markers (reliable, no path parsing needed) ──────────

/** Crown shape for Capital — simple cross + arc */
function CrownMarker({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      {/* Crown base */}
      <line x1="-5" y1="2" x2="5" y2="2" stroke={color} strokeWidth="1.2" />
      {/* Crown points */}
      <polyline
        points="-5,2 -4,-2 -1,0 0,-3 1,0 4,-2 5,2"
        fill={color}
        fillOpacity="0.3"
        stroke={color}
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </g>
  );
}

/** Star shape for Key Region */
function StarMarker({ x, y, color }: { x: number; y: number; color: string }) {
  // 5-pointed star as a polygon
  const r = 5;
  const ir = 2.2;
  const pts = Array.from({ length: 10 }, (_, i) => {
    const angle = (Math.PI / 2) * -1 + (i * Math.PI) / 5;
    const radius = i % 2 === 0 ? r : ir;
    return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
  }).join(' ');

  return (
    <polygon
      points={pts}
      fill={color}
      fillOpacity="0.35"
      stroke={color}
      strokeWidth="0.7"
      style={{ pointerEvents: 'none' }}
    />
  );
}

/** Anchor shape for Port — simple T + circle */
function PortMarker({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g transform={`translate(${x}, ${y})`} style={{ pointerEvents: 'none' }}>
      {/* Vertical post */}
      <line x1="0" y1="-4" x2="0" y2="4" stroke={color} strokeWidth="1.2" />
      {/* Cross bar */}
      <line x1="-3" y1="-2" x2="3" y2="-2" stroke={color} strokeWidth="1" />
      {/* Ring */}
      <circle cx="0" cy="-5" r="1.5" fill="none" stroke={color} strokeWidth="0.8" />
    </g>
  );
}

/** Shield shape for Fort level */
function FortMarker({ x, y, color, level }: { x: number; y: number; color: string; level: number }) {
  const w = 4;
  const h = 5;
  return (
    <g style={{ pointerEvents: 'none' }}>
      {Array.from({ length: level }, (_, i) => {
        const ox = x + (i - (level - 1) / 2) * 7;
        return (
          <path
            key={i}
            d={`M ${ox - w} ${y - h + 2} Q ${ox - w} ${y - h} ${ox} ${y - h - 1} Q ${ox + w} ${y - h} ${ox + w} ${y - h + 2} L ${ox + w} ${y - 1} Q ${ox} ${y + 2} ${ox - w} ${y - 1} Z`}
            fill={color}
            fillOpacity="0.25"
            stroke={color}
            strokeWidth="0.6"
          />
        );
      })}
    </g>
  );
}

/** X-shape for Land Army */
function LandArmyMarker({ x, y, color }: { x: number; y: number; color: string }) {
  const s = 5;
  return (
    <g style={{ pointerEvents: 'none' }}>
      <line x1={x - s} y1={y - s} x2={x + s} y2={y + s} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <line x1={x + s} y1={y - s} x2={x - s} y2={y + s} stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </g>
  );
}

/** Diamond shape for Naval Fleet */
function NavalArmyMarker({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <polygon
      points={`${x},${y - 6} ${x + 4.5},${y} ${x},${y + 6} ${x - 4.5},${y}`}
      fill={color}
      fillOpacity="0.3"
      stroke={color}
      strokeWidth="1.2"
      style={{ pointerEvents: 'none' }}
    />
  );
}

// ── Component ───────────────────────────────────────────────────────────

export default memo(function Map({
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
  mapBust = 0,
  mapImage = null,
}: MapProps) {
  const [hoveredProvinceId, setHoveredProvinceId] = useState<string | null>(null);
  const [bgDataUrl, setBgDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (mapImage) {
      setTimeout(() => setBgDataUrl(mapImage), 0);
      return;
    }
    const url = `/map_background.png?t=${mapBust}`;
    let objectUrl: string | null = null;
    fetch(url)
      .then(r => r.blob())
      .then(blob => {
        objectUrl = URL.createObjectURL(blob);
        setBgDataUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mapBust, mapImage]);

  // Build a lookup from provinceId → center coordinates for edge drawing
  const centerLookup = useMemo(() => {
    const lookup: Record<string, { x: number; y: number }> = {};
    for (const p of provinces) {
      lookup[p.id] = { x: p.layout.x, y: p.layout.y };
    }
    return lookup;
  }, [provinces]);

  // Group armies by province
  const armiesByProvince = useMemo(() => {
    const grouped: Record<string, Army[]> = {};
    for (const army of armies) {
      if (!grouped[army.provinceId]) {
        grouped[army.provinceId] = [];
      }
      grouped[army.provinceId].push(army);
    }
    return grouped;
  }, [armies]);

  return (
    <svg
      className="map-svg"
      viewBox="0 0 960 650"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        {/* Province drop shadow */}
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

      {/* ════════════ MAP BACKGROUND ════════════ */}
      {bgDataUrl && <image href={bgDataUrl} x="0" y="0" width="960" height="650" />}

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
            <path key={edgeKey} d={path} fill="none" stroke="#7aa4d4"
              strokeWidth={width + 1} strokeLinecap="round" opacity="0.9"
              className="map-edge--highlighted" />
          );
        }
        if (edge.tradeActive) {
          return (
            <path key={edgeKey} d={path} fill="none" stroke="url(#trade-gradient)"
              strokeWidth={width + 0.5} strokeLinecap="round"
              className="map-edge map-edge--trade-active" />
          );
        }
        if (edge.chokepoint) {
          return (
            <path key={edgeKey} d={path} fill="none" stroke="url(#chokepoint-gradient)"
              strokeWidth={width + 0.5} strokeLinecap="round"
              className="map-edge map-edge--chokepoint" />
          );
        }
        return (
          <path key={edgeKey} d={path} fill="none" stroke="var(--border-light)"
            strokeWidth={width} strokeDasharray="4 3" strokeLinecap="round" opacity="0.55" />
        );
      })}

       {/* ════════════ PROVINCE POLYGONS ════════════ */}
        {provinces.map((province) => {
          const isSelected = province.id === selectedProvinceId;
         let className = 'map-province';
         if (isSelected) className += ' map-province--selected';
         if (province.ownerId === 'rebel') className += ' map-province--rebel';
         else if (province.ownerId === null) className += ' map-province--unowned';
         if (highlightedNationId) {
           className += province.ownerId === highlightedNationId
             ? ' map-province--highlighted' : ' map-province--dimmed';
         }
         if (!isSelected) {
           if (recentCaptureIds?.has(province.id)) className += ' map-province--captured';
           else if (recentLossIds?.has(province.id)) className += ' map-province--lost';
         }

          return (
            <g key={province.id}>
              {/* Terrain-based base fill */}
              <polygon points={toPointsString(province.layout.polygon)}
                className={className}
                filter={isSelected ? 'url(#selected-glow)' : 'url(#province-shadow)'}
                style={{ 
                  fill: getTerrainBaseFill(province.terrain),
                  transition: 'fill 0.3s ease'
                }}
                onClick={() => onProvinceClick(province.id)}
                onMouseEnter={() => setHoveredProvinceId(province.id)}
                onMouseLeave={() => setHoveredProvinceId(null)} />
              {/* Terrain texture overlay */}
              <polygon points={toPointsString(province.layout.polygon)}
                className={className}
                filter={isSelected ? 'url(#selected-glow)' : 'url(#province-shadow)'}
                style={{ 
                  fill: getTerrainTextureOverlay(province.terrain),
                  transition: 'fill 0.3s ease'
                }}
                onClick={() => onProvinceClick(province.id)}
                onMouseEnter={() => setHoveredProvinceId(province.id)}
                onMouseLeave={() => setHoveredProvinceId(null)} />
              {/* Province border with terrain-based styling */}
              <polygon points={toPointsString(province.layout.polygon)}
                fill="none"
                style={{ 
                  stroke: getTerrainBorderColor(province.terrain, province.ownerId, nations),
                  strokeWidth: isSelected ? 2 : 1,
                  transition: 'stroke 0.3s ease',
                  pointerEvents: 'none' 
                }} />
            </g>
          );
       })}

      {/* ════════════ UNREST OVERLAY ════════════ */}
      {provinces.map((province) => {
        const opacity = getUnrestOpacity(province.unrest);
        if (opacity <= 0) return null;
        return (
          <polygon key={`unrest-${province.id}`}
            points={toPointsString(province.layout.polygon)}
            fill={`rgba(242, 85, 100, ${opacity})`}
            className="map-unrest-overlay" style={{ pointerEvents: 'none' }} />
        );
      })}

      {/* ════════════ BATTLE RINGS ════════════ */}
      {recentBattleIds && provinces.map((province) => {
        if (!recentBattleIds.has(province.id)) return null;
        return (
          <g key={`battle-${province.id}`} filter="url(#battle-glow)">
            <circle cx={province.layout.x} cy={province.layout.y} r={20}
              fill="none" stroke="#f0a830" strokeWidth={2.5} className="map-battle-ring" />
            <circle cx={province.layout.x} cy={province.layout.y} r={14}
              fill="none" stroke="#f0a830" strokeWidth={2} className="map-battle-ring map-battle-ring--delay1" />
            <circle cx={province.layout.x} cy={province.layout.y} r={8}
              fill="none" stroke="#ffc845" strokeWidth={1.5} className="map-battle-ring map-battle-ring--delay2" />
          </g>
        );
      })}

      {/* ════════════ PROVINCE LABELS ════════════ */}
      {provinces.map((province) => (
        <g key={`label-${province.id}`}>
          <text x={province.layout.x} y={province.layout.y - 2}
            className="map-province-label--bg">{province.name}</text>
          <text x={province.layout.x} y={province.layout.y - 2}
            className="map-province-label">{province.name}</text>
        </g>
      ))}

      {/* ════════════ STRATEGIC TAG MARKERS ════════════ */}
      {provinces.map((province) => {
        if (!province.strategicTag) return null;
        const px = province.layout.x;
        const py = province.layout.y - 16;

        return (
          <g key={`strat-${province.id}`}>
            <circle cx={px} cy={py} r={8} fill="rgba(6,8,14,0.7)"
              stroke="rgba(255,200,69,0.4)" strokeWidth={0.6} />
            {province.strategicTag === 'Capital' && <CrownMarker x={px} y={py} color="#ffc845" />}
            {province.strategicTag === 'KeyRegion' && <StarMarker x={px} y={py} color="#ffc845" />}
            {province.strategicTag === 'Port' && <PortMarker x={px} y={py} color="#7aa4d4" />}
          </g>
        );
      })}

      {/* ════════════ STRATEGIC TAG LABELS ════════════ */}
      {provinces.map((province) => {
        const label = tagLabel(province.strategicTag);
        if (!label) return null;
        return (
          <text key={`tag-${province.id}`}
            x={province.layout.x} y={province.layout.y + 11}
            className="map-strategic-tag">{label}</text>
        );
      })}

      {/* ════════════ FORT INDICATORS ════════════ */}
      {provinces.map((province) => {
        if (province.fortLevel <= 0) return null;
        return (
          <FortMarker key={`fort-${province.id}`}
            x={province.layout.x} y={province.layout.y + 22}
            color="rgba(192, 168, 80, 0.8)"
            level={Math.min(province.fortLevel, 3)} />
        );
      })}

      {/* ════════════ ARMY ICONS ════════════ */}
      {provinces.map((province) => {
        const provArmies = armiesByProvince[province.id];
        if (!provArmies || provArmies.length === 0) return null;

        return provArmies.map((army: Army, idx: number) => {
          const nation = nations.find((n) => n.id === army.ownerId);
          const color = nation?.color ?? '#fff';
          const offsetX = (idx - (provArmies.length - 1) / 2) * 20;
          const cx = province.layout.x + offsetX;
          const cy = province.layout.y - 18;

          return (
            <g key={army.id} filter="url(#army-glow)">
              {/* Glow ring */}
              <circle cx={cx} cy={cy} r={12} fill="none" stroke={color}
                strokeWidth={1} opacity={0.25} />
              {/* Background circle */}
              <circle cx={cx} cy={cy} r={10} fill="rgba(6,8,14,0.85)"
                stroke={color} strokeWidth={1.8} className="map-army-bg" />
              {/* Icon */}
              {army.type === 'Land'
                ? <LandArmyMarker x={cx} y={cy - 1} color={color} />
                : <NavalArmyMarker x={cx} y={cy - 1} color={color} />
              }
              {/* Strength */}
              <text x={cx} y={cy + 5} textAnchor="middle" fontSize="6"
                fontWeight="700" fill="#fff" style={{ pointerEvents: 'none' }}>
                {army.strength}
              </text>
            </g>
          );
        });
      })}
    </svg>
  );
});