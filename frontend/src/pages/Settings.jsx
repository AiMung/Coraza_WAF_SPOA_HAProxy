import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [restoring, setRestoring] = useState(false);

  const [formData, setFormData] = useState({
    enable_ssl: 'false',
    two_factor: 'false',
    strong_pass: 'true',
    ip_sharing: 'false',
    bind_domain: '',
    authorized_ips: '',
    session_timeout: '2h',
    security_entrance: '/corazaWAF',
    dashboard_port: '8080',
    admin_username: 'admin',
    rate_limit_enabled: 'true',
    rate_limit_req_sec: '20',
    rate_limit_burst: '50',
  });

  const [passwordModal, setPasswordModal] = useState(false);
  const [passData, setPassData] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [passLoading, setPassLoading] = useState(false);

  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 4000);
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await wafApi.settings();
      if (data && typeof data === 'object') {
        setFormData((prev) => ({ ...prev, ...data }));
      }
    } catch (err) {
      showToast('Lỗi nạp cài đặt hệ thống: ' + (err.message || err), 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleChange = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveAll = async (e) => {
    if (e) e.preventDefault();
    try {
      setSaving(true);
      const res = await wafApi.saveSettings(formData);
      showToast(res.message || 'Đã lưu cấu hình hệ thống và áp dụng hiệu lực thành công!');
    } catch (err) {
      showToast('Lỗi lưu cấu hình: ' + (err.message || err), 'err');
    } finally {
      setSaving(false);
    }
  };

  const handleBackup = () => {
    window.open(wafApi.backupSettingsUrl(), '_blank');
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        setRestoring(true);
        const parsed = JSON.parse(event.target?.result);
        const settingsToRestore = parsed.settings || parsed;
        const res = await wafApi.restoreSettings({ settings: settingsToRestore });
        showToast(res.message || 'Khôi phục cấu hình thành công!');
        await loadSettings();
      } catch (err) {
        showToast('Tập tin cấu hình không hợp lệ: ' + (err.message || err), 'err');
      } finally {
        setRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    if (passData.new_password !== passData.confirm_password) {
      showToast('Mật khẩu xác nhận không khớp', 'err');
      return;
    }
    if (passData.new_password.length < 6) {
      showToast('Mật khẩu mới phải từ 6 ký tự trở lên', 'err');
      return;
    }

    try {
      setPassLoading(true);
      const res = await wafApi.updatePassword({
        old_password: passData.old_password,
        new_password: passData.new_password,
      });
      showToast(res.message || 'Đã đổi mật khẩu quản trị viên thành công!');
      setPasswordModal(false);
      setPassData({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast('Lỗi đổi mật khẩu: ' + (err.message || err), 'err');
    } finally {
      setPassLoading(false);
    }
  };

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
            borderRadius: '8px',
            background: toast.kind === 'err' ? '#dc2626' : '#059669',
            color: '#fff',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <i className={toast.kind === 'err' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} />
          {toast.message}
        </div>
      )}

      {/* Header Bar */}
      <div
        className="dashboard-card"
        style={{
          padding: '18px 24px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(16, 185, 129, 0.25)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
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
              background: 'rgba(16, 185, 129, 0.2)',
              border: '1px solid #10b981',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              color: '#34d399',
            }}
          >
            <i className="fa-solid fa-sliders"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              Cấu Hình & Quản Trị Hệ Thống WAF (System Settings)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              Kiểm soát phân quyền IP quản trị, thiết lập Rate Limit, bảo mật SSL và sao lưu dự phòng
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleBackup}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '12.5px',
              fontWeight: 600,
              border: '1px solid rgba(255, 255, 255, 0.2)',
              cursor: 'pointer',
            }}
            title="Tải tệp JSON sao lưu toàn bộ cấu hình WAF"
          >
            <i className="fa-solid fa-download"></i> Sao Lưu
          </button>

          <button
            onClick={handleSaveAll}
            disabled={saving || loading}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 20px',
              borderRadius: '8px',
              background: '#10b981',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(16, 185, 129, 0.3)',
            }}
          >
            {saving ? (
              <>
                <i className="fa-solid fa-spinner fa-spin" /> Đang áp dụng...
              </>
            ) : (
              <>
                <i className="fa-solid fa-floppy-disk" /> Lưu Toàn Bộ Cấu Hình
              </>
            )}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: '12px', fontSize: '14px' }}>Đang nạp cấu hình hệ thống từ SQLite DB...</p>
        </div>
      ) : (
        /* Full-Width 2-Column Responsive Layout */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '18px' }}>
          {/* COLUMN 1: Network & Access Security */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-shield-halved" style={{ color: '#0284c7' }}></i>
                Phân Quyền Truy Cập & Mạng Quản Trị
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Authorized IPs Whitelist */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                      IP Được Phép Quản Trị (Admin IP Whitelist)
                    </label>
                    <span style={{ fontSize: '11px', color: '#16a34a', background: '#f0fdf4', padding: '2px 8px', borderRadius: '4px', border: '1px solid #bbf7d0', fontWeight: 600 }}>
                      Enforced by Go Middleware
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="VD: 192.168.246.1, 10.0.0.5 (để trống nếu cho phép mọi IP nội bộ)"
                    value={formData.authorized_ips}
                    onChange={(e) => handleChange('authorized_ips', e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                    💡 <strong>Cơ chế bảo vệ:</strong> Khi kích hoạt, chỉ những IP có trong danh sách trên mới có quyền truy cập vào cổng quản trị và các API cấu hình WAF. Phân tách nhiều IP bằng dấu phẩy.
                  </div>
                </div>

                {/* Bind Domain */}
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Tên Miền Quản Trị (Bind Domain)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: waf.aimung.local (để trống nếu cho phép truy cập qua IP)"
                    value={formData.bind_domain}
                    onChange={(e) => handleChange('bind_domain', e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                    }}
                  />
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Nếu gắn tên miền, các yêu cầu truy cập từ IP trực tiếp sẽ bị từ chối với mã 403 Forbidden.
                  </div>
                </div>

                {/* Dashboard Port & Session Timeout */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Cổng Dashboard (Port)
                    </label>
                    <input
                      type="text"
                      value={formData.dashboard_port}
                      onChange={(e) => handleChange('dashboard_port', e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Thời Gian Hạn Phiên
                    </label>
                    <select
                      value={formData.session_timeout}
                      onChange={(e) => handleChange('session_timeout', e.target.value)}
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
                      <option value="30m">30 phút</option>
                      <option value="1h">1 giờ</option>
                      <option value="2h">2 giờ (Khuyên dùng)</option>
                      <option value="8h">8 giờ</option>
                      <option value="24h">24 giờ</option>
                    </select>
                  </div>
                </div>

                {/* Security Entrance */}
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Lối Vào Bảo Mật (Security Entrance Path)
                  </label>
                  <input
                    type="text"
                    value={formData.security_entrance}
                    onChange={(e) => handleChange('security_entrance', e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                    }}
                  />
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Đường dẫn bí mật truy cập dashboard quản trị nhằm chống quét tự động của hacker.
                  </div>
                </div>
              </div>
            </div>

            {/* Authentication & SSL Card */}
            <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-lock" style={{ color: '#10b981' }}></i>
                Xác Thực & Mã Hóa Truyền Tải (SSL / 2FA)
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* HTTPS Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Kích Hoạt HTTPS / SSL</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Mã hóa TLS cho toàn bộ kết nối bảng điều khiển</div>
                  </div>
                  <label className="switch-green" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={formData.enable_ssl === 'true'}
                      onChange={(e) => handleChange('enable_ssl', e.target.checked ? 'true' : 'false')}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>

                {/* 2FA Toggle */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Xác Thực 2 Bước (2FA TOTP)</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Yêu cầu Google Authenticator khi đăng nhập</div>
                  </div>
                  <label className="switch-green" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={formData.two_factor === 'true'}
                      onChange={(e) => handleChange('two_factor', e.target.checked ? 'true' : 'false')}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>

                {/* Change Password Button */}
                <div style={{ paddingTop: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setPasswordModal(true)}
                    style={{
                      height: '38px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#0f172a',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <i className="fa-solid fa-key" style={{ color: '#eab308' }}></i> Đổi Mật Khẩu Quản Trị Viên
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* COLUMN 2: Rate Limiting & Engine Maintenance */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Rate Limiting Engine */}
            <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-gauge-high" style={{ color: '#ef4444' }}></i>
                  Động Cơ Giới Hạn Tần Suất (Rate Limiting)
                </h3>
                <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#059669', padding: '2px 8px', borderRadius: '4px', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                  HAProxy Stick-Table
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {/* Rate limit switch */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Kích Hoạt Bảo Vệ Rate Limit</div>
                    <div style={{ fontSize: '11.5px', color: '#64748b' }}>Chặn brute-force & HTTP Flood ở tầng proxy</div>
                  </div>
                  <label className="switch-green" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={formData.rate_limit_enabled === 'true'}
                      onChange={(e) => handleChange('rate_limit_enabled', e.target.checked ? 'true' : 'false')}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Ngưỡng Yêu Cầu (req/10s)
                    </label>
                    <input
                      type="number"
                      value={formData.rate_limit_req_sec}
                      onChange={(e) => handleChange('rate_limit_req_sec', e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Mặc định: 20 req/10s</div>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                      Ngưỡng Burst Tối Đa
                    </label>
                    <input
                      type="number"
                      value={formData.rate_limit_burst || '50'}
                      onChange={(e) => handleChange('rate_limit_burst', e.target.value)}
                      style={{
                        width: '100%',
                        height: '38px',
                        padding: '0 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        fontSize: '12.5px',
                      }}
                    />
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Bộc phát ngắn: 50 req</div>
                  </div>
                </div>

                <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af' }}>
                  <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                  Cấu hình này tự động đồng bộ sang HAProxy stick-table <code>http_req_rate(10s)</code> để từ chối các lượt tấn công dồn dập trước khi chạm vào backend ứng dụng.
                </div>
              </div>
            </div>

            {/* Backup & Disaster Recovery Card */}
            <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-box-archive" style={{ color: '#8b5cf6' }}></i>
                Sao Lưu & Khôi Phục Cấu Hình (Disaster Recovery)
              </h3>
              <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '14px' }}>
                Xuất file cấu hình dự phòng và phục hồi nhanh chóng khi chuyển đổi máy chủ hoặc cứu hộ hệ thống:
              </p>

              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleBackup}
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: '1px solid #3b82f6',
                    background: '#eff6ff',
                    color: '#1d4ed8',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-cloud-arrow-down"></i> Tải Bản Sao Lưu JSON
                </button>

                <label
                  style={{
                    height: '38px',
                    padding: '0 16px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#334155',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className={`fa-solid ${restoring ? 'fa-spinner fa-spin' : 'fa-cloud-arrow-up'}`}></i>
                  {restoring ? 'Đang phục hồi...' : 'Khôi Phục Từ JSON'}
                  <input type="file" accept=".json" onChange={handleRestoreFile} style={{ display: 'none' }} />
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Password Modal */}
      {passwordModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
          onClick={() => setPasswordModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '12px',
              padding: '24px',
              width: '100%',
              maxWidth: '420px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: '0 0 16px 0' }}>
              Đổi Mật Khẩu Quản Trị Viên
            </h3>

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Mật Khẩu Hiện Tại
                </label>
                <input
                  type="password"
                  value={passData.old_password}
                  onChange={(e) => setPassData({ ...passData, old_password: e.target.value })}
                  style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Mật Khẩu Mới (ít nhất 6 ký tự)
                </label>
                <input
                  type="password"
                  value={passData.new_password}
                  onChange={(e) => setPassData({ ...passData, new_password: e.target.value })}
                  style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '4px' }}>
                  Xác Nhận Mật Khẩu Mới
                </label>
                <input
                  type="password"
                  value={passData.confirm_password}
                  onChange={(e) => setPassData({ ...passData, confirm_password: e.target.value })}
                  style={{ width: '100%', height: '36px', padding: '0 10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPasswordModal(false)}
                  style={{ height: '36px', padding: '0 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={passLoading}
                  style={{
                    height: '36px',
                    padding: '0 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {passLoading ? 'Đang đổi...' : 'Cập Nhật Mật Khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
