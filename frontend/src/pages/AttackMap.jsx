import React, { useState } from 'react';
import WorldMap from '../components/WorldMap';

export default function AttackMap({ attackPins = [], onSimulateAttack }) {
  const [simulating, setSimulating] = useState('');

  const handleSim = async (type) => {
    setSimulating(type);
    if (onSimulateAttack) {
      await onSimulateAttack(type);
    }
    setSimulating('');
  };

  return (
    <div className="aawaf-dashboard-page">
      <div className="dashboard-card" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-earth-americas" style={{ color: '#10b981' }}></i>
              Bản đồ Radar toàn cầu & Theo dõi nguồn gốc tấn công GeoIP
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
              Hiển thị tọa độ địa lý trực tiếp của các mối đe dọa đang tấn công vào hệ thống WAF tại Việt Nam
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 600, color: '#64748b' }}>Mô phỏng đe dọa:</span>
            <button
              className="btn-sim-pill red"
              onClick={() => handleSim('sqli')}
              disabled={!!simulating}
            >
              <i className="fa-solid fa-database"></i> SQLi
            </button>
            <button
              className="btn-sim-pill orange"
              onClick={() => handleSim('xss')}
              disabled={!!simulating}
            >
              <i className="fa-solid fa-code"></i> XSS
            </button>
            <button
              className="btn-sim-pill pink"
              onClick={() => handleSim('lfi')}
              disabled={!!simulating}
            >
              <i className="fa-solid fa-folder-open"></i> LFI
            </button>
          </div>
        </div>

        <div style={{ height: '580px', borderRadius: '12px', overflow: 'hidden' }}>
          <WorldMap attackPins={attackPins} height="100%" />
        </div>
      </div>
    </div>
  );
}
