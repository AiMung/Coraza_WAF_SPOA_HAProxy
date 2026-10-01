import React, { useState, useEffect, useMemo } from 'react';
import WorldMap from '../components/WorldMap';
import { wafApi } from '../api/client';

export default function AttackMap({
  attackPins = [],
  liveLogs = [],
  stats = {},
  onSimulateAttack,
  onAddBlacklist,
}) {
  const [simulating, setSimulating] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [fastBanLoading, setFastBanLoading] = useState(null);
  const [banSuccessMsg, setBanSuccessMsg] = useState('');
  const [radarActive, setRadarActive] = useState(true);
  const [currentTime, setCurrentTime] = useState('');

  // Realtime clock
  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('vi-VN', {
          timeZone: 'Asia/Ho_Chi_Minh',
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }) + ' (GMT+7 Hà Nội)'
      );
    };
    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleSim = async (type) => {
    setSimulating(type);
    if (onSimulateAttack) {
      await onSimulateAttack(type);
    }
    setSimulating('');
  };

  const handleFastBan = async (ip, e) => {
    e.stopPropagation();
    if (!ip || fastBanLoading) return;
    setFastBanLoading(ip);
    try {
      if (onAddBlacklist) {
        await onAddBlacklist(ip, 'Fast-Ban từ SOC Operations Center');
      } else {
        await wafApi.addIpRule({
          ip,
          rule_type: 'blacklist',
          reason: 'Phát hiện bởi SOC Security Center Live Stream',
          ttl_seconds: 86400,
        });
      }
      setBanSuccessMsg(`Đã đưa ${ip} vào Blacklist tầng 1 thành công!`);
      setTimeout(() => setBanSuccessMsg(''), 4000);
    } catch (err) {
      alert('Không thể cấm IP: ' + err.message);
    } finally {
      setFastBanLoading(null);
    }
  };

  // Process live logs for SOC Incident Feed
  const recentIncidents = useMemo(() => {
    const raw = (liveLogs && liveLogs.length > 0) ? liveLogs : (stats.latest_news || []);
    if (filterType === 'all') return raw.slice(0, 15);
    return raw.filter((item) => {
      const type = (item.attack_type || '').toLowerCase();
      return type.includes(filterType.toLowerCase());
    }).slice(0, 15);
  }, [liveLogs, stats.latest_news, filterType]);

  // Attack severity helpers
  const getSeverityBadge = (type = '', ruleId = 0) => {
    const t = type.toLowerCase();
    const r = String(ruleId);
    if (t.includes('sql') || t.includes('rce') || r.startsWith('942') || r.startsWith('932')) {
      return { label: 'CRITICAL', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
    }
    if (t.includes('xss') || t.includes('traversal') || t.includes('lfi') || r.startsWith('941') || r.startsWith('930')) {
      return { label: 'HIGH', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)' };
    }
    if (t.includes('cc') || t.includes('flood') || t.includes('scanner') || r === '10003' || r === '10002') {
      return { label: 'MEDIUM', color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)' };
    }
    return { label: 'LOW', color: '#38bdf8', bg: 'rgba(56, 189, 248, 0.15)' };
  };

  const totalAttacks = stats.total_attacks || 0;
  const attacksToday = stats.attacks_today || 0;
  const sitesCount = stats.protected_sites_count || 2;

  return (
    <div className="aawaf-dashboard-page" style={{ padding: '0 0 24px 0' }}>
      {/* 1. SOC Command Center Top Bar */}
      <div
        className="dashboard-card"
        style={{
          padding: '16px 20px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid #10b981',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                color: '#10b981',
                boxShadow: '0 0 15px rgba(16, 185, 129, 0.4)',
              }}
            >
              <i className="fa-solid fa-satellite-dish fa-spin" style={{ animationDuration: '8s' }}></i>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                  aaWAF SOC Command Center
                </h2>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: 'rgba(16, 185, 129, 0.2)',
                    color: '#34d399',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    letterSpacing: '0.5px',
                  }}
                >
                  <i className="fa-solid fa-circle" style={{ fontSize: '7px', marginRight: '5px', animation: 'pulse 1.5s infinite' }}></i>
                  LIVE RADAR ACTIVE
                </span>
              </div>
              <p style={{ fontSize: '12px', color: '#94a3b8', margin: '3px 0 0 0' }}>
                Trung tâm Điều hành & Giám sát An ninh Mạng Quốc gia · Coraza SPOA + HAProxy Dual-Layer Defense
              </p>
            </div>
          </div>

          {/* Operational Metrics Cards */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Thời Gian Hệ Thống</div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8', fontFamily: 'monospace' }}>{currentTime}</div>
            </div>

            <div style={{ textAlign: 'right', borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '16px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Tỷ Lệ Ngăn Chặn</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#10b981' }}>99.98% BLOCKED</div>
            </div>

            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Tổng Sự Cố Đã Chặn</div>
              <div style={{ fontSize: '16px', fontWeight: 800, color: '#f43f5e' }}>{totalAttacks.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {banSuccessMsg && (
          <div
            style={{
              marginTop: '12px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(16, 185, 129, 0.25)',
              border: '1px solid #10b981',
              color: '#a7f3d0',
              fontSize: '12.5px',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <i className="fa-solid fa-check-circle"></i>
            {banSuccessMsg}
          </div>
        )}
      </div>

      {/* 2. Main SOC Grid: Radar Map (Left) + Live Incident Stream (Right) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.8fr) minmax(0, 1.2fr)', gap: '16px' }}>
        {/* LEFT COLUMN: Threat Radar Map & Simulation Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            className="dashboard-card"
            style={{
              padding: '16px',
              background: '#0b1329',
              borderRadius: '14px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {/* Header of Radar Map */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }}></span>
                <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#f1f5f9' }}>
                  Bản Đồ Nguồn Gốc Tấn Công GeoIP Quốc Tế
                </span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>({attackPins.length} trạm phát hiện)</span>
              </div>

              {/* Simulation Quick Launch Bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>Test đe dọa:</span>
                <button
                  className="btn-sim-pill red"
                  style={{ fontSize: '11px', padding: '4px 9px' }}
                  onClick={() => handleSim('sqli')}
                  disabled={!!simulating}
                  title="Mô phỏng SQL Injection"
                >
                  <i className="fa-solid fa-database"></i> SQLi
                </button>
                <button
                  className="btn-sim-pill orange"
                  style={{ fontSize: '11px', padding: '4px 9px' }}
                  onClick={() => handleSim('xss')}
                  disabled={!!simulating}
                  title="Mô phỏng Cross-Site Scripting"
                >
                  <i className="fa-solid fa-code"></i> XSS
                </button>
                <button
                  className="btn-sim-pill purple"
                  style={{ fontSize: '11px', padding: '4px 9px' }}
                  onClick={() => handleSim('cc')}
                  disabled={!!simulating}
                  title="Mô phỏng CC Flood / Rate Limit"
                >
                  <i className="fa-solid fa-bolt"></i> CC Flood
                </button>
                <button
                  className="btn-sim-pill gray"
                  style={{ fontSize: '11px', padding: '4px 9px' }}
                  onClick={() => handleSim('scanner')}
                  disabled={!!simulating}
                  title="Mô phỏng Scanner sqlmap/nikto"
                >
                  <i className="fa-solid fa-robot"></i> Scanner
                </button>
              </div>
            </div>

            {/* Map Container with High-Tech Frame */}
            <div
              style={{
                height: '460px',
                borderRadius: '10px',
                overflow: 'hidden',
                position: 'relative',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                background: '#040d21',
              }}
            >
              <WorldMap attackPins={attackPins} height="100%" />

              {/* Radar HUD Crosshair & Grid Overlay */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  pointerEvents: 'none',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  backgroundImage: 'radial-gradient(circle, rgba(16, 185, 129, 0.05) 1px, transparent 1px)',
                  backgroundSize: '24px 24px',
                }}
              />
            </div>
          </div>

          {/* Defense Posture & Matrix Strip */}
          <div
            className="dashboard-card"
            style={{
              padding: '16px',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: '12px',
              background: '#ffffff',
            }}
          >
            <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TẦNG 1: HAPROXY ACL</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-shield" style={{ color: '#10b981' }}></i>
                Hoạt Động (Fast-Path)
              </div>
              <div style={{ fontSize: '11px', color: '#10b981', marginTop: '2px' }}>Độ trễ: &lt; 0.5ms</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>TẦNG 2: CORAZA SPOA</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-lock" style={{ color: '#3b82f6' }}></i>
                OWASP CRS v4.0
              </div>
              <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '2px' }}>Phân tích sâu Payload</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>CHỐNG CC & BOT</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-brain" style={{ color: '#8b5cf6' }}></i>
                PoW Challenge
              </div>
              <div style={{ fontSize: '11px', color: '#8b5cf6', marginTop: '2px' }}>Ngưỡng 20 req/10s</div>
            </div>

            <div style={{ padding: '12px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600 }}>CẢNH BÁO TỨC THỜI</div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-brands fa-telegram" style={{ color: '#0284c7' }}></i>
                Telegram Bot + WS
              </div>
              <div style={{ fontSize: '11px', color: '#0284c7', marginTop: '2px' }}>Phát thanh thời gian thực</div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Live SOC Incident Stream & Fast Response Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            className="dashboard-card"
            style={{
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              height: '100%',
              minHeight: '580px',
              background: '#ffffff',
            }}
          >
            {/* Stream Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#ef4444',
                    animation: 'pulse 1.2s infinite',
                  }}
                />
                <h3 style={{ fontSize: '14.5px', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  Dòng Sự Cố An Ninh Trực Tiếp (Live Incident Feed)
                </h3>
              </div>
              <span style={{ fontSize: '11.5px', color: '#64748b', fontWeight: 600 }}>
                {recentIncidents.length} sự cố gần nhất
              </span>
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
              {['all', 'sql', 'xss', 'flood', 'scanner', 'lfi'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: filterType === f ? '1px solid #10b981' : '1px solid #e2e8f0',
                    background: filterType === f ? '#10b981' : '#f8fafc',
                    color: filterType === f ? '#ffffff' : '#64748b',
                    cursor: 'pointer',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                  }}
                >
                  {f === 'all' ? 'Tất cả' : f}
                </button>
              ))}
            </div>

            {/* Incident Feed List */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '480px',
                paddingRight: '4px',
              }}
            >
              {recentIncidents.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8' }}>
                  <i className="fa-solid fa-shield-heart" style={{ fontSize: '36px', color: '#10b981', marginBottom: '10px' }}></i>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Chưa ghi nhận sự cố mới</div>
                  <div style={{ fontSize: '11.5px', marginTop: '4px' }}>Hệ thống đang hoạt động an toàn và bảo vệ nghiêm ngặt.</div>
                </div>
              ) : (
                recentIncidents.map((item, idx) => {
                  const sev = getSeverityBadge(item.attack_type, item.rule_id);
                  const ip = item.bad_ip || item.client_ip || '127.0.0.1';
                  const isBanning = fastBanLoading === ip;

                  return (
                    <div
                      key={item.id || item.txn_id || idx}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        background: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              color: sev.color,
                              background: sev.bg,
                            }}
                          >
                            {sev.label}
                          </span>
                          <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>
                            {item.attack_type || 'General Threat'}
                          </span>
                        </div>
                        <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                          {item.access_time || item.timestamp ? new Date(item.access_time || item.timestamp).toLocaleTimeString('vi-VN') : 'Mới đây'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '11.5px', color: '#475569' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#1e293b', fontFamily: 'monospace' }}>
                            {ip}
                          </span>
                          <span style={{ color: '#64748b' }}>
                            {item.ip_area ? `(${item.ip_area})` : ''}
                          </span>
                        </div>

                        {/* 1-Click Fast Ban Action */}
                        <button
                          onClick={(e) => handleFastBan(ip, e)}
                          disabled={isBanning}
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '5px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: '1px solid #fca5a5',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                          title="Cấm địa chỉ IP này vào Blacklist tầng 1 ngay lập tức"
                        >
                          <i className={`fa-solid ${isBanning ? 'fa-spinner fa-spin' : 'fa-ban'}`}></i>
                          {isBanning ? 'Đang cấm...' : 'Cấm IP'}
                        </button>
                      </div>

                      <div
                        style={{
                          fontSize: '11px',
                          color: '#64748b',
                          background: '#ffffff',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          border: '1px solid #f1f5f9',
                          fontFamily: 'monospace',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={item.uri || ''}
                      >
                        <span style={{ color: '#0284c7', fontWeight: 600 }}>URI:</span> {item.uri || '/'}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
