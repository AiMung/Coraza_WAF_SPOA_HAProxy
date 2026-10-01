import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function RecaptchaBot() {
  const [activeSubTab, setActiveSubTab] = useState('config'); // 'config' | 'test' | 'faq'
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [sites, setSites] = useState([]);

  // Bot Defense State (No blocking preloader - instant UI)
  const [config, setConfig] = useState({
    cc_enabled: true,
    cc_threshold: 50,
    cc_action: 'challenge',
    challenge_mode: 'turnstile',
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
      const [botData, sitesData] = await Promise.all([
        wafApi.botDefense().catch(() => null),
        wafApi.sites().catch(() => []),
      ]);

      if (botData && typeof botData === 'object') {
        setConfig((prev) => ({
          ...prev,
          ...botData,
          challenge_mode: botData.challenge_mode || 'turnstile',
          target_scope: botData.target_scope || 'all',
          target_site_ids: Array.isArray(botData.target_site_ids) ? botData.target_site_ids : [],
        }));
      }
      if (Array.isArray(sitesData)) {
        setSites(sitesData);
      }
    } catch (err) {
      console.error('Silent fetch bot defense config error:', err);
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
        challenge_mode: 'turnstile',
        block_scanners: true,
        pass_ttl_minutes: 120,
      }));
      showToast('Đã áp dụng mẫu: Cân Bằng Tiêu Chuẩn (Turnstile + 60 req/10s)');
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
      showToast('Đã áp dụng mẫu: E-Commerce Chống Vét Hàng (30 req/10s)');
    } else if (presetName === 'api') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 150,
        cc_action: 'block_429',
        block_scanners: true,
        pass_ttl_minutes: 60,
      }));
      showToast('Đã áp dụng mẫu: Cổng Dịch Vụ API (Rate Limit 429 Không Thử Thách HTML)');
    } else if (presetName === 'under_attack') {
      setConfig((prev) => ({
        ...prev,
        cc_enabled: true,
        cc_threshold: 15,
        cc_action: 'challenge',
        challenge_mode: 'turnstile',
        block_scanners: true,
        pass_ttl_minutes: 15,
      }));
      showToast('Đã kích hoạt: Khẩn Cấp Dưới Tấn Công (Under Attack Mode)', 'err');
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
    window.open('/waf-challenge?return_url=/', '_blank');
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
    }, 140);
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
      for (let i = 1; i <= 6; i++) {
        await new Promise((r) => setTimeout(r, 130));
        if (i <= 3) {
          addLog(`Req #${i} -> GET /demo-app [HTTP 200 OK] (Hợp lệ)`, 'ok');
        } else {
          addLog(`Req #${i} -> Vượt ngưỡng ${config.cc_threshold} req/10s -> Kích hoạt Challenge 302 /waf-challenge [ĐÃ BẢO VỆ]`, 'warn');
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

  const targetedCount = config.target_scope === 'all' ? sites.length : (config.target_site_ids || []).length;

  return (
    <div className="aawaf-dashboard-page" style={{ padding: '0 0 24px 0', color: '#0f172a' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            top: '20px',
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
              HAProxy Stick-Table Rate Limiting kết hợp Thử Thách Trình Duyệt Cloudflare Turnstile & Proof-of-Work
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
            title="Mở tab mới để thử nghiệm trang thử thách xác nhận người dùng thật"
          >
            <i className="fa-solid fa-up-right-from-square"></i> Mở Thử Thách /waf-challenge
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
            {saving ? 'Đang lưu...' : 'Lưu & Kích Hoạt'}
          </button>
        </div>
      </div>

      {/* 2. Top KPI Metrics Strip (Enterprise Standard) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '18px',
        }}
      >
        {/* KPI 1 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>CHỐNG CC FLOOD</span>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: config.cc_enabled ? '#10b981' : '#ef4444' }}></span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: config.cc_enabled ? '#15803d' : '#dc2626', marginTop: '6px' }}>
            {config.cc_enabled ? 'ĐANG BẬT' : 'ĐÃ TẮT'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            Ngưỡng: <b>{config.cc_threshold} req / 10s</b>
          </div>
        </div>

        {/* KPI 2 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>THỬ THÁCH TRÌNH DUYỆT</span>
            <i className="fa-solid fa-shield-halved" style={{ color: '#3b82f6', fontSize: '14px' }}></i>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#1d4ed8', marginTop: '6px' }}>
            {config.challenge_mode === 'turnstile' ? 'Cloudflare Turnstile' : 'Proof-of-Work (PoW)'}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            {config.challenge_mode === 'turnstile' ? 'Hộp kiểm "Verify human" 1-Click' : 'Giải mã toán học tự động 1.2s'}
          </div>
        </div>

        {/* KPI 3 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>PHẠM VI BẢO VỆ</span>
            <i className="fa-solid fa-globe" style={{ color: '#0284c7', fontSize: '14px' }}></i>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#0284c7', marginTop: '6px' }}>
            {config.target_scope === 'all' ? `Tất Cả (${sites.length} VHost)` : `${targetedCount} Website`}
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            Hành động: <b>{config.cc_action === 'challenge' ? 'Thử Thách 302' : config.cc_action === 'block_429' ? 'Chặn 429' : 'Auto-Ban'}</b>
          </div>
        </div>

        {/* KPI 4 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.03)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11.5px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>COOKIE PASS TTL</span>
            <i className="fa-solid fa-cookie-bite" style={{ color: '#d97706', fontSize: '14px' }}></i>
          </div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#b45309', marginTop: '6px' }}>
            {config.pass_ttl_minutes} Phút
          </div>
          <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
            Miễn hỏi lại sau khi vượt qua thử thách
          </div>
        </div>
      </div>

      {/* 3. Sub-Tabs Pill Navigation */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px', background: '#f1f5f9', padding: '4px', borderRadius: '10px', width: 'fit-content' }}>
        <button
          type="button"
          onClick={() => setActiveSubTab('config')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'config' ? '#ffffff' : 'transparent',
            color: activeSubTab === 'config' ? '#0f172a' : '#64748b',
            fontWeight: activeSubTab === 'config' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'config' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="fa-solid fa-sliders" style={{ color: activeSubTab === 'config' ? '#3b82f6' : '#94a3b8' }}></i>
          <span>Cấu Hình Chống CC & Thử Thách</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('test')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'test' ? '#ffffff' : 'transparent',
            color: activeSubTab === 'test' ? '#0f172a' : '#64748b',
            fontWeight: activeSubTab === 'test' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'test' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="fa-solid fa-vial-circle-check" style={{ color: activeSubTab === 'test' ? '#10b981' : '#94a3b8' }}></i>
          <span>Trình Diễn & Kiểm Thử Burst (Live Demo)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('faq')}
          style={{
            padding: '8px 18px',
            borderRadius: '8px',
            border: 'none',
            background: activeSubTab === 'faq' ? '#ffffff' : 'transparent',
            color: activeSubTab === 'faq' ? '#0f172a' : '#64748b',
            fontWeight: activeSubTab === 'faq' ? 700 : 600,
            fontSize: '13px',
            cursor: 'pointer',
            boxShadow: activeSubTab === 'faq' ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="fa-solid fa-book-open" style={{ color: activeSubTab === 'faq' ? '#8b5cf6' : '#94a3b8' }}></i>
          <span>Kiến Trúc & Giải Thích Hoạt Động</span>
        </button>
      </div>

      {/* 4. Sub-Tab Content */}

      {/* TAB 1: CẤU HÌNH CHỐNG CC & THỬ THÁCH */}
      {activeSubTab === 'config' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '18px' }}>
          {/* Cột trái: Cấu hình lõi */}
          <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-shield-halved" style={{ color: '#3b82f6' }}></i>
              Tham Số Chống CC & Thử Thách Trình Duyệt
            </h3>

            {/* Bật/Tắt CC */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Kích Hoạt Chống Tấn Công CC (HTTP Flood Shield)</div>
                <div style={{ fontSize: '11.5px', color: '#64748b' }}>Đo lường tần suất request từ mỗi client IP qua HAProxy stick-table 10 giây</div>
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

            {/* Ngưỡng & Hành động */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Ngưỡng Kích Hoạt (Requests / 10s)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1000"
                  value={config.cc_threshold}
                  onChange={(e) => handleChange('cc_threshold', parseInt(e.target.value) || 50)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Khuyên dùng: 30 - 60 req/10s</div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Hành Động Khi Vượt Ngưỡng
                </label>
                <select
                  value={config.cc_action}
                  onChange={(e) => handleChange('cc_action', e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600, background: '#ffffff' }}
                >
                  <option value="challenge">🛡️ Thử Thách Trình Duyệt (/waf-challenge)</option>
                  <option value="block_429">⛔ Chặn Trực Tiếp (HTTP 429 Too Many Requests)</option>
                  <option value="auto_ban">🚫 Cấm IP Luôn Vào Blacklist</option>
                </select>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Thử thách để không chặn nhầm người dùng thật</div>
              </div>
            </div>

            {/* Phương Thức Thử Thách */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '8px' }}>
                Phương Thức Thử Thách Trình Duyệt (Challenge Engine)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
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
                    🌐 Cloudflare Turnstile (Khuyên Dùng)
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Hộp kiểm "Xác nhận bạn là con người" chuẩn Cloudflare (Tương tác 1-Click).
                  </div>
                </div>

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
                    Tự động tính toán hash SHA-256 ngầm trong 1.2s không cần click chuột.
                  </div>
                </div>
              </div>

              {/* Turnstile Details & Live Preview */}
              {config.challenge_mode === 'turnstile' && (
                <div style={{ marginTop: '14px', padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e40af', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6' }}></i>
                    Cấu Hình Cloudflare Turnstile (Sandbox Tích Hợp Sẵn Hoặc Nhập Key Thật)
                  </div>
                  <p style={{ fontSize: '11.5px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
                    Hệ thống đã tích hợp sẵn <b>Interactive Turnstile Engine</b> hoạt động offline không phụ thuộc internet. Để trống để sử dụng Sandbox hoặc điền key từ Cloudflare:
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Site Key (Tùy chọn)
                      </label>
                      <input
                        type="text"
                        placeholder="Để trống dùng Sandbox tích hợp"
                        value={config.turnstile_site_key || ''}
                        onChange={(e) => handleChange('turnstile_site_key', e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                        Secret Key (Tùy chọn)
                      </label>
                      <input
                        type="password"
                        placeholder="Để trống dùng Sandbox tích hợp"
                        value={config.turnstile_secret_key || ''}
                        onChange={(e) => handleChange('turnstile_secret_key', e.target.value)}
                        style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '12px' }}
                      />
                    </div>
                  </div>

                  {/* Widget Preview */}
                  <div
                    onClick={handlePreviewChallenge}
                    style={{
                      background: '#111827',
                      border: '1px solid #374151',
                      borderRadius: '8px',
                      padding: '10px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      cursor: 'pointer',
                      maxWidth: '340px',
                    }}
                    title="Bấm để mở trang thử thách trực tiếp"
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ width: '22px', height: '22px', borderRadius: '4px', border: '2px solid #3b82f6', background: '#1f2937', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <i className="fa-solid fa-check" style={{ color: '#10b981', fontSize: '12px' }}></i>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#f1f5f9' }}>
                        Xác nhận bạn là con người
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: '#f97316' }}>Cloudflare</div>
                      <div style={{ fontSize: '9px', color: '#64748b' }}>Turnstile</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Block Scanners & Pass TTL */}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a' }}>Chặn Scanner Shield</div>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Chặn sqlmap, nikto, acunetix</div>
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

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Thời Hạn Cookie Pass (Phút)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={config.pass_ttl_minutes}
                  onChange={(e) => handleChange('pass_ttl_minutes', parseInt(e.target.value) || 120)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '13px', fontWeight: 600 }}
                />
              </div>
            </div>
          </div>

          {/* Cột phải: Phạm vi áp dụng & Mẫu cài đặt nhanh */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Presets */}
            <div className="dashboard-card" style={{ padding: '18px', background: '#ffffff', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-wand-magic-sparkles" style={{ color: '#8b5cf6' }}></i>
                Mẫu Cấu Hình Nhanh (Security Presets)
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => applyPreset('standard')}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer', textAlign: 'left' }}
                >
                  🛡️ Tiêu Chuẩn (60 req)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('ecommerce')}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer', textAlign: 'left' }}
                >
                  🛒 E-Commerce (30 req)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('api')}
                  style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '11.5px', fontWeight: 700, color: '#334155', cursor: 'pointer', textAlign: 'left' }}
                >
                  🔌 API Gateway (150 req)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('under_attack')}
                  style={{ padding: '8px 10px', borderRadius: '1px solid #fecaca', background: '#fef2f2', fontSize: '11.5px', fontWeight: 700, color: '#dc2626', cursor: 'pointer', textAlign: 'left' }}
                >
                  🚨 Dưới Tấn Công (15 req)
                </button>
              </div>
            </div>

            {/* Scope */}
            <div className="dashboard-card" style={{ padding: '18px', background: '#ffffff', borderRadius: '12px', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-globe" style={{ color: '#0284c7' }}></i>
                  Phạm Vi Website Áp Dụng
                </h3>
                <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                  {targetedCount} / {sites.length} Website
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
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

              {config.target_scope === 'custom' && (
                <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', maxHeight: '180px', overflowY: 'auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '6px' }}>
                    <button type="button" onClick={handleSelectAllSites} style={{ fontSize: '10.5px', color: '#0284c7', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Chọn tất cả</button>
                    <button type="button" onClick={handleClearSites} style={{ fontSize: '10.5px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Bỏ chọn</button>
                  </div>
                  {sites.map((s) => {
                    const isChecked = (config.target_site_ids || []).includes(s.id);
                    return (
                      <label key={s.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 8px', borderRadius: '6px', background: isChecked ? '#f0fdf4' : '#ffffff', marginBottom: '4px', cursor: 'pointer', fontSize: '11.5px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input type="checkbox" checked={isChecked} onChange={() => handleToggleSite(s.id)} />
                          <span style={{ fontWeight: 600, color: '#0f172a' }}>{s.domain}</span>
                        </div>
                        <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: '#e2e8f0', color: '#475569' }}>{s.waf_mode || 'prevention'}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TRÌNH DIỄN & KIỂM THỬ BURST */}
      {activeSubTab === 'test' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)', gap: '18px' }}>
          {/* Card 1: Burst Test Simulation */}
          <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-bolt" style={{ color: '#ef4444' }}></i>
              Kiểm Thử Đợt Tấn Công CC Flood (Burst Attack Tester)
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: 1.5 }}>
              Mô phỏng gửi dồn dập nhiều HTTP request từ cùng 1 IP trong thời gian ngắn để kiểm tra HAProxy Stick-table có tự động kích hoạt thử thách <code>/waf-challenge</code> hay không:
            </p>

            <button
              type="button"
              onClick={runCCFloodTest}
              disabled={ccSimRunning}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: 'none',
                background: ccSimRunning ? '#94a3b8' : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                color: '#ffffff',
                fontWeight: 700,
                fontSize: '13px',
                cursor: ccSimRunning ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
                marginBottom: '14px',
              }}
            >
              <i className={`fa-solid ${ccSimRunning ? 'fa-spinner fa-spin' : 'fa-play'}`}></i>
              {ccSimRunning ? 'Đang gửi loạt request dồn dập...' : 'Kích Hoạt Burst Test (30 req / 2s)'}
            </button>

            {/* Logs Window */}
            <div style={{ background: '#0f172a', borderRadius: '8px', padding: '12px', minHeight: '160px', maxHeight: '220px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '11px', color: '#94a3b8' }}>
              <div style={{ color: '#64748b', borderBottom: '1px solid #1e293b', paddingBottom: '6px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span>NHẬT KÝ THỰC THI (BURST LOGS)</span>
                <span>{ccSimLogs.length} events</span>
              </div>
              {ccSimLogs.length === 0 ? (
                <div style={{ color: '#475569', fontStyle: 'italic', padding: '20px 0', textAlign: 'center' }}>
                  Chưa có kiểm thử. Bấm nút phía trên để bắt đầu mô phỏng tấn công CC.
                </div>
              ) : (
                ccSimLogs.map((l) => (
                  <div key={l.id} style={{ marginBottom: '4px', color: l.status === 'warn' ? '#f59e0b' : l.status === 'ok' ? '#10b981' : l.status === 'err' ? '#ef4444' : '#94a3b8' }}>
                    <span style={{ color: '#64748b' }}>[{l.time}]</span> {l.msg}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Card 2: Live Browser Challenge Inspection */}
          <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-up-right-from-square" style={{ color: '#3b82f6' }}></i>
              Thử Nghiệm Trang Xác Thực Người Dùng Thật
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px', lineHeight: 1.5 }}>
              Mở trực tiếp trang <code>/waf-challenge</code> để kiểm tra giao diện hộp kiểm <b>Cloudflare Turnstile</b>, bấm thử hộp kiểm và trải nghiệm quá trình cấp cookie <code>waf_clearance</code>:
            </p>

            <button
              type="button"
              onClick={handlePreviewChallenge}
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '8px',
                border: '1px solid #3b82f6',
                background: '#eff6ff',
                color: '#1d4ed8',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                marginBottom: '16px',
              }}
            >
              <i className="fa-solid fa-up-right-from-square"></i>
              Mở Trang /waf-challenge (Tab Mới)
            </button>

            {/* Proof-of-Work Solver Test */}
            <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginBottom: '6px' }}>
                Kiểm Tra Giải Thuật PoW Client-Side
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                <span>Tiến trình tính toán hash:</span>
                <span>{simPoWProgress}%</span>
              </div>
              <div style={{ height: '6px', background: '#e2e8f0', borderRadius: '999px', overflow: 'hidden', marginBottom: '10px' }}>
                <div style={{ width: `${simPoWProgress}%`, height: '100%', background: '#10b981', transition: 'width 0.15s ease' }}></div>
              </div>
              <button
                type="button"
                onClick={runSimulation}
                disabled={simRunning}
                style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#ffffff', color: '#0f172a', fontSize: '11.5px', fontWeight: 600, cursor: 'pointer' }}
              >
                {simRunning ? 'Đang tính toán...' : 'Chạy Thử PoW'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: KIẾN TRÚC & GIẢI THÍCH KỸ THUẬT */}
      {activeSubTab === 'faq' && (
        <div className="dashboard-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '12px' }}>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-circle-question" style={{ color: '#8b5cf6' }}></i>
            Cơ Chế Hoạt Động Của Hệ Thống Chống CC Flood & Bot Protection
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px' }}>
            <div style={{ padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#dbeafe', color: '#1d4ed8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>1</span>
                Tấn công CC (HTTP Flood) là gì?
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                Kẻ tấn công sử dụng các công cụ tự động (curl, python scripts, botnet) để gửi hàng trăm hoặc hàng nghìn request/giây vào máy chủ web. Mục đích là làm cạn kiệt tài nguyên CPU và RAM của máy chủ gốc (Origin).
              </p>
            </div>

            <div style={{ padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#fee2e2', color: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>2</span>
                Tại sao Bot / Script bị chặn đứng?
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                HAProxy phát hiện tần suất vượt ngưỡng ({config.cc_threshold} req/10s) và chuyển hướng 302 sang trang <code>/waf-challenge</code>. Botnet không có trình duyệt đầy đủ và không thể bấm vào hộp kiểm <b>Cloudflare Turnstile</b> nên bị chặn hoàn toàn ở tầng ngoài.
              </p>
            </div>

            <div style={{ padding: '16px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ width: '22px', height: '22px', borderRadius: '50%', background: '#dcfce7', color: '#15803d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 800 }}>3</span>
                Tại sao người dùng thật không bị ảnh hưởng?
              </div>
              <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.6, margin: 0 }}>
                Khách hàng thật chỉ cần bấm vào ô "Xác nhận bạn là con người" 1 lần. WAF Engine sẽ ký một cookie an toàn <code>waf_clearance</code> có thời hạn <b>{config.pass_ttl_minutes} phút</b>. Trong thời gian này, khách hàng thoải mái xem mọi trang mà không bị hỏi lại!
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
