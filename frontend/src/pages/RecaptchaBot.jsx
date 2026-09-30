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
    target_scope: 'all', // 'all' or 'custom'
    target_site_ids: [],
  });

  const [activeTab, setActiveTab] = useState('policy'); // 'policy', 'challenge', 'scanners', 'simulation'
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
    <div style={{ animation: 'fadeInPanel 0.25s ease', maxWidth: '1100px', margin: '0 auto', color: '#0f172a' }}>
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
            animation: 'slideUpToast 0.2s ease',
          }}
        >
          <i className={`fa-solid ${toast.kind === 'err' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. HERO COMMAND STATUS BANNER */}
      <div
        style={{
          background: 'radial-gradient(ellipse at top left, #064e3b 0%, #0f172a 70%)',
          borderRadius: '18px',
          padding: '26px 30px',
          color: '#ffffff',
          marginBottom: '20px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          boxShadow: '0 15px 35px -5px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '18px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span
              style={{
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                color: '#34d399',
                padding: '4px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Enterprise CC & Bot Engine
            </span>

            <span
              style={{
                background: config.cc_enabled ? '#10b981' : '#475569',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#ffffff', display: 'inline-block' }}></span>
              {config.cc_enabled ? 'Đang Bảo Vệ' : 'Tạm Dừng'}
            </span>

            <span
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                color: '#cbd5e1',
                fontWeight: 600,
              }}
            >
              Phạm vi: <strong style={{ color: '#ffffff' }}>{config.target_scope === 'all' ? 'Toàn Cục (All Sites)' : `Tùy Chọn (${targetedCount}/${sites.length} Site)`}</strong>
            </span>
          </div>

          <h2 style={{ fontSize: '23px', fontWeight: 800, marginTop: '10px', letterSpacing: '-0.5px', color: '#ffffff' }}>
            Chống Tấn Công CC & Xác Minh Người Thật (Bot Defense)
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px', maxWidth: '680px', lineHeight: 1.5 }}>
            Kiểm soát tốc độ yêu cầu (HTTP Flood) tại HAProxy Stick-Table, phân định rõ ràng giữa người dùng thật và bot tự động bằng thử thách Cloudflare Turnstile hoặc Autonomous Proof-of-Work JS.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handlePreviewChallenge}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              color: '#ffffff',
              padding: '10px 16px',
              borderRadius: '10px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <i className="fa-solid fa-arrow-up-right-from-square"></i>
            Xem Thử Thách
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#10b981',
              color: '#ffffff',
              border: 'none',
              padding: '11px 22px',
              borderRadius: '10px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
              transition: 'all 0.2s',
            }}
          >
            {saving ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i> Đang Lưu...
              </>
            ) : (
              <>
                <i className="fa-solid fa-cloud-arrow-up"></i> Áp Dụng Cấu Hình
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. 1-CLICK SECURITY PRESETS (MẪU CẤU HÌNH NHANH) */}
      <div style={{ marginBottom: '22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            ⚡ Mẫu Cấu Hình Doanh Nghiệp (1-Click Presets)
          </span>
          <span style={{ fontSize: '11.5px', color: '#94a3b8' }}>
            Chọn mẫu phù hợp với mô hình website của bạn để tự động điền các thông số tối ưu
          </span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '12px' }}>
          {/* Preset 1: Standard */}
          <div
            onClick={() => applyPreset('standard')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#10b981')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
              <i className="fa-solid fa-scale-balanced"></i>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Cân Bằng Tiêu Chuẩn</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                60 req/10s · Thử thách PoW · Cookie 2h. Phù hợp web tin tức & giới thiệu.
              </div>
            </div>
          </div>

          {/* Preset 2: E-Commerce */}
          <div
            onClick={() => applyPreset('ecommerce')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#f97316')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#fff7ed', color: '#ea580c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
              <i className="fa-solid fa-cart-shopping"></i>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Thương Mại Điện Tử</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                30 req/10s · Turnstile · Cookie 30m. Chống bot gom hàng & spam đơn.
              </div>
            </div>
          </div>

          {/* Preset 3: API Gateway */}
          <div
            onClick={() => applyPreset('api')}
            style={{
              background: '#ffffff',
              border: '1px solid #e2e8f0',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#e2e8f0')}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#eff6ff', color: '#2563eb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
              <i className="fa-solid fa-network-wired"></i>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Cổng Dịch Vụ API</div>
              <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px', lineHeight: 1.3 }}>
                150 req/10s · Trả 429 Too Many Req · Không trả trang HTML Challenge.
              </div>
            </div>
          </div>

          {/* Preset 4: Under Attack */}
          <div
            onClick={() => applyPreset('under_attack')}
            style={{
              background: '#fff1f2',
              border: '1px solid #fecdd3',
              borderRadius: '12px',
              padding: '14px 16px',
              cursor: 'pointer',
              transition: 'all 0.15s',
              display: 'flex',
              gap: '12px',
              alignItems: 'flex-start',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#e11d48')}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#fecdd3')}
          >
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ffe4e6', color: '#e11d48', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0 }}>
              <i className="fa-solid fa-triangle-exclamation"></i>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: '#9f1239' }}>Dưới Tấn Công (Panic)</div>
              <div style={{ fontSize: '11.5px', color: '#be123c', marginTop: '2px', lineHeight: 1.3 }}>
                15 req/10s · Challenge 100% kết nối mới. Kích hoạt khi bị DDoS L7.
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. NAVIGATION TABS */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '12px',
          marginBottom: '20px',
        }}
      >
        <button
          onClick={() => setActiveTab('policy')}
          style={{
            background: activeTab === 'policy' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'policy' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'policy' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 18px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-sliders"></i>
          1. Chính Sách & Phạm Vi Website
        </button>

        <button
          onClick={() => setActiveTab('challenge')}
          style={{
            background: activeTab === 'challenge' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'challenge' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'challenge' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 18px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-fingerprint"></i>
          2. Công Nghệ Thử Thách (Turnstile / PoW)
        </button>

        <button
          onClick={() => setActiveTab('scanners')}
          style={{
            background: activeTab === 'scanners' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'scanners' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'scanners' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 18px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-bug-slash"></i>
          3. Chặn Dò Quét Lỗ Hổng
        </button>

        <button
          onClick={() => setActiveTab('simulation')}
          style={{
            background: activeTab === 'simulation' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'simulation' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'simulation' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 18px',
            borderRadius: '9px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="fa-solid fa-play"></i>
          4. Thử Nghiệm Trực Quan (Live Sandbox)
        </button>
      </div>

      {/* 4. TAB CONTENTS */}

      {/* TAB 1: POLICY & PER-SITE SCOPE */}
      {activeTab === 'policy' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          {/* Section A: Global Toggle & Threshold */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  Phòng Thủ CC Attack & Giới Hạn Tần Suất
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Đếm số lượt truy cập từ mỗi địa chỉ IP trong khoảng thời gian 10 giây qua HAProxy Stick-Table
                </p>
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '18px' }}>
              {/* Threshold Slider */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Ngưỡng Kích Hoạt (CC Threshold):
                  </span>
                  <span style={{ fontSize: '14px', fontWeight: 800, color: '#059669', background: '#ecfdf5', padding: '2px 8px', borderRadius: '6px' }}>
                    {config.cc_threshold} req / 10s
                  </span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="200"
                  step="5"
                  value={config.cc_threshold}
                  onChange={(e) => handleChange('cc_threshold', parseInt(e.target.value, 10))}
                  style={{ width: '100%', accentColor: '#10b981', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginTop: '4px' }}>
                  <span>10 (Rất nghiêm ngặt)</span>
                  <span>50 (Khuyên Dùng)</span>
                  <span>200 (Thoải mái)</span>
                </div>
              </div>

              {/* Action */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '8px' }}>
                  Hành Động Khi Vượt Ngưỡng:
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: config.cc_action === 'challenge' ? 700 : 500, color: config.cc_action === 'challenge' ? '#065f46' : '#475569' }}>
                    <input
                      type="radio"
                      name="cc_action"
                      value="challenge"
                      checked={config.cc_action === 'challenge'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>🛡️ Thử Thách Trình Duyệt (Challenge Mode - Cloudflare/PoW)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: config.cc_action === 'block_429' ? 700 : 500, color: config.cc_action === 'block_429' ? '#065f46' : '#475569' }}>
                    <input
                      type="radio"
                      name="cc_action"
                      value="block_429"
                      checked={config.cc_action === 'block_429'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>🚫 Từ Chối Yêu Cầu (HTTP 429 Too Many Requests)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', cursor: 'pointer', fontWeight: config.cc_action === 'auto_ban' ? 700 : 500, color: config.cc_action === 'auto_ban' ? '#065f46' : '#475569' }}>
                    <input
                      type="radio"
                      name="cc_action"
                      value="auto_ban"
                      checked={config.cc_action === 'auto_ban'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>⛔ Chặn Đứng Tức Thì & Đưa Vào Blacklist 15 Phút (Auto-Ban)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Section B: GRANULAR PER-SITE TARGET SCOPE */}
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '22px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-crosshairs" style={{ color: '#059669' }}></i>
                  Phạm Vi Áp Dụng Chính Sách (Per-Site Policy Scope)
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Bạn có thể chọn áp dụng bảo vệ cho <strong>toàn bộ website</strong> hoặc <strong>chỉ kích hoạt trên các website mục tiêu cụ thể</strong> (ví dụ: tắt challenge trên các cổng API để không làm hỏng app).
                </p>
              </div>

              {config.target_scope === 'custom' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleSelectAllSites}
                    style={{ fontSize: '11.5px', background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Chọn Tất Cả
                  </button>
                  <button
                    onClick={handleClearSites}
                    style={{ fontSize: '11.5px', background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                  >
                    Bỏ Chọn
                  </button>
                </div>
              )}
            </div>

            {/* Scope Radios */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div
                onClick={() => handleChange('target_scope', 'all')}
                style={{
                  border: `2px solid ${config.target_scope === 'all' ? '#10b981' : '#e2e8f0'}`,
                  background: config.target_scope === 'all' ? '#f0fdf4' : '#ffffff',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="radio"
                    name="target_scope"
                    checked={config.target_scope === 'all'}
                    onChange={() => handleChange('target_scope', 'all')}
                    style={{ accentColor: '#10b981' }}
                  />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      🌐 Toàn Cục (Tất cả Website)
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                      Tự động bảo vệ tất cả các website đang được cấu hình trên WAF.
                    </div>
                  </div>
                </div>
              </div>

              <div
                onClick={() => handleChange('target_scope', 'custom')}
                style={{
                  border: `2px solid ${config.target_scope === 'custom' ? '#10b981' : '#e2e8f0'}`,
                  background: config.target_scope === 'custom' ? '#f0fdf4' : '#ffffff',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="radio"
                    name="target_scope"
                    checked={config.target_scope === 'custom'}
                    onChange={() => handleChange('target_scope', 'custom')}
                    style={{ accentColor: '#10b981' }}
                  />
                  <div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>
                      🎯 Tùy Chọn Từng Website Mục Tiêu
                    </div>
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                      Chỉ áp dụng CC & Challenge trên các website được tích chọn bên dưới.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Site Cards Selector (When Custom Scope selected) */}
            {config.target_scope === 'custom' && (
              <div
                style={{
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  gap: '10px',
                }}
              >
                {sites.length === 0 ? (
                  <div style={{ fontSize: '12.5px', color: '#94a3b8', padding: '10px' }}>
                    Chưa có website nào được đăng ký trong hệ thống. Hãy thêm website tại trang <strong>Website Protection</strong>.
                  </div>
                ) : (
                  sites.map((site) => {
                    const isChecked = (config.target_site_ids || []).includes(site.id);
                    return (
                      <div
                        key={site.id}
                        onClick={() => handleToggleSite(site.id)}
                        style={{
                          background: isChecked ? '#ecfdf5' : '#ffffff',
                          border: `1px solid ${isChecked ? '#10b981' : '#e2e8f0'}`,
                          borderRadius: '10px',
                          padding: '12px 14px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          transition: 'all 0.15s',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}} // handled by parent onClick
                            style={{ accentColor: '#10b981', cursor: 'pointer' }}
                          />
                          <div>
                            <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>
                              {site.name}
                            </div>
                            <div style={{ fontSize: '11.5px', color: '#64748b', fontFamily: 'monospace' }}>
                              {site.domain}
                            </div>
                          </div>
                        </div>

                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: isChecked ? '#10b981' : '#f1f5f9',
                            color: isChecked ? '#ffffff' : '#94a3b8',
                          }}
                        >
                          {isChecked ? 'Đang Bảo Vệ' : 'Bỏ Qua'}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: CHALLENGE ENGINE (TURNSTILE / POW) */}
      {activeTab === 'challenge' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '24px' }}>
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
              Công Nghệ Xác Minh Người Thật (Proof-of-Human Engine)
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '20px' }}>
              Lựa chọn phương thức xác thực khi hệ thống nghi ngờ một địa chỉ IP có hành vi tấn công tự động
            </p>

            {/* Mode Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '22px' }}>
              <div
                onClick={() => handleChange('challenge_mode', 'autonomous_js')}
                style={{
                  border: `2px solid ${config.challenge_mode === 'autonomous_js' ? '#10b981' : '#e2e8f0'}`,
                  background: config.challenge_mode === 'autonomous_js' ? '#f0fdf4' : '#ffffff',
                  padding: '18px',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-microchip" style={{ color: '#059669', fontSize: '18px' }}></i>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Tự Động (Proof-of-Work JS)</span>
                  </div>
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    Khuyên Dùng
                  </span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.4 }}>
                  Chạy hoàn toàn tự chủ trên máy chủ của bạn mà không cần đăng ký tài khoản bên ngoài. Trình duyệt giải bài toán SHA-256 ngầm trong 1.5 giây, người dùng không cần bấm bất kỳ nút nào.
                </p>
              </div>

              <div
                onClick={() => handleChange('challenge_mode', 'turnstile')}
                style={{
                  border: `2px solid ${config.challenge_mode === 'turnstile' ? '#10b981' : '#e2e8f0'}`,
                  background: config.challenge_mode === 'turnstile' ? '#f0fdf4' : '#ffffff',
                  padding: '18px',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-brands fa-cloudflare" style={{ color: '#f97316', fontSize: '20px' }}></i>
                    <span style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>Cloudflare Turnstile</span>
                  </div>
                  <span style={{ fontSize: '11px', background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: '6px', fontWeight: 700 }}>
                    Miễn Phí 100%
                  </span>
                </div>
                <p style={{ fontSize: '12.5px', color: '#64748b', lineHeight: 1.4 }}>
                  Sử dụng công nghệ Turnstile "Are you human" thông minh từ Cloudflare. Widget tích hợp tự động kiểm tra chứng chỉ trình duyệt với độ tin cậy cấp Enterprise.
                </p>
              </div>
            </div>

            {/* Turnstile Keys Box */}
            {config.challenge_mode === 'turnstile' && (
              <div style={{ background: '#f8fafc', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '22px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
                  <h5 style={{ fontSize: '13.5px', fontWeight: 800, color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-key" style={{ color: '#f97316' }}></i>
                    Cấu Hình Cặp Khóa Cloudflare Turnstile
                  </h5>
                  <a
                    href="https://dash.cloudflare.com/?to=/:account/turnstile"
                    target="_blank"
                    rel="noreferrer"
                    style={{ fontSize: '11.5px', color: '#2563eb', textDecoration: 'none', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>Lấy Khóa Miễn Phí Tại Cloudflare</span>
                    <i className="fa-solid fa-arrow-up-right-from-square" style={{ fontSize: '10px' }}></i>
                  </a>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '5px' }}>
                      Site Key (Khóa Công Khai):
                    </label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="0x4AAAAAA..."
                      value={config.turnstile_site_key}
                      onChange={(e) => handleChange('turnstile_site_key', e.target.value)}
                      style={{ fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>

                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '5px' }}>
                      Secret Key (Khóa Bí Mật Backend):
                    </label>
                    <input
                      type="password"
                      className="form-control"
                      placeholder="0x4AAAAAA..."
                      value={config.turnstile_secret_key}
                      onChange={(e) => handleChange('turnstile_secret_key', e.target.value)}
                      style={{ fontSize: '13px', fontFamily: 'monospace' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Clearance Cookie TTL */}
            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
                <div>
                  <span style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                    Thời Hạn Cookie Miễn Trừ (Pass Clearance TTL):
                  </span>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                    Sau khi người dùng vượt qua thử thách, hệ thống cấp cookie <code>waf_clearance</code> có chữ ký HMAC. Trình duyệt sẽ được truy cập tự do trong khoảng thời gian này.
                  </p>
                </div>

                <select
                  value={config.pass_ttl_minutes}
                  onChange={(e) => handleChange('pass_ttl_minutes', parseInt(e.target.value, 10))}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 700,
                    color: '#0f172a',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <option value={30}>30 phút (Nghiêm ngặt)</option>
                  <option value={60}>1 giờ</option>
                  <option value={120}>2 giờ (Mặc định)</option>
                  <option value={360}>6 giờ</option>
                  <option value={1440}>24 giờ (Thoải mái)</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCANNERS & BAD BOTS */}
      {activeTab === 'scanners' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  Chặn Đứng Công Cụ Dò Quét Lỗ Hổng Tự Động
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Trả về mã 403 Forbidden tức thời tại Tầng 1 HAProxy (dưới 1ms) đối với các công cụ tự động của hacker
                </p>
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

            <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '10px' }}>
                Các chữ ký User-Agent bị chặn tức thời:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['sqlmap', 'nikto', 'acunetix', 'nessus', 'masscan', 'nmap', 'gobuster', 'dirbuster', 'wpscan'].map((tool) => (
                  <span
                    key={tool}
                    style={{
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  >
                    <i className="fa-solid fa-ban" style={{ fontSize: '10px', marginRight: '6px' }}></i>
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '12.5px', color: '#059669', background: '#ecfdf5', padding: '14px 18px', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
              <i className="fa-solid fa-shield-heart" style={{ fontSize: '16px' }}></i>
              <span>Các bot tìm kiếm uy tín (Googlebot, Bingbot, DuckDuckGo) được miễn trừ tự động nhằm đảm bảo thứ hạng SEO và chỉ mục website không bị ảnh hưởng.</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: LIVE SIMULATION / SANDBOX */}
      {activeTab === 'simulation' && (
        <div style={{ display: 'grid', gap: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '14px', border: '1px solid #e2e8f0', padding: '24px' }}>
            <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
              Giả Lập Trải Nghiệm Thử Thách Trực Quan (Interactive Sandbox)
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '20px' }}>
              Trải nghiệm thực tế quy trình kiểm tra trình duyệt mà khách truy cập sẽ nhìn thấy khi bị hệ thống kích hoạt thử thách
            </p>

            <div
              style={{
                background: '#090d16',
                borderRadius: '16px',
                padding: '30px',
                maxWidth: '460px',
                margin: '0 auto',
                textAlign: 'center',
                boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            >
              <div style={{ width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: '#10b981', fontSize: '28px' }}>
                <i className="fa-solid fa-shield-halved"></i>
              </div>

              <h3 style={{ fontSize: '17px', fontWeight: 800, color: '#ffffff', marginBottom: '6px' }}>
                Kiểm Tra Tính An Toàn Trình Duyệt
              </h3>
              <p style={{ fontSize: '12px', color: '#94a3b8', lineHeight: 1.4, marginBottom: '20px' }}>
                {config.challenge_mode === 'turnstile'
                  ? 'Widget Cloudflare Turnstile đang xác minh chứng chỉ kết nối của bạn...'
                  : 'Thuật toán Proof-of-Work đang kiểm tra môi trường chạy JavaScript...'}
              </p>

              {config.challenge_mode === 'turnstile' ? (
                <div style={{ background: 'rgba(255,255,255,0.05)', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.1)', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                  <i className="fa-brands fa-cloudflare" style={{ color: '#f97316', fontSize: '24px' }}></i>
                  <span style={{ fontSize: '13px', color: '#f1f5f9', fontWeight: 600 }}>Cloudflare Turnstile Active Widget</span>
                </div>
              ) : (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.1)', height: '7px', borderRadius: '999px', overflow: 'hidden', marginBottom: '8px' }}>
                    <div style={{ width: `${simPoWProgress}%`, height: '100%', background: 'linear-gradient(90deg, #10b981, #06b6d4)', transition: 'width 0.15s ease' }}></div>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', fontFamily: 'monospace' }}>
                    {simPoWProgress === 0
                      ? 'Nhấn nút bên dưới để chạy thử'
                      : simPoWProgress < 100
                      ? `Đang tính toán Proof-of-Work: ${simPoWProgress}%`
                      : '✓ Xác minh hoàn tất! Cấp cookie waf_clearance'}
                  </div>
                </div>
              )}

              <button
                onClick={runSimulation}
                disabled={simRunning}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: '8px',
                  fontSize: '12.5px',
                  fontWeight: 700,
                  cursor: simRunning ? 'not-allowed' : 'pointer',
                }}
              >
                {simRunning ? 'Đang chạy giải thuật...' : 'Chạy Thử Giải Thuật PoW'}
              </button>
            </div>

            {/* CC Attack Live Test Tool */}
            <div style={{ marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <h4 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-bolt" style={{ color: '#f59e0b' }}></i>
                    Công Cụ Bắn Test Tấn Công CC Trực Tiếp (Live CC Flood Generator)
                  </h4>
                  <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                    Bắn một loạt 15 requests tốc độ cao vào HAProxy (cổng 80) để kiểm chứng cơ chế chặn đứng hoặc kích hoạt thử thách theo thời gian thực
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => {
                      document.cookie = "waf_clearance=; path=/; expires=Thu, 01 Jan 1970 00:00:00 UTC;";
                      showToast("Đã xóa cookie waf_clearance khỏi trình duyệt! Bạn có thể test lại từ đầu.");
                    }}
                    style={{
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '8px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-trash-can"></i>
                    Xóa Cookie Miễn Trừ
                  </button>

                  <button
                    onClick={async () => {
                      setCcSimRunning(true);
                      setCcSimLogs([]);
                      const results = [];
                      const targetHost = config.target_scope === 'custom' && sites.length > 0 ? sites[0].domain : window.location.hostname;
                      
                      for (let i = 1; i <= 15; i++) {
                        try {
                          const startTime = Date.now();
                          // Fetch from origin on port 80
                          const res = await fetch(`http://${targetHost}:80/?cc_probe=${i}_${Date.now()}`, {
                            cache: 'no-store',
                            headers: { 'X-Probe-Source': 'WAF-Console-Demo' }
                          });
                          const latency = Date.now() - startTime;
                          const isBlocked = res.status === 429 || res.status === 403 || res.redirected;
                          results.push({
                            seq: i,
                            status: res.status,
                            latency: `${latency}ms`,
                            blocked: isBlocked,
                            action: isBlocked ? (res.status === 429 ? '🚫 429 Too Many Req (Chặn Đứng)' : '🛡️ Kích hoạt Challenge') : '✓ 200 OK (Hợp lệ)'
                          });
                        } catch (err) {
                          results.push({
                            seq: i,
                            status: 'ERR',
                            latency: '0ms',
                            blocked: true,
                            action: '⛔ Bị WAF Reset Kết Nối'
                          });
                        }
                        setCcSimLogs([...results]);
                        await new Promise((r) => setTimeout(r, 60)); // Fast burst ~60ms
                      }
                      setCcSimRunning(false);
                      showToast('Đã hoàn tất bắn 15 requests kiểm thử CC!');
                    }}
                    disabled={ccSimRunning}
                    style={{
                      background: '#0f172a',
                      color: '#ffffff',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '8px',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: ccSimRunning ? 'not-allowed' : 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    {ccSimRunning ? (
                      <>
                        <i className="fa-solid fa-circle-notch fa-spin"></i> Đang bắn flood...
                      </>
                    ) : (
                      <>
                        <i className="fa-solid fa-rocket"></i> Bắn 15 Requests Kiểm Thử
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Terminal Logs View */}
              {ccSimLogs.length > 0 && (
                <div
                  style={{
                    background: '#090d16',
                    borderRadius: '12px',
                    padding: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '12px',
                    maxHeight: '260px',
                    overflowY: 'auto',
                  }}
                >
                  <div style={{ color: '#64748b', marginBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '6px' }}>
                    # Luồng phản hồi trực tiếp từ HAProxy Stick-Table (Ngưỡng cấu hình: {config.cc_threshold} req/10s):
                  </div>
                  {ccSimLogs.map((log) => (
                    <div
                      key={log.seq}
                      style={{
                        color: log.blocked ? '#f87171' : '#34d399',
                        padding: '3px 0',
                        display: 'flex',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        [Req #{log.seq}] HTTP {log.status} · {log.action}
                      </span>
                      <span style={{ color: '#64748b' }}>{log.latency}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Explanatory Box */}
              <div style={{ marginTop: '16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '10px', padding: '14px 18px', fontSize: '12px', color: '#1e40af', lineHeight: 1.5 }}>
                <strong>💡 Lưu ý quan trọng khi Demo thủ công bằng phím F5:</strong>
                <ul style={{ marginLeft: '18px', marginTop: '6px' }}>
                  <li><strong>Tốc độ phím F5:</strong> Một người bình thường bấm F5 liên tục chỉ đạt khoảng 2-3 req/giây (khoảng 20-30 req/10s), nếu để ngưỡng là 50 hay 60 thì sẽ chưa vượt ngưỡng. Để demo F5 thủ công, hãy chọn mẫu <strong>"Dưới Tấn Công (15 req/10s)"</strong> hoặc kéo thanh trượt về <strong>10 req/10s</strong>.</li>
                  <li><strong>Cookie miễn trừ (Clearance Cookie):</strong> Nếu trình duyệt của bạn đã từng vượt qua thử thách trước đó, cookie <code>waf_clearance</code> vẫn còn hiệu lực nên HAProxy sẽ cho qua. Hãy bấm nút <strong>"Xóa Cookie Miễn Trừ"</strong> ở trên hoặc mở <strong>Tab Ẩn Danh (Incognito Window)</strong> để thấy WAF chặn đứng ngay lập tức!</li>
                  <li><strong>Tên miền truy cập:</strong> Đảm bảo bạn truy cập qua cổng <code>80</code> của HAProxy (ví dụ: <code>http://192.168.246.100</code>) thay vì cổng 5173 hay 8080 của dashboard quản trị.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
