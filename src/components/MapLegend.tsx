export default function MapLegend() {
  return (
    <div className="map-legend">
      <div className="map-legend__title">Legend</div>
      <div className="map-legend__section">
        <div className="map-legend__section-label">Province Type</div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u265B'}</span>
          <span>Capital</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u2605'}</span>
          <span>Key Region</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u26F5'}</span>
          <span>Port</span>
        </div>
      </div>
      <div className="map-legend__section">
        <div className="map-legend__section-label">Military</div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u2694'}</span>
          <span>Land Army</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u2693'}</span>
          <span>Naval Fleet</span>
        </div>
        <div className="map-legend__item">
          <span className="map-legend__icon">{'\u{1F6E1}'}</span>
          <span>Fortification</span>
        </div>
      </div>
      <div className="map-legend__section">
        <div className="map-legend__section-label">Routes</div>
        <div className="map-legend__item">
          <svg className="map-legend__edge-icon" viewBox="0 0 30 10">
            <line x1="2" y1="5" x2="28" y2="5" stroke="var(--border-light)" strokeWidth="2" strokeDasharray="4 3" strokeLinecap="round" opacity="0.7" />
          </svg>
          <span>Path</span>
        </div>
        <div className="map-legend__item">
          <svg className="map-legend__edge-icon" viewBox="0 0 30 10">
            <line x1="2" y1="5" x2="28" y2="5" stroke="#ffc845" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
          </svg>
          <span>Active Trade</span>
        </div>
        <div className="map-legend__item">
          <svg className="map-legend__edge-icon" viewBox="0 0 30 10">
            <line x1="2" y1="5" x2="28" y2="5" stroke="#e84055" strokeWidth="2.5" strokeLinecap="round" opacity="0.7" />
          </svg>
          <span>Chokepoint</span>
        </div>
      </div>
      <div className="map-legend__section">
        <div className="map-legend__section-label">Status</div>
        <div className="map-legend__item">
          <span className="map-legend__swatch" style={{ background: 'rgba(242, 85, 100, 0.4)' }} />
          <span>Unrest</span>
        </div>
        <div className="map-legend__item">
          <svg className="map-legend__edge-icon" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" fill="none" stroke="#f0a830" strokeWidth="1.5" />
          </svg>
          <span>Battle Site</span>
        </div>
      </div>
    </div>
  );
}
