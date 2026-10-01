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

  const tabs = [
    { id: 'access', label: '🛡️ Phân Quyền & Lối Vào', icon: 'fa-shield-halved', desc: 'Admin IP Whitelist & Cổng quản trị' },
    { id: 'ratelimit', label: '⚡ Giới Hạn Tần Suất', icon: 'fa-gauge-high', desc: 'HAProxy Rate Limiting & Anti-Flood' },
    { id: 'auth', label: '🔒 Xác Thực & Bảo Mật', icon: 'fa-lock', desc: 'HTTPS, 2FA & Đổi Mật Khẩu Admin' },
    { id: 'diagnostics', label: '🏥 Sức Khỏe & Cứu Hộ', icon: 'fa-heart-pulse', desc: 'Live Diagnostics & Reload Engine' },
  ];

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
            animation: 'fadeIn 0.2s ease-in-out',
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
              Cấu Hình & Quản Trị Hệ Thống WAF (Enterprise Settings)
            </h2>
            <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
              Kiểm soát phân quyền IP quản trị, thiết lập Rate Limit, bảo mật SSL và giám sát sức khỏe dịch vụ
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
              transition: 'background 0.2s',
            }}
            title="Tải tệp JSON sao lưu toàn bộ cấu hình WAF"
          >
            <i className="fa-solid fa-download"></i> Sao Lưu JSON
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
                <i className="fa-solid fa-floppy-disk" /> Lưu & Áp Dụng Cấu Hình
              </>
            )}
          </button>
        </div>
      </div>

      {/* Enterprise Tab Navigation */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '10px',
          marginBottom: '20px',
        }}
      >
        {tabs.map((tab) => {
          const isAct = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '12px 16px',
                borderRadius: '10px',
                border: isAct ? '2px solid #10b981' : '1px solid #e2e8f0',
                background: isAct ? '#f0fdf4' : '#ffffff',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.2s',
                boxShadow: isAct ? '0 4px 6px -1px rgba(16, 185, 129, 0.1)' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 800, color: isAct ? '#065f46' : '#1e293b' }}>
                <i className={`fa-solid ${tab.icon}`} style={{ color: isAct ? '#10b981' : '#64748b' }} />
                {tab.label}
              </div>
              <div style={{ fontSize: '11px', color: isAct ? '#047857' : '#64748b', marginTop: '4px' }}>
                {tab.desc}
              </div>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: '12px', fontSize: '14px' }}>Đang nạp cấu hình hệ thống từ SQLite DB...</p>
        </div>
      ) : (
        <div>
          {/* TAB 1: PHÂN QUYỀN TRUY CẬP & LỐI VÀO */}
          {activeTab === 'access' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
              <div className="dashboard-card" style={{ padding: '22px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-shield-halved" style={{ color: '#0284c7' }}></i>
                  Phân Quyền IP Quản Trị (Admin IP Whitelist)
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>
                        Danh Sách IP Được Phép Quản Trị
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
                    <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '6px', lineHeight: 1.5 }}>
                      💡 <strong>Cơ chế bảo vệ:</strong> Khi kích hoạt, chỉ những IP có trong danh sách trên mới có quyền truy cập vào cổng quản trị và các API cấu hình WAF. Phân tách nhiều IP bằng dấu phẩy.
                    </div>
                  </div>

                  {/* Interactive Whitelist Tester */}
                  <div style={{ padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px dashed #cbd5e1' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#0f172a', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-vial" style={{ color: '#0284c7' }} />
                      Kiểm Thử IP Whitelist Ngay Lập Tức
                    </div>
                    <form onSubmit={handleTestWhitelist} style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="text"
                        placeholder="Nhập IP cần thử nghiệm (VD: 192.168.246.1)..."
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
                        {testingIP ? <i className="fa-solid fa-spinner fa-spin" /> : 'Kiểm Tra'}
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
                        <span>
                          IP <strong>{testResult.ip}</strong>: {testResult.reason}
                        </span>
                      </div>
                    )}
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
                </div>
              </div>

              {/* Port & Security Entrance */}
              <div className="dashboard-card" style={{ padding: '22px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-door-closed" style={{ color: '#8b5cf6' }}></i>
                  Cổng Dịch Vụ & Lối Vào Bí Mật
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                        Thời Gian Hạn Phiên (Session)
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
                      Đường dẫn bí mật truy cập dashboard quản trị nhằm chống quét tự động của botnet và hacker.
                    </div>
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                      Tài Khoản Quản Trị Hệ Thống
                    </div>
                    <div style={{ fontSize: '12px', color: '#64748b' }}>
                      Tên người dùng: <strong style={{ color: '#0f172a' }}>{formData.admin_username}</strong>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: GIỚI HẠN TẦN SUẤT (RATE LIMITING) */}
          {activeTab === 'ratelimit' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div className="dashboard-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-gauge-high" style={{ color: '#ef4444' }}></i>
                    Cấu Hình Động Cơ Giới Hạn Tần Suất (Rate Limiting Engine)
                  </h3>
                  <span style={{ fontSize: '11px', background: '#ecfdf5', color: '#059669', padding: '3px 10px', borderRadius: '4px', border: '1px solid #a7f3d0', fontWeight: 700 }}>
                    HAProxy Stick-Table 10s Window
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                  {/* Toggle Rate Limit */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>Kích Hoạt Bảo Vệ Rate Limit</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Chặn đứng brute-force, web scraping và HTTP Flood ở tầng Reverse Proxy</div>
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                        Ngưỡng Yêu Cầu (req / 10 giây)
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
                      <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
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
                      <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>Dung sai cho phép tải trang ảnh/css: 50 req</div>
                    </div>
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12.5px', color: '#1e40af', lineHeight: 1.6 }}>
                    <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                    <strong>Nguyên lý hoạt động:</strong> HAProxy duy trì bảng nhớ trong RAM (stick-table) theo dõi số lượng HTTP Request của từng IP theo chu kỳ 10 giây. Khi vượt quá ngưỡng cấu hình, HAProxy tự động phản hồi mã <code>429 Too Many Requests</code> lập tức, bảo vệ tuyệt đối CPU của backend máy chủ.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: XÁC THỰC & BẢO MẬT (SSL / 2FA & PASSWORD) */}
          {activeTab === 'auth' && (
            <div style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div className="dashboard-card" style={{ padding: '24px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', marginBottom: '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-lock" style={{ color: '#10b981' }}></i>
                  Xác Thực & Mã Hóa Truyền Tải (SSL / 2FA)
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {/* HTTPS Toggle */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>Kích Hoạt HTTPS / SSL</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Mã hóa TLS bảo vệ dữ liệu truyền tải giữa trình duyệt và Dashboard</div>
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
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px', borderRadius: '10px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                    <div>
                      <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1e293b' }}>Xác Thực 2 Bước (2FA TOTP)</div>
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Yêu cầu mã xác thực 6 số (Google Authenticator) khi đăng nhập</div>
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

                  {/* Password Card */}
                  <div style={{ padding: '16px', borderRadius: '10px', background: '#fafaf9', border: '1px solid #e7e5e4', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 700, color: '#1c1917' }}>Mật Khẩu Quản Trị Viên</div>
                      <div style={{ fontSize: '11.5px', color: '#78716c' }}>Nên định kỳ thay đổi mật khẩu sau 90 ngày để đảm bảo an toàn tối đa</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPasswordModal(true)}
                      style={{
                        height: '38px',
                        padding: '0 18px',
                        borderRadius: '8px',
                        border: '1px solid #d6d3d1',
                        background: '#ffffff',
                        color: '#0f172a',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px',
                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      }}
                    >
                      <i className="fa-solid fa-key" style={{ color: '#eab308' }}></i> Đổi Mật Khẩu Ngay
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: SỨC KHỎE & CỨU HỘ (DIAGNOSTICS & ENGINE RELOAD) */}
          {activeTab === 'diagnostics' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
              {/* Service Health Cards */}
              <div className="dashboard-card" style={{ padding: '22px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className="fa-solid fa-heart-pulse" style={{ color: '#ef4444' }}></i>
                    Chẩn Đoán Kết Nối Dịch Vụ (Service Diagnostics)
                  </h3>
                  <button
                    onClick={fetchDiagnostics}
                    disabled={diagLoading}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      border: '1px solid #cbd5e1',
                      background: '#f8fafc',
                      fontSize: '11.5px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <i className={`fa-solid fa-arrows-rotate ${diagLoading ? 'fa-spin' : ''}`} /> Làm mới
                  </button>
                </div>

                {diagData ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* HAProxy TCP */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: diagData.services?.haproxy?.ok ? '#10b981' : '#ef4444' }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>HAProxy Reverse Proxy (:80)</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Phân giải định tuyến HTTP & Stick-table</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: diagData.services?.haproxy?.ok ? '#16a34a' : '#dc2626' }}>
                        {diagData.services?.haproxy?.status?.toUpperCase()}
                      </span>
                    </div>

                    {/* Coraza SPOA TCP */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: diagData.services?.coraza_spoa?.ok ? '#10b981' : '#ef4444' }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Coraza SPOA Engine (:9000)</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>SPOAv2 Stream Parsing & OWASP CRS v4</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: diagData.services?.coraza_spoa?.ok ? '#16a34a' : '#dc2626' }}>
                        {diagData.services?.coraza_spoa?.status?.toUpperCase()}
                      </span>
                    </div>

                    {/* SQLite WAL */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: diagData.services?.sqlite_db?.ok ? '#10b981' : '#ef4444' }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>SQLite WAL Persistence</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Cơ sở dữ liệu lưu cấu hình và luật IP</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: diagData.services?.sqlite_db?.ok ? '#16a34a' : '#dc2626' }}>
                        {diagData.services?.sqlite_db?.status?.toUpperCase()}
                      </span>
                    </div>

                    {/* Admin Middleware */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderRadius: '8px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: 700, color: '#1e293b' }}>Admin Whitelist Enforcement</div>
                          <div style={{ fontSize: '11px', color: '#64748b' }}>Đang cấu hình: {diagData.admin_whitelist?.count} IP được ủy quyền</div>
                        </div>
                      </div>
                      <span style={{ fontSize: '11px', fontWeight: 700, color: diagData.admin_whitelist?.active ? '#16a34a' : '#64748b' }}>
                        {diagData.admin_whitelist?.active ? 'ACTIVE' : 'ALLOW_ALL'}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-solid fa-spinner fa-spin" /> Đang chẩn đoán kết nối...
                  </div>
                )}
              </div>

              {/* Engine Reload & Disaster Recovery */}
              <div className="dashboard-card" style={{ padding: '22px', background: '#ffffff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-rotate" style={{ color: '#0284c7' }}></i>
                  Đồng Bộ Engine & Sao Lưu Cứu Hộ
                </h3>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '14px', borderRadius: '10px', background: '#f0f9ff', border: '1px solid #bae6fd' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#0369a1', marginBottom: '6px' }}>
                      ⚡ Đồng Bộ Toàn Bộ Engine WAF (SIGHUP)
                    </div>
                    <p style={{ fontSize: '12px', color: '#0284c7', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                      Đồng bộ lại toàn bộ danh sách Blacklist/Whitelist vào HAProxy Map file và Coraza IP Rule, sau đó gửi tín hiệu SIGHUP để nạp lại nóng (Zero Downtime).
                    </p>
                    <button
                      type="button"
                      onClick={handleReloadEngines}
                      disabled={reloadingEngines}
                      style={{
                        height: '36px',
                        padding: '0 16px',
                        borderRadius: '6px',
                        border: 'none',
                        background: '#0284c7',
                        color: '#fff',
                        fontSize: '12.5px',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {reloadingEngines ? (
                        <>
                          <i className="fa-solid fa-spinner fa-spin" /> Đang đồng bộ & nạp lại...
                        </>
                      ) : (
                        <>
                          <i className="fa-solid fa-bolt" /> Tải Lại Toàn Bộ Engine WAF
                        </>
                      )}
                    </button>
                  </div>

                  <div style={{ padding: '14px', borderRadius: '10px', background: '#faf5ff', border: '1px solid #e9d5ff' }}>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#7e22ce', marginBottom: '6px' }}>
                      📦 Sao Lưu & Khôi Phục Cấu Hình (Disaster Recovery)
                    </div>
                    <p style={{ fontSize: '12px', color: '#6b21a8', margin: '0 0 12px 0' }}>
                      Xuất bản sao lưu dự phòng dạng JSON hoặc phục hồi tức thời khi chuyển đổi hạ tầng:
                    </p>
                    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={handleBackup}
                        style={{
                          height: '34px',
                          padding: '0 14px',
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
                        <i className="fa-solid fa-download"></i> Tải File Backup
                      </button>

                      <label
                        style={{
                          height: '34px',
                          padding: '0 14px',
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
                        {restoring ? 'Đang phục hồi...' : 'Phục Hồi JSON'}
                        <input type="file" accept=".json" onChange={handleRestoreFile} style={{ display: 'none' }} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
                  {passLoading ? 'Đang cập nhật...' : 'Cập Nhật Mật Khẩu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
