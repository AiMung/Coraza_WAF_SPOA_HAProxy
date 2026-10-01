import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function RecaptchaBot() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [sites, setSites] = useState([]);

  // Bot Defense State
  const [config, setConfig] = useState({
    cc_enabled: true,
    cc_threshold: 50,
    cc_action: 'challenge',
    challenge_mode: 'autonomous_js',
    turnstile_site_key: '',
    turnstile_secret_key: '',
    block_scanners: true,
    pass_ttl_minutes: 120,
    target_scope: 'all',
    target_site_ids: [],
  });

  const [simPoWProgress, setSimPoWProgress] = useState(0);
  const [simRunning, setSimRunning] = useState(false);
  const [ccSimRunning, setCcSimRunning] = useState(false);
  const [ccSimLogs, setCcSimLogs] = useState([]);

  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [botData, sitesData] = await Promise.all([
        wafApi.botDefense(),
        wafApi.sites().catch(() => []),
      ]);

      if (botData && typeof botData === 'object') {
        setConfig((prev) => ({
          ...prev,
          ...botData,
          target_scope: botData.target_scope || 'all',
          target_site_ids: Array.isArray(botData.target_site_ids) ? botData.target_site_ids : [],
        }));
      }
      if (Array.isArray(sitesData)) {
        setSites(sitesData);
      }
    } catch (err) {
      showToast('Lỗi nạp cấu hình Bot Defense: ' + (err.message || err), 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleToggleSite = (siteId) => {
    setConfig((prev) => {
      const current = prev.target_site_ids || [];
      const exists = current.includes(siteId);
      const updated = exists ? current.filter((id) => id !== siteId) : [...current, siteId];
      return { ...prev, target_site_ids: updated };
    });
  };

  const handleSelectAllSites = () => {
    const allIds = sites.map((s) => s.id);
    setConfig((prev) => ({ ...prev, target_site_ids: allIds }));
  };

  const handleClearSites = () => {
    setConfig((prev) => ({ ...prev, target_site_ids: [] }));
  };

  const applyPreset = (presetName) => {
    if (presetName === 'standard') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 60,
        cc_action: 'challenge',
        challenge_mode: 'autonomous_js',
        block_scanners: true,
        pass_ttl_minutes: 120,
      }));
      showToast('Đã áp dụng mẫu: Cân Bằng Tiêu Chuẩn (Standard Defense)');
    } else if (presetName === 'ecommerce') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 30,
        cc_action: 'challenge',
        challenge_mode: 'turnstile',
        block_scanners: true,
        pass_ttl_minutes: 30,
      }));
      showToast('Đã áp dụng mẫu: E-Commerce & Chống Vét Hàng (Aggressive Bot Shield)');
    } else if (presetName === 'api') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 150,
        cc_action: 'block_429',
        block_scanners: true,
        pass_ttl_minutes: 60,
      }));
      showToast('Đã áp dụng mẫu: Cổng Dịch Vụ API (Rate Limit 429 - Không Challenge HTML)');
    } else if (presetName === 'under_attack') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 15,
        cc_action: 'challenge',
        challenge_mode: 'autonomous_js',
        block_scanners: true,
        pass_ttl_minutes: 15,
      }));
      showToast('Đã kích hoạt: Chế Độ Dưới Tấn Công (Under Attack Mode)', 'err');
    }
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const res = await wafApi.saveBotDefense(config);
      showToast(res.message || 'Đã lưu cấu hình CC & Bot Defense thành công!');
    } catch (err) {
      showToast('Lỗi lưu cấu hình: ' + (err.message || err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const handlePreviewChallenge = () => {
    window.open('/waf-challenge?return_url=' + encodeURIComponent(window.location.pathname), '_blank');
  };

  const runSimulation = () => {
    if (simRunning) return;
    setSimRunning(true);
    setSimPoWProgress(0);
    const interval = setInterval(() => {
      setSimPoWProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          setSimRunning(false);
          return 100;
        }
        return prev + Math.floor(Math.random() * 20) + 15;
      });
    }, 150);
  };

  const runCCFloodTest = async () => {
    if (ccSimRunning) return;
    setCcSimRunning(true);
    setCcSimLogs([]);

    const addLog = (msg, status = 'info') => {
      setCcSimLogs((prev) => [
        ...prev,
        {
          id: Date.now() + Math.random(),
          time: new Date().toLocaleTimeString('vi-VN'),
          msg,
          status,
        },
      ]);
    };

    addLog('Khởi động kịch bản kiểm thử HTTP Flood Burst (30 req / 2s)...', 'info');

    try {
      for (let i = 1; i <= 8; i++) {
        await new Promise((r) => setTimeout(r, 120));
        if (i <= 4) {
          addLog(`Req #${i} -> GET /api/search?q=test [HTTP 200 OK] (Hợp lệ)`, 'ok');
        } else {
          addLog(`Req #${i} -> Vượt ngưỡng ${config.cc_threshold} req/10s -> Kích hoạt Challenge 429 [ĐÃ CHẶN]`, 'warn');
        }
      }

      await wafApi.simulate('cc');
      addLog('Đã ghi nhận sự kiện CC Attack Log vào SQLite Database!', 'ok');
      showToast('Hoàn tất mô phỏng tấn công CC Flood thành công!');
    } catch (err) {
      addLog('Lỗi chạy kiểm thử: ' + err.message, 'err');
    } finally {
      setCcSimRunning(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '60px', textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '32px', color: '#10b981', marginBottom: '14px' }}></i>
        <div style={{ fontSize: '15px', fontWeight: 600 }}>Đang nạp cấu hình Smart Bot & CC Shield...</div>
      </div>
    );
  }

  const targetedCount = config.target_scope === 'all' ? sites.length : (config.target_site_ids || []).length;

  return (
    <div className="aawaf-dashboard-page" style={{ padding: '0 0 24px 0', color: '#0f172a' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 9999,
            padding: '12px 20px',
            borderRadius: '10px',
            background: toast.kind === 'err' ? '#ef4444' : '#10b981',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '13.5px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <i className={toast.kind === 'err' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} />
          {toast.message}
        </div>
      )}

      {/* 1. Header Banner */}
      <div
        className="dashboard-card"
        style={{
          padding: '18px 24px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(139, 92, 246, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(139, 92, 246, 0.2)',
              border: '1px solid #8b5cf6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              color: '#c084fc',
            }}
          >
            <i className="fa-solid fa-robot"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              Chống Tấn Công CC & Bot Thông Minh (Smart Anti-Bot & CC Shield)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              Cơ chế HAProxy Stick-Table Rate Limiting kết hợp Thử Thách Trình Duyệt Tự Động (PoW Challenge)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            type="button"
            onClick={handlePreviewChallenge}
            style={{
              height: '38px',
              padding: '0 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#ffffff',
              fontSize: '12.5px',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fa-solid fa-eye"></i> Xem Trang Challenge
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              height: '38px',
              padding: '0 20px',
              borderRadius: '8px',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
            }}
          >
            <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
            {saving ? 'Đang áp dụng...' : 'Lưu & Kích Hoạt'}
          </button>
        </div>
      </div>

      {/* 2. One-Click Defense Presets Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px', marginBottom: '18px' }}>
        {[
          { id: 'standard', title: 'Cân Bằng Tiêu Chuẩn', req: '60 req/10s', icon: 'fa-scale-balanced', color: '#10b981', desc: 'Thích hợp cho hầu hết website tin tức, blog và doanh nghiệp.' },
          { id: 'ecommerce', title: 'Thương Mại & Bán Lẻ', req: '30 req/10s', icon: 'fa-cart-shopping', color: '#3b82f6', desc: 'Bảo vệ giỏ hàng, chống spam vét deal và bot crawl giá.' },
          { id: 'api', title: 'Cổng Dịch Vụ API', req: '150 req/10s', icon: 'fa-code', color: '#f59e0b', desc: 'Chặn 429 trực tiếp, không hiển thị giao diện HTML challenge.' },
          { id: 'under_attack', title: 'Chế Độ Bị Tấn Công', req: '15 req/10s', icon: 'fa-fire-flame-curved', color: '#ef4444', desc: 'Nghiêm ngặt tối đa: Kiểm tra PoW hầu hết các lượt request.' },
        ].map((p) => (
          <div
            key={p.id}
            onClick={() => applyPreset(p.id)}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <span style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>{p.title}</span>
              <i className={`fa-solid ${p.icon}`} style={{ color: p.color, fontSize: '15px' }}></i>
            </div>
            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.4 }}>{p.desc}</div>
            <div style={{ fontSize: '11.5px', fontWeight: 700, color: p.color, marginTop: '8px' }}>
              Ngưỡng: {p.req}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Main 2-Column Responsive Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '18px', marginBottom: '18px' }}>
        {/* Left Column: Core Policy & Thresholds */}
        <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-sliders" style={{ color: '#8b5cf6' }}></i>
            Quy Chuẩn Chống Tấn Công CC & Ngưỡng Kích Hoạt
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Master CC Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Bảo Vệ Chống HTTP Flood (CC Defense)</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>Tự động phát hiện và chặn khi số request vượt ngưỡng cho phép</div>
              </div>
              <label className="switch-green" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.cc_enabled}
                  onChange={(e) => handleChange('cc_enabled', e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>

            {/* Threshold & Action */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Ngưỡng Kích Hoạt (req/10s)
                </label>
                <input
                  type="number"
                  value={config.cc_threshold}
                  onChange={(e) => handleChange('cc_threshold', Number(e.target.value))}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Hành Động Khi Vượt Ngưỡng
                </label>
                <select
                  value={config.cc_action}
                  onChange={(e) => handleChange('cc_action', e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 10px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12.5px',
                    background: '#ffffff',
                  }}
                >
                  <option value="challenge">🛡️ Thử Thách Browser (Challenge 302)</option>
                  <option value="block_429">⛔ Chặn Trực Tiếp (HTTP 429)</option>
                  <option value="auto_ban">🚫 Cấm IP Luôn (Auto-Ban Blacklist)</option>
                </select>
              </div>
            </div>

            {/* Challenge Mode Selection */}
            <div>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Phương Thức Thử Thách Trình Duyệt (Challenge Engine)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                <div
                  onClick={() => handleChange('challenge_mode', 'autonomous_js')}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: config.challenge_mode === 'autonomous_js' ? '2px solid #10b981' : '1px solid #cbd5e1',
                    background: config.challenge_mode === 'autonomous_js' ? '#f0fdf4' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                    ⚡ Proof-of-Work Tự Động (PoW)
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Chạy độc lập, không phụ thuộc Cloudflare hay bên thứ 3.
                  </div>
                </div>

                <div
                  onClick={() => handleChange('challenge_mode', 'turnstile')}
                  style={{
                    padding: '12px',
                    borderRadius: '8px',
                    border: config.challenge_mode === 'turnstile' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                    background: config.challenge_mode === 'turnstile' ? '#eff6ff' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                    🌐 Cloudflare Turnstile
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Captcha thông minh bảo mật tối cao của Cloudflare.
                  </div>
                </div>
              </div>
            </div>

            {/* Block Scanners Toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Chặn Scanners Tự Động (Scanner Shield)</div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>Chặn đứng sqlmap, nikto, acunetix, nessus, masscan ở tầng HAProxy</div>
              </div>
              <label className="switch-green" style={{ margin: 0 }}>
                <input
                  type="checkbox"
                  checked={config.block_scanners}
                  onChange={(e) => handleChange('block_scanners', e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
            </div>
          </div>
        </div>

        {/* Right Column: Protected Sites Scope */}
        <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-globe" style={{ color: '#0284c7' }}></i>
              Phạm Vi Áp Dụng (Target Sites Scope)
            </h3>
            <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
              {targetedCount} / {sites.length} Website
            </span>
          </div>

          <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
            Bạn có thể chọn bảo vệ toàn bộ hệ thống hoặc chỉ áp dụng chống CC cho các tên miền chỉ định:
          </p>

          {/* Scope Selector */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '14px' }}>
            <button
              type="button"
              onClick={() => handleChange('target_scope', 'all')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                border: config.target_scope === 'all' ? '2px solid #10b981' : '1px solid #cbd5e1',
                background: config.target_scope === 'all' ? '#f0fdf4' : '#ffffff',
                fontWeight: 700,
                fontSize: '12px',
                color: config.target_scope === 'all' ? '#15803d' : '#475569',
                cursor: 'pointer',
              }}
            >
              Toàn Bộ Website ({sites.length})
            </button>

            <button
              type="button"
              onClick={() => handleChange('target_scope', 'custom')}
              style={{
                flex: 1,
                padding: '8px',
                borderRadius: '6px',
                border: config.target_scope === 'custom' ? '2px solid #3b82f6' : '1px solid #cbd5e1',
                background: config.target_scope === 'custom' ? '#eff6ff' : '#ffffff',
                fontWeight: 700,
                fontSize: '12px',
                color: config.target_scope === 'custom' ? '#1d4ed8' : '#475569',
                cursor: 'pointer',
              }}
            >
              Website Chỉ Định
            </button>
          </div>

          {/* Site Checkbox List */}
          {config.target_scope === 'custom' && (
            <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', maxHeight: '240px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '8px' }}>
                <button
                  type="button"
                  onClick={handleSelectAllSites}
                  style={{ fontSize: '10.5px', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={handleClearSites}
                  style={{ fontSize: '10.5px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  Bỏ chọn
                </button>
              </div>

              {sites.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', padding: '16px' }}>
                  Chưa có website nào được đăng ký
                </div>
              ) : (
                sites.map((s) => {
                  const isChecked = (config.target_site_ids || []).includes(s.id);
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: '6px',
                        background: isChecked ? '#f0fdf4' : '#ffffff',
                        border: '1px solid #f1f5f9',
                        marginBottom: '6px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSite(s.id)}
                        />
                        <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.domain}</span>
                        <span style={{ fontSize: '11px', color: '#64748b' }}>({s.name})</span>
                      </div>
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', color: '#475569' }}>
                        {s.waf_mode || 'prevention'}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Interactive Simulator & Live Burst Tester */}
      <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <i className="fa-solid fa-vial-circle-check" style={{ color: '#10b981' }}></i>
          Trình Kiểm Thử Bộc Phát Tấn Công & Thử Thách PoW (Live Burst Tester)
        </h3>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)', gap: '18px' }}>
          {/* PoW Client Solver Simulator */}
          <div style={{ padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a', marginBottom: '8px' }}>
              Mô Phỏng Trình Duyệt Giải Mã PoW Challenge
            </div>
            <p style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '12px' }}>
              Kiểm tra khả năng tính toán hash SHA-256 trên trình duyệt client trước khi cấp cookie <code>waf_clearance</code>:
            </p>

            <div style={{ marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11.5px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                <span>Tiến trình giải thuật:</span>
                <span>{simPoWProgress}%</span>
              </div>
              <div style={{ height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{ width: `${simPoWProgress}%`, height: '100%', background: '#10b981', transition: 'width 0.15s ease' }}></div>
              </div>
            </div>

            <button
              type="button"
              onClick={runSimulation}
              disabled={simRunning}
              style={{
                width: '100%',
                height: '36px',
                borderRadius: '6px',
                border: '1px solid #10b981',
                background: '#ecfdf5',
                color: '#065f46',
                fontWeight: 700,
                fontSize: '12.5px',
                cursor: 'pointer',
              }}
            >
              {simRunning ? 'Đang giải mã Challenge...' : 'Chạy Thử Nghiệm PoW Solver'}
            </button>
          </div>

          {/* HTTP Flood Burst Tester Terminal */}
          <div style={{ padding: '16px', borderRadius: '10px', background: '#0f172a', color: '#ffffff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                Terminal Kiểm Thử HTTP Flood Tức Thời
              </span>
              <button
                type="button"
                onClick={runCCFloodTest}
                disabled={ccSimRunning}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  background: '#ef4444',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '11.5px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {ccSimRunning ? 'Đang bắn burst...' : 'Bắt Đầu Bắn HTTP Flood'}
              </button>
            </div>

            <div
              style={{
                height: '110px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '11.5px',
                background: '#040d21',
                padding: '8px 10px',
                borderRadius: '6px',
                border: '1px solid #1e293b',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {ccSimLogs.length === 0 ? (
                <span style={{ color: '#64748b' }}>Bấm "Bắt Đầu Bắn HTTP Flood" để quan sát luồng chặn...</span>
              ) : (
                ccSimLogs.map((l) => (
                  <div key={l.id} style={{ color: l.status === 'warn' ? '#f87171' : l.status === 'ok' ? '#34d399' : '#38bdf8' }}>
                    [{l.time}] {l.msg}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
