import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function RecaptchaBot() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

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
  });

  const [activeTab, setActiveTab] = useState('cc'); // 'cc', 'challenge', 'scanners'

  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await wafApi.botDefense();
      if (data && typeof data === 'object') {
        setConfig((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      showToast('Lỗi nạp cấu hình Chống Tấn Công CC & Bot: ' + (err.message || err), 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleChange = (key, value) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
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

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>
        <i className="fa-solid fa-circle-notch fa-spin" style={{ fontSize: '28px', color: '#10b981', marginBottom: '12px' }}></i>
        <div style={{ fontSize: '14px', fontWeight: 600 }}>Đang nạp cấu hình Enterprise Bot & CC Shield...</div>
      </div>
    );
  }

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', maxWidth: '1000px', margin: '0 auto', color: '#0f172a' }}>
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

      {/* 1. Header Banner */}
      <div
        style={{
          background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#ffffff',
          marginBottom: '20px',
          boxShadow: '0 10px 25px -5px rgba(5, 150, 105, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                padding: '6px 12px',
                borderRadius: '999px',
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              Enterprise Bot Shield
            </span>
            <span
              style={{
                background: config.cc_enabled ? '#10b981' : '#64748b',
                color: '#ffffff',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 700,
              }}
            >
              {config.cc_enabled ? '● Chế độ bảo vệ đang BẬT' : '○ TẠM TẮT'}
            </span>
          </div>
          <h2 style={{ fontSize: '22px', fontWeight: 800, marginTop: '8px', letterSpacing: '-0.5px' }}>
            Chống Tấn Công CC & Xác Minh Bot Thông Minh
          </h2>
          <p style={{ fontSize: '13px', color: '#a7f3d0', marginTop: '4px', maxWidth: '650px', lineHeight: 1.5 }}>
            Kiểm soát lưu lượng HTTP Flood bằng HAProxy Stick-Table, kích hoạt thử thách trình duyệt (Cloudflare Turnstile / Autonomous JS PoW) và tự động chặn đứng các công cụ dò quét lỗ hổng.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={handlePreviewChallenge}
            style={{
              background: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              color: '#ffffff',
              padding: '10px 16px',
              borderRadius: '9px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.2s',
            }}
          >
            <i className="fa-solid fa-eye"></i>
            Xem Trang Thử Thách
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: '#ffffff',
              color: '#065f46',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '9px',
              fontSize: '13.5px',
              fontWeight: 700,
              cursor: saving ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
              transition: 'all 0.2s',
            }}
          >
            {saving ? (
              <>
                <i className="fa-solid fa-circle-notch fa-spin"></i> Đang Lưu...
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk"></i> Lưu Cấu Hình
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Navigation Sub-Tabs */}
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
          onClick={() => setActiveTab('cc')}
          style={{
            background: activeTab === 'cc' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'cc' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'cc' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s',
          }}
        >
          <i className="fa-solid fa-bolt"></i>
          1. Chống Tấn Công CC & Rate Limit
        </button>

        <button
          onClick={() => setActiveTab('challenge')}
          style={{
            background: activeTab === 'challenge' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'challenge' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'challenge' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s',
          }}
        >
          <i className="fa-solid fa-user-shield"></i>
          2. Thử Thách Trình Duyệt (Turnstile / PoW)
        </button>

        <button
          onClick={() => setActiveTab('scanners')}
          style={{
            background: activeTab === 'scanners' ? '#ecfdf5' : '#f8fafc',
            color: activeTab === 'scanners' ? '#059669' : '#64748b',
            border: `1px solid ${activeTab === 'scanners' ? '#a7f3d0' : '#e2e8f0'}`,
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s',
          }}
        >
          <i className="fa-solid fa-shield-virus"></i>
          3. Chặn Dò Quét Lỗ Hổng & Bad Crawlers
        </button>
      </div>

      {/* 3. Tab Contents */}

      {/* TAB 1: CC DEFENSE */}
      {activeTab === 'cc' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Phòng Thủ CC Attack & Giới Hạn Tần Suất (HAProxy Stick-Table)
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Theo dõi tần suất yêu cầu trên từng IP trong cửa sổ 10 giây (10s window). Khi vượt ngưỡng, hệ thống tự động xử phạt để bảo vệ máy chủ gốc.
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

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
              {/* Threshold Setting */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Ngưỡng Giới Hạn (CC Threshold):
                  </label>
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
                  <span>10 req (Rất chặt)</span>
                  <span>50 req (Khuyên Dùng)</span>
                  <span>200 req (Nới lỏng)</span>
                </div>
              </div>

              {/* Action When Exceeded */}
              <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', display: 'block', marginBottom: '8px' }}>
                  Hành Động Khi Vượt Ngưỡng (Mitigation Action):
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12.5px',
                      color: config.cc_action === 'challenge' ? '#065f46' : '#475569',
                      fontWeight: config.cc_action === 'challenge' ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="cc_action"
                      value="challenge"
                      checked={config.cc_action === 'challenge'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>🛡️ Thử thách trình duyệt (Challenge Mode - Khuyên dùng)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12.5px',
                      color: config.cc_action === 'block_429' ? '#065f46' : '#475569',
                      fontWeight: config.cc_action === 'block_429' ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="cc_action"
                      value="block_429"
                      checked={config.cc_action === 'block_429'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>🚫 Từ chối yêu cầu (429 Too Many Requests)</span>
                  </label>

                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '12.5px',
                      color: config.cc_action === 'auto_ban' ? '#065f46' : '#475569',
                      fontWeight: config.cc_action === 'auto_ban' ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="radio"
                      name="cc_action"
                      value="auto_ban"
                      checked={config.cc_action === 'auto_ban'}
                      onChange={(e) => handleChange('cc_action', e.target.value)}
                    />
                    <span>⛔ Chặn đứng tức thời (403 Forbidden & Auto-Ban 15 phút)</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BROWSER CHALLENGE (TURNSTILE / JS POW) */}
      {activeTab === 'challenge' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            }}
          >
            <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>
              Cơ Chế Thử Thách Người Thật (Proof-of-Human Challenge Engine)
            </h4>
            <p style={{ fontSize: '12.5px', color: '#64748b', marginBottom: '20px' }}>
              Khi một địa chỉ IP có hành vi gửi request ồ ạt, hệ thống sẽ yêu cầu người dùng xác minh trước khi cho phép đi tiếp vào ứng dụng web.
            </p>

            {/* Mode Selector */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '20px' }}>
              <div
                onClick={() => handleChange('challenge_mode', 'autonomous_js')}
                style={{
                  border: `2px solid ${config.challenge_mode === 'autonomous_js' ? '#10b981' : '#e2e8f0'}`,
                  background: config.challenge_mode === 'autonomous_js' ? '#f0fdf4' : '#ffffff',
                  padding: '16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-microchip" style={{ color: '#059669', fontSize: '16px' }}></i>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Tự Động (Proof-of-Work JS)</span>
                  </div>
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    Không cần Setup
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                  Tự động giải thuật toán mã hóa SHA-256 ngầm trong 1.5 giây để xác minh người dùng thật mà không cần bấm chọn ảnh.
                </p>
              </div>

              <div
                onClick={() => handleChange('challenge_mode', 'turnstile')}
                style={{
                  border: `2px solid ${config.challenge_mode === 'turnstile' ? '#10b981' : '#e2e8f0'}`,
                  background: config.challenge_mode === 'turnstile' ? '#f0fdf4' : '#ffffff',
                  padding: '16px',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-brands fa-cloudflare" style={{ color: '#f97316', fontSize: '18px' }}></i>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>Cloudflare Turnstile</span>
                  </div>
                  <span style={{ fontSize: '11px', background: '#fff7ed', color: '#c2410c', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                    Miễn Phí 100%
                  </span>
                </div>
                <p style={{ fontSize: '12px', color: '#64748b', lineHeight: 1.4 }}>
                  Tích hợp widget "Are you human" chính thức từ Cloudflare, bảo mật cực cao và trải nghiệm người dùng siêu mượt.
                </p>
              </div>
            </div>

            {/* Turnstile Keys (Visible only when turnstile selected) */}
            {config.challenge_mode === 'turnstile' && (
              <div style={{ background: '#f8fafc', padding: '18px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '20px' }}>
                <h5 style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-key" style={{ color: '#f97316' }}></i>
                  Cấu Hình Khóa Cloudflare Turnstile
                </h5>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px' }}>
                  <div>
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
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
                    <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                      Secret Key (Khóa Bí Mật Xác Thực):
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

                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-circle-info" style={{ color: '#3b82f6' }}></i>
                  <span>Bạn có thể tạo Site Key & Secret Key hoàn toàn miễn phí tại Cloudflare Dashboard &gt; Turnstile.</span>
                </div>
              </div>
            )}

            {/* Clearance Cookie TTL */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                    Thời Hạn Miễn Trừ Sau Khi Vượt Qua Thử Thách (Clearance TTL):
                  </label>
                  <p style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                    Thời gian trình duyệt được tự do truy cập mà không phải giải lại thử thách (Cookie <code>waf_clearance</code> có chữ ký HMAC).
                  </p>
                </div>

                <select
                  value={config.pass_ttl_minutes}
                  onChange={(e) => handleChange('pass_ttl_minutes', parseInt(e.target.value, 10))}
                  style={{
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#0f172a',
                    background: '#ffffff',
                  }}
                >
                  <option value={30}>30 phút</option>
                  <option value={60}>1 giờ</option>
                  <option value={120}>2 giờ (Mặc định)</option>
                  <option value={360}>6 giờ</option>
                  <option value={1440}>24 giờ</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SCANNERS & BAD BOTS */}
      {activeTab === 'scanners' && (
        <div style={{ display: 'grid', gap: '16px' }}>
          <div
            style={{
              background: '#ffffff',
              borderRadius: '14px',
              border: '1px solid #e2e8f0',
              padding: '24px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.02)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div>
                <h4 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a' }}>
                  Chặn Đứng Công Cụ Dò Quét Lỗ Hổng (Scanner & Bad Crawlers)
                </h4>
                <p style={{ fontSize: '12.5px', color: '#64748b', marginTop: '2px' }}>
                  Tự động trả về mã 403 Forbidden tức thời đối với các công cụ quét mã nguồn mở và scanner tự động của hacker.
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

            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0', marginBottom: '16px' }}>
              <span style={{ fontSize: '12.5px', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '10px' }}>
                Danh sách chữ ký công cụ bị chặn tự động:
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['sqlmap', 'nikto', 'acunetix', 'nessus', 'masscan', 'nmap', 'gobuster', 'dirbuster', 'wpscan'].map((tool) => (
                  <span
                    key={tool}
                    style={{
                      background: '#fee2e2',
                      color: '#991b1b',
                      border: '1px solid #fecaca',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '11.5px',
                      fontFamily: 'monospace',
                      fontWeight: 600,
                    }}
                  >
                    <i className="fa-solid fa-ban" style={{ fontSize: '9px', marginRight: '4px' }}></i>
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#059669', background: '#ecfdf5', padding: '12px 16px', borderRadius: '8px', border: '1px solid #a7f3d0' }}>
              <i className="fa-solid fa-circle-check"></i>
              <span>Các bot tìm kiếm uy tín (Googlebot, Bingbot, DuckDuckGo) được miễn trừ tự động để không ảnh hưởng đến SEO website của bạn.</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
