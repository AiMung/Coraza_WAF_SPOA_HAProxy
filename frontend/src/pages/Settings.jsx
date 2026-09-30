import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

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
  });

  const [passwordModal, setPasswordModal] = useState(false);
  const [passData, setPassData] = useState({ old_password: '', new_password: '', confirm_password: '' });
  const [passLoading, setPassLoading] = useState(false);

  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3500);
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
      showToast(res.message || 'Đã lưu cấu hình hệ thống thành công');
    } catch (err) {
      showToast('Lỗi lưu cấu hình: ' + (err.message || err), 'err');
    } finally {
      setSaving(false);
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
      showToast(res.message || 'Đã đổi mật khẩu thành công');
      setPasswordModal(false);
      setPassData({ old_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      showToast('Lỗi đổi mật khẩu: ' + (err.message || err), 'err');
    } finally {
      setPassLoading(false);
    }
  };

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', color: '#0f172a' }}>
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
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <i className={toast.kind === 'err' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} />
          {toast.message}
        </div>
      )}

      {/* Header Bar */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-gear" style={{ color: '#2563eb' }}></i>
            Cấu Hình Hệ Thống WAF (System Settings)
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            Thiết lập bảo mật cổng quản trị WAF, phân quyền truy cập IP, chứng chỉ SSL và giới hạn phiên làm việc.
          </p>
        </div>

        <button
          onClick={handleSaveAll}
          disabled={saving || loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '6px',
            background: '#2563eb',
            color: '#fff',
            fontSize: '13px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {saving ? (
            <>
              <i className="fa-solid fa-spinner fa-spin" /> Đang lưu...
            </>
          ) : (
            <>
              <i className="fa-solid fa-floppy-disk" /> Lưu Toàn Bộ Cấu Hình
            </>
          )}
        </button>
      </div>

      {loading ? (
        <div style={{ padding: '60px', textAlign: 'center', color: '#94a3b8' }}>
          <i className="fa-solid fa-spinner fa-spin fa-2x" />
          <p style={{ marginTop: '12px', fontSize: '14px' }}>Đang nạp cấu hình hệ thống từ SQLite DB...</p>
        </div>
      ) : (
        <div style={{ maxWidth: '850px', background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Row: Enable SSL */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Kích hoạt HTTPS / SSL</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Mã hóa kết nối bảng điều khiển WAF qua cổng SSL</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  id="enable_ssl"
                  checked={formData.enable_ssl === 'true'}
                  onChange={(e) => handleChange('enable_ssl', e.target.checked ? 'true' : 'false')}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="enable_ssl" style={{ fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                  {formData.enable_ssl === 'true' ? 'Bật (HTTPS Enforced)' : 'Tắt (HTTP Standard)'}
                </label>
              </div>
            </div>

            {/* Row: 2-Step Verification */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'center', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Xác thực 2 bước (2FA)</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Tăng cường bảo mật với mã OTP TOTP</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="checkbox"
                  id="two_factor"
                  checked={formData.two_factor === 'true'}
                  onChange={(e) => handleChange('two_factor', e.target.checked ? 'true' : 'false')}
                  style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                />
                <label htmlFor="two_factor" style={{ fontSize: '13px', color: '#475569', cursor: 'pointer' }}>
                  {formData.two_factor === 'true' ? 'Bật bảo vệ 2FA' : 'Tắt'}
                </label>
              </div>
            </div>

            {/* Row: Bind Domain */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Tên Miền Quản Trị (Bind Domain)</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Chỉ cho phép truy cập WAF qua FQDN này</div>
              </div>
              <div>
                <input
                  type="text"
                  placeholder="VD: waf.aimung.local (để trống nếu cho phép IP trực tiếp)"
                  value={formData.bind_domain}
                  onChange={(e) => handleChange('bind_domain', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Lưu ý: Nếu gắn tên miền, các yêu cầu truy cập từ IP trực tiếp sẽ bị từ chối.
                </div>
              </div>
            </div>

            {/* Row: Authorized IP */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>IP Được Phép Quản Trị</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Chỉ những IP này mới có quyền mở Dashboard WAF</div>
              </div>
              <div>
                <input
                  type="text"
                  placeholder="VD: 192.168.246.1, 10.0.0.5 (để trống nếu cho phép mọi IP nội bộ)"
                  value={formData.authorized_ips}
                  onChange={(e) => handleChange('authorized_ips', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                  }}
                />
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Phân tách nhiều địa chỉ IP bằng dấu phẩy.
                </div>
              </div>
            </div>

            {/* Row: Session Timeout & Port */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Thời Gian Phiên & Cổng</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Thời hạn đăng xuất tự động và cổng API</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Session Timeout</label>
                  <input
                    type="text"
                    value={formData.session_timeout}
                    onChange={(e) => handleChange('session_timeout', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Dashboard Port</label>
                  <input
                    type="text"
                    value={formData.dashboard_port}
                    onChange={(e) => handleChange('dashboard_port', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Row: Rate Limit Settings */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'flex-start', paddingBottom: '16px', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Rate Limiting (HAProxy)</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Chống brute-force và DDoS mức ứng dụng</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Giới hạn yêu cầu (req/10s)</label>
                  <input
                    type="number"
                    value={formData.rate_limit_req_sec}
                    onChange={(e) => handleChange('rate_limit_req_sec', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                    }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11.5px', color: '#475569', fontWeight: 600, display: 'block', marginBottom: '4px' }}>Trạng thái Rate Limit</label>
                  <select
                    value={formData.rate_limit_enabled}
                    onChange={(e) => handleChange('rate_limit_enabled', e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                      fontSize: '13px',
                    }}
                  >
                    <option value="true">Đang kích hoạt</option>
                    <option value="false">Tạm ngắt</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row: Admin Credentials */}
            <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: '16px', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '13px' }}>Tài Khoản Quản Trị</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>Tên đăng nhập và mật khẩu hệ thống</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <input
                  type="text"
                  disabled
                  value={formData.admin_username}
                  style={{
                    width: '140px',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#64748b',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                />
                <button
                  type="button"
                  onClick={() => setPasswordModal(true)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-key" style={{ color: '#2563eb' }} /> Đổi Mật Khẩu Quản Trị
                </button>
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
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          onClick={() => setPasswordModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              width: '90%',
              maxWidth: '420px',
              padding: '24px',
              color: '#0f172a',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>Đổi Mật Khẩu Quản Trị WAF</h3>
              <button
                onClick={() => setPasswordModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handlePasswordSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Mật khẩu mới (tối thiểu 6 ký tự)
                </label>
                <input
                  type="password"
                  required
                  value={passData.new_password}
                  onChange={(e) => setPassData({ ...passData, new_password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569', display: 'block', marginBottom: '4px' }}>
                  Xác nhận mật khẩu mới
                </label>
                <input
                  type="password"
                  required
                  value={passData.confirm_password}
                  onChange={(e) => setPassData({ ...passData, confirm_password: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                    fontSize: '13px',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setPasswordModal(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={passLoading}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 600,
                  }}
                >
                  {passLoading ? 'Đang lưu...' : 'Xác Nhận Đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
