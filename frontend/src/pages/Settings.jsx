import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function Settings() {
  const [activeTab, setActiveTab] = useState('access');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [restoring, setRestoring] = useState(false);

  // Settings State
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

  // Diagnostics & Tests
  const [diagData, setDiagData] = useState(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [reloadingEngines, setReloadingEngines] = useState(false);
  const [testIP, setTestIP] = useState('');
  const [testResult, setTestResult] = useState(null);
  const [testingIP, setTestingIP] = useState(false);

  // Password Modal
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

  const fetchDiagnostics = async () => {
    try {
      setDiagLoading(true);
      const res = await wafApi.settingsDiagnostics();
      setDiagData(res);
    } catch (err) {
      showToast('Lỗi kiểm tra sức khỏe hệ thống: ' + (err.message || err), 'err');
    } finally {
      setDiagLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
    fetchDiagnostics();
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
      fetchDiagnostics();
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
        await fetchDiagnostics();
      } catch (err) {
        showToast('Tập tin cấu hình không hợp lệ: ' + (err.message || err), 'err');
      } finally {
        setRestoring(false);
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  };

  const handleReloadEngines = async () => {
    try {
      setReloadingEngines(true);
      const res = await wafApi.reloadWafEngines();
      showToast(res.message || 'Đã đồng bộ quy tắc và gửi tín hiệu tải lại (SIGHUP) thành công!');
      await fetchDiagnostics();
    } catch (err) {
      showToast('Lỗi tải lại Engine WAF: ' + (err.message || err), 'err');
    } finally {
      setReloadingEngines(false);
    }
  };

  const handleTestWhitelist = async (e) => {
    e.preventDefault();
    if (!testIP.trim()) return;
    try {
      setTestingIP(true);
      const res = await wafApi.testAdminWhitelist(testIP.trim());
      setTestResult(res);
    } catch (err) {
      showToast('Lỗi kiểm tra IP Whitelist: ' + (err.message || err), 'err');
    } finally {
      setTestingIP(false);
    }
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

  const authIPsCount = formData.authorized_ips
    ? formData.authorized_ips.split(',').map((s) => s.trim()).filter(Boolean).length
    : 0;

  return (
    <div style={{ animation: 'fadeInPanel 0.2s ease', color: '#0f172a' }}>
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
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Sleek Enterprise KPI Metrics Strip (Matching BlackWhiteList style) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '14px',
        }}
      >
        {/* Card 1: Admin Whitelist */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: authIPsCount > 0 ? '#f0fdf4' : '#eff6ff',
              color: authIPsCount > 0 ? '#16a34a' : '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-shield-halved"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              IP QUẢN TRỊ
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {authIPsCount > 0 ? `${authIPsCount} IP Chỉ Định` : 'Tất Cả IP (Nội Bộ)'}
            </div>
          </div>
        </div>

        {/* Card 2: Rate Limiting */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: formData.rate_limit_enabled === 'true' ? '#fee2e2' : '#f1f5f9',
              color: formData.rate_limit_enabled === 'true' ? '#dc2626' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-gauge-high"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              RATE LIMITING
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: formData.rate_limit_enabled === 'true' ? '#dc2626' : '#64748b', marginTop: '2px' }}>
              {formData.rate_limit_enabled === 'true' ? `${formData.rate_limit_req_sec || 20} req/10s` : 'Đang Tắt'}
            </div>
          </div>
        </div>

        {/* Card 3: Security & SSL */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: formData.enable_ssl === 'true' ? '#dcfce7' : '#f1f5f9',
              color: formData.enable_ssl === 'true' ? '#15803d' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-lock"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              SSL / HTTPS
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: formData.enable_ssl === 'true' ? '#15803d' : '#64748b', marginTop: '2px' }}>
              {formData.enable_ssl === 'true' ? 'Bảo Vệ TLS 1.3' : 'HTTP Tiêu Chuẩn'}
            </div>
          </div>
        </div>

        {/* Card 4: Services Status */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '8px',
              background: '#f3e8ff',
              color: '#7e22ce',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-heart-pulse"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              HẠ TẦNG DỊCH VỤ
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
              100% Khỏe Mạnh <span style={{ fontSize: '11px', color: '#16a34a' }}>● UP</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main White Container with Sub-Tab Switcher (Matching BlackWhiteList layout) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Sub-tab Navigation Bar matching Blacklist / Whitelist */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            paddingBottom: '16px',
            borderBottom: '1px solid #f1f5f9',
            marginBottom: '20px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => setActiveTab('access')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'access' ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                background: activeTab === 'access' ? '#f0f9ff' : '#ffffff',
                color: activeTab === 'access' ? '#0284c7' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-shield-halved" style={{ color: activeTab === 'access' ? '#0284c7' : '#94a3b8' }}></i>
              <span>Phân Quyền & Lối Vào</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ratelimit')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'ratelimit' ? '1px solid #fecaca' : '1px solid #e2e8f0',
                background: activeTab === 'ratelimit' ? '#fef2f2' : '#ffffff',
                color: activeTab === 'ratelimit' ? '#dc2626' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-gauge-high" style={{ color: activeTab === 'ratelimit' ? '#dc2626' : '#94a3b8' }}></i>
              <span>Giới Hạn Tần Suất</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('auth')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'auth' ? '1px solid #bbf7d0' : '1px solid #e2e8f0',
                background: activeTab === 'auth' ? '#f0fdf4' : '#ffffff',
                color: activeTab === 'auth' ? '#15803d' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-lock" style={{ color: activeTab === 'auth' ? '#15803d' : '#94a3b8' }}></i>
              <span>Xác Thực & Mật Khẩu</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('diagnostics')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'diagnostics' ? '1px solid #e9d5ff' : '1px solid #e2e8f0',
                background: activeTab === 'diagnostics' ? '#faf5ff' : '#ffffff',
                color: activeTab === 'diagnostics' ? '#7e22ce' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-heart-pulse" style={{ color: activeTab === 'diagnostics' ? '#7e22ce' : '#94a3b8' }}></i>
              <span>Sức Khỏe & Cứu Hộ</span>
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={handleBackup}
              title="Tải bản sao lưu cấu hình WAF (JSON)"
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-download"></i> Sao Lưu
            </button>

            <button
              type="button"
              onClick={handleSaveAll}
              disabled={saving || loading}
              style={{
                padding: '6px 16px',
                borderRadius: '6px',
                border: 'none',
                background: '#10b981',
                color: '#ffffff',
                fontSize: '12.5px',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 2px 4px rgba(16, 185, 129, 0.2)',
              }}
            >
              <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
              <span>{saving ? 'Đang Lưu...' : 'Lưu Cấu Hình'}</span>
            </button>
          </div>
        </div>

        {/* TAB 1: PHÂN QUYỀN TRUY CẬP & LỐI VÀO */}
        {activeTab === 'access' && (
          <div style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Danh Sách IP Được Phép Quản Trị (Admin IP Whitelist)
                </label>
                <input
                  type="text"
                  placeholder="VD: 192.168.246.1, 10.0.0.5 (để trống nếu cho phép toàn bộ IP nội bộ)"
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
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '5px' }}>
                  Chỉ các IP có trong danh sách trên mới được phép truy cập cổng Dashboard và gọi API cấu hình.
                </div>
              </div>

              {/* Whitelist Tester Box */}
              <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <i className="fa-solid fa-vial" style={{ color: '#0284c7' }}></i>
                  Kiểm Thử Phân Quyền IP Nhanh
                </div>
                <form onSubmit={handleTestWhitelist} style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="Nhập IP cần kiểm tra (VD: 192.168.246.1)..."
                    value={testIP}
                    onChange={(e) => setTestIP(e.target.value)}
                    style={{
                      flex: 1,
                      height: '34px',
                      padding: '0 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="submit"
                    disabled={testingIP}
                    style={{
                      padding: '0 14px',
                      height: '34px',
                      borderRadius: '6px',
                      border: 'none',
                      background: '#0284c7',
                      color: '#fff',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {testingIP ? <i className="fa-solid fa-spinner fa-spin"></i> : 'Kiểm Tra'}
                  </button>
                </form>

                {testResult && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: testResult.allowed ? '#f0fdf4' : '#fef2f2',
                      color: testResult.allowed ? '#166534' : '#991b1b',
                      border: `1px solid ${testResult.allowed ? '#bbf7d0' : '#fecaca'}`,
                    }}
                  >
                    <i className={testResult.allowed ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'} />
                    <span>IP <strong>{testResult.ip}</strong>: {testResult.reason}</span>
                  </div>
                )}
              </div>

              {/* Bind Domain & Security Entrance */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
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
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Lối Vào Bí Mật (Security Entrance)
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
                </div>
              </div>

              {/* Port & Session Timeout */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
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
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Thời Hạn Phiên Đăng Nhập
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
            </div>
          </div>
        )}

        {/* TAB 2: GIỚI HẠN TẦN SUẤT (RATE LIMITING) */}
        {activeTab === 'ratelimit' && (
          <div style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                    Kích Hoạt Bảo Vệ Rate Limit (HAProxy Stick-Table)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Chặn đứng các cuộc tấn công HTTP Flood, Brute-Force và Web Scraping dồn dập
                  </div>
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

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Ngưỡng Yêu Cầu Tối Đa (req / 10 giây)
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
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Mặc định an toàn: 20 req / 10s</div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Ngưỡng Bộc Phát Tối Đa (Burst Requests)
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
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Dung sai cho phép tải ảnh/css: 50 req</div>
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af', lineHeight: 1.5 }}>
                <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                Khi một IP vượt ngưỡng yêu cầu trong chu kỳ 10 giây, HAProxy sẽ lập tức trả về mã phản hồi <code>429 Too Many Requests</code> và từ chối xử lý, bảo vệ tối đa CPU của ứng dụng.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: XÁC THỰC & MẬT KHẨU */}
        {activeTab === 'auth' && (
          <div style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                    Kích Hoạt HTTPS / SSL Toàn Hệ Thống
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Mã hóa TLS bảo vệ kết nối giữa trình duyệt quản trị và máy chủ WAF
                  </div>
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

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>
                    Xác Thực 2 Bước (2FA TOTP)
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Yêu cầu mã 6 số từ Google Authenticator khi đăng nhập
                  </div>
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

              <div
                style={{
                  padding: '16px',
                  borderRadius: '10px',
                  background: '#fafaf9',
                  border: '1px solid #e7e5e4',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1c1917' }}>
                    Mật Khẩu Quản Trị Viên (Tài khoản: {formData.admin_username || 'admin'})
                  </div>
                  <div style={{ fontSize: '12px', color: '#78716c', marginTop: '2px' }}>
                    Nên định kỳ đổi mật khẩu sau 90 ngày để đảm bảo an toàn tuyệt đối
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPasswordModal(true)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-key" style={{ color: '#eab308' }}></i>
                  <span>Đổi Mật Khẩu Ngay</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: SỨC KHỎE & CỨU HỘ */}
        {activeTab === 'diagnostics' && (
          <div style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Service Health Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>HAProxy Reverse Proxy</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                      ONLINE (:80)
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Phân luồng định tuyến và Stick-table rate limiter
                  </div>
                </div>

                <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Coraza SPOA Engine</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                      ONLINE (:9000)
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Kiểm tra sâu L7 WAF theo bộ luật OWASP CRS v4.9
                  </div>
                </div>

                <div style={{ padding: '14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>Cơ Sở Dữ Liệu SQLite</span>
                    <span style={{ fontSize: '11px', fontWeight: 700, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: '4px' }}>
                      ACTIVE (WAL)
                    </span>
                  </div>
                  <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '4px' }}>
                    Ghi nhật ký sự cố và đồng bộ luật cấm thời gian thực
                  </div>
                </div>
              </div>

              {/* Engine Reload Button Card */}
              <div style={{ padding: '16px', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0369a1', marginBottom: '4px' }}>
                  ⚡ Đồng Bộ & Tải Lại Nóng Toàn Bộ Engine WAF (SIGHUP)
                </div>
                <p style={{ fontSize: '12px', color: '#0284c7', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  Gửi tín hiệu nạp lại nóng HAProxy & Coraza WAF mà không làm gián đoạn bất kỳ kết nối mạng nào đang diễn ra (Zero Downtime).
                </p>
                <button
                  type="button"
                  onClick={handleReloadEngines}
                  disabled={reloadingEngines}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className={`fa-solid ${reloadingEngines ? 'fa-spinner fa-spin' : 'fa-rotate'}`}></i>
                  <span>{reloadingEngines ? 'Đang Tải Lại Engine...' : 'Tải Lại Toàn Bộ Engine WAF'}</span>
                </button>
              </div>

              {/* Disaster Recovery Box */}
              <div style={{ padding: '16px', borderRadius: '10px', background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#7e22ce', marginBottom: '4px' }}>
                  📦 Sao Lưu & Khôi Phục Cấu Hình (Disaster Recovery)
                </div>
                <p style={{ fontSize: '12px', color: '#6b21a8', margin: '0 0 12px 0' }}>
                  Xuất file dự phòng JSON hoặc khôi phục nhanh cấu hình khi chuyển đổi máy chủ:
                </p>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={handleBackup}
                    style={{
                      padding: '7px 16px',
                      borderRadius: '6px',
                      border: '1px solid #7e22ce',
                      background: '#ffffff',
                      color: '#7e22ce',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className="fa-solid fa-download"></i>
                    <span>Tải Bản Sao Lưu JSON</span>
                  </button>

                  <label
                    style={{
                      padding: '7px 16px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#334155',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className={`fa-solid ${restoring ? 'fa-spinner fa-spin' : 'fa-upload'}`}></i>
                    <span>{restoring ? 'Đang khôi phục...' : 'Khôi Phục Từ JSON'}</span>
                    <input type="file" accept=".json" onChange={handleRestoreFile} style={{ display: 'none' }} />
                  </label>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

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
                  Mật Khẩu Mới (tối thiểu 6 ký tự)
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
                  {passLoading ? 'Đang Cập Nhật...' : 'Cập Nhật Mật Khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
