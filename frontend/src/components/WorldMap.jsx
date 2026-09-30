import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// 100% Free, High-performance Tile Providers (NO watermark, NO API key required)
const TILE_PROVIDERS = {
  osm: {
    name: 'OpenStreetMap Chuẩn',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19,
    subdomains: ['a', 'b', 'c'],
  },
  esri: {
    name: 'Bản đồ Đường phố (Esri Street)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; National Geographic, DeLorme, NAVTEQ',
    maxZoom: 18,
    subdomains: [],
  },
  topo: {
    name: 'Địa Hình (Topo)',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap contributors',
    maxZoom: 17,
    subdomains: ['a', 'b', 'c'],
  },
};

export default function WorldMap({ attackPins = [], height = '100%' }) {
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const layerGroupRef = useRef(null);
  const [mapTheme, setMapTheme] = useState('osm');

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [16.0, 107.5], // Centered on Vietnam
        zoom: 4,
        minZoom: 2,
        maxZoom: 18,
        worldCopyJump: true,
        zoomControl: false,
      });

      // Add zoom control to top-right
      L.control.zoom({ position: 'topright' }).addTo(map);

      // Add default tile layer (CartoDB Light Clean)
      const selected = TILE_PROVIDERS[mapTheme] || TILE_PROVIDERS.light;
      const tileLayer = L.tileLayer(selected.url, {
        attribution: selected.attribution,
        maxZoom: selected.maxZoom,
        subdomains: selected.subdomains,
      }).addTo(map);
      tileLayerRef.current = tileLayer;

      // Layer group for dynamic markers and attack trajectories
      const layerGroup = L.layerGroup().addTo(map);
      layerGroupRef.current = layerGroup;

      mapInstanceRef.current = map;
    }

    const map = mapInstanceRef.current;
    
    // Invalidate size immediately and after transitions so map never disappears
    map.invalidateSize();
    const t1 = setTimeout(() => map.invalidateSize(), 150);
    const t2 = setTimeout(() => map.invalidateSize(), 500);

    const handleResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  // Handle Map Theme Change
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const map = mapInstanceRef.current;
    const selected = TILE_PROVIDERS[mapTheme] || TILE_PROVIDERS.light;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const newTileLayer = L.tileLayer(selected.url, {
      attribution: selected.attribution,
      maxZoom: selected.maxZoom,
      subdomains: selected.subdomains,
    }).addTo(map);

    tileLayerRef.current = newTileLayer;
    setTimeout(() => map.invalidateSize(), 100);
  }, [mapTheme]);

  // Update WAF Protected Node & Attack Pins dynamically
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;
    const map = mapInstanceRef.current;
    const layerGroup = layerGroupRef.current;
    layerGroup.clearLayers();

    // 1. Target WAF Protected Server Node (TP. Hồ Chí Minh, Vietnam)
    const targetIcon = L.divIcon({
      className: 'target-waf-radar-pin',
      html: `
        <div class="waf-radar-pulse-wrapper">
          <div class="waf-radar-pulse-ring ring-1"></div>
          <div class="waf-radar-pulse-ring ring-2"></div>
          <div class="waf-radar-core-shield" style="background:#10b981; border: 2px solid #ffffff; box-shadow: 0 2px 8px rgba(16,185,129,0.5);">
            <i class="fa-solid fa-shield-halved" style="color:#ffffff;"></i>
          </div>
        </div>
      `,
      iconSize: [44, 44],
      iconAnchor: [22, 22],
    });

    L.marker([10.8231, 106.6297], { icon: targetIcon })
      .addTo(layerGroup)
      .bindPopup(`
        <div class="soc-map-popup target-node-popup" style="background:#ffffff; color:#0f172a; padding:12px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.15); min-width:240px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
            <span style="font-weight:700; color:#10b981; font-size:12px;">🛡️ TRUNG TÂM PHÒNG THỦ WAF</span>
          </div>
          <div style="font-size:12px; line-height:1.6; color:#334155;">
            <div><b>Vị trí:</b> TP. Hồ Chí Minh, Việt Nam 🇻🇳</div>
            <div><b>Engine:</b> Coraza SPOA v3 + OWASP CRS</div>
            <div><b>Reverse Proxy:</b> HAProxy 2.8 Gateway</div>
            <div><b>IP Máy chủ:</b> <code style="background:#f1f5f9; padding:1px 6px; border-radius:4px; font-weight:700; color:#2563eb;">192.168.246.100</code></div>
            <div><b>Trạng thái:</b> <span style="color:#10b981; font-weight:700;">ĐANG BẢO VỆ 24/7</span></div>
          </div>
        </div>
      `);

    if (!attackPins || attackPins.length === 0) return;

    // 2. Render each attacker IP pin
    attackPins.forEach((pin, idx) => {
      const lat = parseFloat(pin.lat || pin.latitude || 10.8231);
      const lng = parseFloat(pin.lng || pin.longitude || 106.6297);
      if (isNaN(lat) || isNaN(lng)) return;

      const isLatest = idx === attackPins.length - 1;
      const attackType = pin.attack_type || pin.attackType || 'OWASP Threat';
      const ip = pin.client_ip || pin.access_ip || pin.ip || pin.bad_ip || '192.168.246.1';
      const country = pin.country || pin.country_name || pin.ip_area || 'Vietnam';
      const flag = pin.flag || '🌐';

      let threatColor = '#f59e0b';
      if (attackType.includes('SQL') || attackType.includes('RCE') || attackType.includes('Command')) {
        threatColor = '#ef4444';
      } else if (attackType.includes('XSS')) {
        threatColor = '#f97316';
      } else if (attackType.includes('Traversal') || attackType.includes('LFI')) {
        threatColor = '#ec4899';
      } else if (attackType.includes('Scanner') || attackType.includes('Probe')) {
        threatColor = '#8b5cf6';
      }

      const attackIcon = L.divIcon({
        className: 'attacker-radar-pin',
        html: `
          <div class="attacker-pin-wrapper" style="--threat-color: ${threatColor}">
            ${isLatest ? `<div class="attacker-pulse-wave"></div>` : ''}
            <div class="attacker-core-dot" style="background: ${threatColor}; border: 2px solid #ffffff; box-shadow: 0 2px 8px ${threatColor}66;">
              <span class="attacker-pin-flag">${flag}</span>
            </div>
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16],
      });

      const marker = L.marker([lat, lng], { icon: attackIcon }).addTo(layerGroup);
      
      marker.bindPopup(`
        <div class="soc-map-popup threat-node-popup" style="background:#ffffff; color:#0f172a; padding:12px; border-radius:8px; box-shadow:0 10px 25px rgba(0,0,0,0.15); min-width:240px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid #fee2e2; padding-bottom:6px;">
            <span style="font-weight:700; color:#ef4444; font-size:12px;">🚨 TẤN CÔNG BỊ CHẶN (403)</span>
            <span style="font-size:11px; color:#64748b;">${pin.access_time || 'Vừa xong'}</span>
          </div>
          <div style="font-size:12px; line-height:1.6; color:#334155;">
            <div><b>IP Nguồn:</b> <code style="color:${threatColor}; font-weight:700; background:#fef2f2; padding:1px 6px; border-radius:4px;">${ip}</code></div>
            <div><b>Quốc gia:</b> ${flag} ${country}</div>
            <div><b>Loại mã độc:</b> <span style="background:${threatColor}15; color:${threatColor}; font-weight:600; padding:1px 6px; border-radius:4px; border:1px solid ${threatColor}33;">${attackType}</span></div>
            <div><b>Mục tiêu URI:</b> <code style="max-width:200px; word-break:break-all; background:#f1f5f9; padding:1px 4px; border-radius:4px;">${pin.uri || '/'}</code></div>
            <div><b>Phản hồi:</b> <b style="color:#ef4444;">403 Forbidden (Blocked by WAF)</b></div>
          </div>
        </div>
      `);

      if (isLatest && attackPins.length <= 5) {
        marker.openPopup();
      }

      // Draw attack trajectory arc converging to Vietnam WAF Node
      if (Math.abs(lat - 10.8231) > 0.05 || Math.abs(lng - 106.6297) > 0.05) {
        const midLat = (lat + 10.8231) / 2 + (lng - 106.6297) * 0.1;
        const midLng = (lng + 106.6297) / 2 + (10.8231 - lat) * 0.1;

        L.polyline(
          [
            [lat, lng],
            [midLat, midLng],
            [10.8231, 106.6297],
          ],
          {
            color: threatColor,
            weight: isLatest ? 2.8 : 2.0,
            opacity: isLatest ? 0.95 : 0.7,
            dashArray: '5, 7',
            className: 'animated-threat-trajectory',
          }
        ).addTo(layerGroup);
      }
    });
  }, [attackPins]);

  const handleCenterVietnam = () => {
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setView([16.0, 107.5], 4, { animate: true });
    }
  };

  const handleFitAllPins = () => {
    if (!mapInstanceRef.current || !attackPins || attackPins.length === 0) return;
    const bounds = L.latLngBounds([[10.8231, 106.6297]]);
    attackPins.forEach((p) => {
      const lat = parseFloat(p.lat || p.latitude);
      const lng = parseFloat(p.lng || p.longitude);
      if (!isNaN(lat) && !isNaN(lng)) {
        bounds.extend([lat, lng]);
      }
    });
    mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
  };

  return (
    <div
      className="threat-map-outer-wrapper"
      style={{
        height,
        minHeight: '330px',
        position: 'relative',
        width: '100%',
        overflow: 'hidden',
        borderRadius: '10px',
        background: '#f8fafc',
        border: '1px solid #e2e8f0',
      }}
    >
      {/* Map Interactive Toolbar (Light Theme) */}
      <div
        style={{
          position: 'absolute',
          top: '12px',
          left: '12px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          padding: '6px 10px',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
        }}
      >
        <div style={{ display: 'flex', gap: '4px' }}>
          <button
            onClick={() => setMapTheme('osm')}
            style={{
              border: 'none',
              background: mapTheme === 'osm' ? '#2563eb' : 'transparent',
              color: mapTheme === 'osm' ? '#ffffff' : '#475569',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <i className="fa-solid fa-map" style={{ marginRight: '4px' }}></i> OSM Sáng
          </button>
          <button
            onClick={() => setMapTheme('esri')}
            style={{
              border: 'none',
              background: mapTheme === 'esri' ? '#2563eb' : 'transparent',
              color: mapTheme === 'esri' ? '#ffffff' : '#475569',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <i className="fa-solid fa-road" style={{ marginRight: '4px' }}></i> Đường Phố
          </button>
          <button
            onClick={() => setMapTheme('topo')}
            style={{
              border: 'none',
              background: mapTheme === 'topo' ? '#2563eb' : 'transparent',
              color: mapTheme === 'topo' ? '#ffffff' : '#475569',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            <i className="fa-solid fa-mountain" style={{ marginRight: '4px' }}></i> Địa Hình
          </button>
        </div>

        <div style={{ width: '1px', height: '18px', background: '#e2e8f0', margin: '0 2px' }} />

        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            onClick={handleCenterVietnam}
            style={{
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#0f172a',
              fontSize: '11.5px',
              fontWeight: 600,
              padding: '4px 10px',
              borderRadius: '5px',
              cursor: 'pointer',
            }}
            title="Định vị về trung tâm Việt Nam"
          >
            <i className="fa-solid fa-location-crosshairs" style={{ color: '#16a34a', marginRight: '4px' }}></i> Việt Nam 🇻🇳
          </button>
          {attackPins.length > 0 && (
            <button
              onClick={handleFitAllPins}
              style={{
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#0f172a',
                fontSize: '11.5px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '5px',
                cursor: 'pointer',
              }}
              title="Xem toàn bộ nguồn tấn công"
            >
              <i className="fa-solid fa-arrows-to-eye" style={{ color: '#2563eb', marginRight: '4px' }}></i> Bao quát ({attackPins.length})
            </button>
          )}
        </div>
      </div>

      {/* Leaflet Map DOM Container */}
      <div
        ref={mapContainerRef}
        className="geo-map-container"
        style={{ width: '100%', height: '100%', minHeight: '330px', background: '#e5e7eb' }}
      />

      {/* Threat Severity Gradient Indicator (Light Theme) */}
      <div
        style={{
          position: 'absolute',
          bottom: '12px',
          left: '12px',
          zIndex: 1000,
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(6px)',
          padding: '6px 12px',
          borderRadius: '8px',
          border: '1px solid #cbd5e1',
          boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          color: '#334155',
          fontSize: '11px',
          fontWeight: 600,
        }}
      >
        <span style={{ color: '#0f172a' }}>
          <i className="fa-solid fa-shield-virus" style={{ color: '#ef4444', marginRight: '4px' }}></i> Mức độ đe dọa:
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444' }}></span> SQLi / RCE
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#f97316' }}></span> XSS
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ec4899' }}></span> LFI / Traversal
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#8b5cf6' }}></span> Scanner
        </div>
      </div>
    </div>
  );
}
