import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function TelegramSettings({ telegramConfig, onSave, onTest }) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [botInfo, setBotInfo] = useState(null);

  // Granular alert preferences
  const [alertSqli, setAlertSqli] = useState(true);
  const [alertXss, setAlertXss] = useState(true);
  const [alertRce, setAlertRce] = useState(true);
  const [alertLfi, setAlertLfi] = useState(true);
  const [alertCC, setAlertCC] = useState(true);
  const [alertScanner, setAlertScanner] = useState(true);
  const [alertBlacklist, setAlertBlacklist] = useState(false);

  useEffect(() => {
    if (telegramConfig) {
      setToken(telegramConfig.bot_token || '');
      setChatId(telegramConfig.chat_id || '');
      setEnabled(telegramConfig.enabled || false);
    }
  }, [telegramConfig]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setTestResult(null);
    try {
      await onSave({
        bot_token: token.trim(),
        chat_id: chatId.trim(),
        enabled,
      });
      setTestResult({ ok: true, msg: '✅ Đã lưu cấu hình Telegram Alert Dispatcher thành công!' });
    } catch (err) {
      setTestResult({ ok: false, msg: String(err.message || err) });
    }
    setSaving(false);
  };

  const handleVerifyToken = async () => {
    if (!token.trim()) {
      setTestResult({ ok: false, msg: 'Vui lòng nhập Bot Token trước khi kiểm tra.' });
      return;
    }
    setVerifying(true);
    setTestResult(null);
    try {
      const res = await wafApi.verifyTelegram(token.trim());
      if (res && res.valid) {
        setBotInfo(res.bot);
        setTestResult({
          ok: true,
          msg: `🎉 Kết nối thành công với Bot: @${res.bot?.username || 'Bot'} (${res.bot?.first_name || 'aaWAF Bot'})`,
        });
      } else {
        setBotInfo(null);
        setTestResult({ ok: false, msg: res.error || 'Token không hợp lệ' });
      }
    } catch (err) {
      setBotInfo(null);
      setTestResult({ ok: false, msg: 'Lỗi kiểm tra token: ' + (err.message || err) });
    } finally {
      setVerifying(false);
    }
  };

  const handleDetectChatId = async () => {
    if (!token.trim()) {
      setTestResult({ ok: false, msg: 'Vui lòng nhập Bot Token trước khi tìm Chat ID.' });
      return;
    }
    setDetecting(true);
    setTestResult(null);
    try {
      const res = await wafApi.detectTelegramChatId(token.trim());
      if (res && res.found) {
        setChatId(res.chat_id);
        setTestResult({
          ok: true,
          msg: `🎉 Thành công! Đã tự động nhận diện Chat ID: ${res.chat_id} (${res.first_name || res.username || 'Người dùng'})`,
        });
      } else {
        setTestResult({
          ok: false,
          msg: res?.message || 'Chưa tìm thấy tin nhắn. Bạn hãy mở bot trên Telegram và bấm START trước nhé!',
        });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: 'Lỗi phát hiện Chat ID: ' + (err.message || err) });
    } finally {
      setDetecting(false);
    }
  };

  const handleTestAlert = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest();
      setTestResult({
        ok: true,
        msg: '🚀 Đã gửi bản tin cảnh báo mẫu thành công! Hãy kiểm tra ứng dụng Telegram trên điện thoại.',
      });
    } catch (err) {
      setTestResult({
        ok: false,
        msg: `❌ Không thể gửi tin nhắn Telegram: ${err.message || err}. Hãy kiểm tra lại Bot Token và Chat ID.`,
      });
    } finally {
      setTesting(false);
    }
  };

  const isConfigured = token.trim() !== '' && chatId.trim() !== '';

  return (
    <div className="aawaf-dashboard-page" style={{ padding: '0 0 24px 0' }}>
      {/* Page Header */}
      <div
        className="dashboard-card"
        style={{
          padding: '18px 24px',
          marginBottom: '16px',
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(59, 130, 246, 0.25)',
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
              background: 'rgba(59, 130, 246, 0.2)',
              border: '1px solid #3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              color: '#38bdf8',
            }}
          >
            <i className="fa-brands fa-telegram"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              Telegram Instant Attack Alert Center
            </h2>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Kênh phát thanh cảnh báo sự cố an ninh tức thời về thiết bị di động · Tương thích nhóm Chat & Kênh thông báo
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: enabled && isConfigured ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
              color: enabled && isConfigured ? '#34d399' : '#94a3b8',
              border: enabled && isConfigured ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: enabled && isConfigured ? '#10b981' : '#94a3b8',
                boxShadow: enabled && isConfigured ? '0 0 8px #10b981' : 'none',
              }}
            />
            {enabled && isConfigured ? 'Dispatcher Đang Hoạt Động' : 'Chưa Kích Hoạt'}
          </span>
        </div>
      </div>

      {testResult && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            marginBottom: '16px',
            fontSize: '13px',
            fontWeight: 600,
            background: testResult.ok ? '#ecfdf5' : '#fef2f2',
            color: testResult.ok ? '#065f46' : '#991b1b',
            border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <i className={`fa-solid ${testResult.ok ? 'fa-circle-check' : 'fa-circle-xmark'}`} style={{ fontSize: '16px' }}></i>
          <span>{testResult.msg}</span>
        </div>
      )}

      {/* 2-Column Full-Width Enterprise Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(0, 1fr)', gap: '18px' }}>
        {/* LEFT COLUMN: Bot Settings Form & Preferences */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-sliders" style={{ color: '#3b82f6' }}></i>
              Thiết Lập Kết Nối Telegram Bot
            </h3>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Enable Switch */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#0f172a' }}>Kích Hoạt Cảnh Báo Telegram</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>Tự động gửi tin nhắn khi phát hiện các mối đe dọa bị WAF chặn</div>
                </div>
                <label className="switch-green" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              {/* Bot Token Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Telegram Bot Token <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="VD: 7123456789:AAHk..."
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    style={{
                      flex: 1,
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyToken}
                    disabled={verifying}
                    style={{
                      height: '38px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      border: '1px solid #3b82f6',
                      background: '#eff6ff',
                      color: '#1d4ed8',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                    title="Kiểm tra tính hợp lệ của Token trực tiếp với máy chủ Telegram"
                  >
                    <i className={`fa-solid ${verifying ? 'fa-spinner fa-spin' : 'fa-network-wired'}`}></i>
                    {verifying ? 'Đang kiểm tra...' : 'Kiểm Tra Token'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  Tạo bot mới bằng cách gửi lệnh <code>/newbot</code> tới{' '}
                  <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" style={{ color: '#0284c7', fontWeight: 600 }}>
                    @BotFather
                  </a>{' '}
                  trên Telegram.
                </div>
              </div>

              {/* Verified Bot Info Banner */}
              {botInfo && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    border: '1px solid #86efac',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                  }}
                >
                  <i className="fa-solid fa-robot" style={{ fontSize: '20px', color: '#16a34a' }}></i>
                  <div style={{ fontSize: '12px', color: '#166534' }}>
                    <strong>Bot Đã Xác Thực:</strong> {botInfo.first_name} (
                    <a href={`https://t.me/${botInfo.username}`} target="_blank" rel="noreferrer" style={{ color: '#15803d', textDecoration: 'underline' }}>
                      @{botInfo.username}
                    </a>
                    ) · ID: {botInfo.id}
                  </div>
                </div>
              )}

              {/* Chat ID Field */}
              <div>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
                  Chat ID / Group ID <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="VD: 123456789 (Cá nhân) hoặc -1001234567890 (Nhóm)"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    style={{
                      flex: 1,
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '12.5px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleDetectChatId}
                    disabled={detecting}
                    style={{
                      height: '38px',
                      padding: '0 14px',
                      borderRadius: '8px',
                      border: '1px solid #10b981',
                      background: '#f0fdf4',
                      color: '#047857',
                      fontSize: '12px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      whiteSpace: 'nowrap',
                    }}
                    title="Tự động phát hiện Chat ID từ tin nhắn START bạn vừa gửi cho Bot"
                  >
                    <i className={`fa-solid ${detecting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    {detecting ? 'Đang dò...' : 'Tự Động Lấy Chat ID'}
                  </button>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px', lineHeight: 1.5 }}>
                  💡 <strong>Bước 1:</strong> Mở Telegram, bấm vào{' '}
                  <a
                    href={botInfo ? `https://t.me/${botInfo.username}` : 'https://t.me/ITDLUPanel_alert_bot'}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0284c7', fontWeight: 700 }}
                  >
                    {botInfo ? `@${botInfo.username}` : '@ITDLUPanel_alert_bot'}
                  </a>{' '}
                  rồi bấm <strong>START</strong> (hoặc gõ <code>/start</code>).
                  <br />
                  💡 <strong>Bước 2:</strong> Bấm nút <strong>"Tự Động Lấy Chat ID"</strong> ở trên để hệ thống tự điền ID của bạn!
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    flex: 1,
                    height: '40px',
                    borderRadius: '8px',
                    background: '#10b981',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 4px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  {saving ? 'Đang lưu...' : 'Lưu Cấu Hình'}
                </button>

                <button
                  type="button"
                  onClick={handleTestAlert}
                  disabled={testing}
                  style={{
                    height: '40px',
                    padding: '0 18px',
                    borderRadius: '8px',
                    background: '#ffffff',
                    color: '#0284c7',
                    border: '1px solid #0284c7',
                    fontWeight: 700,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                  title="Gửi bản tin cảnh báo thử nghiệm tới Telegram"
                >
                  <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                  {testing ? 'Đang gửi...' : 'Gửi Tin Thử Nghiệm'}
                </button>
              </div>
            </form>
          </div>

          {/* Alert Scope Matrix Card */}
          <div className="dashboard-card" style={{ padding: '20px', background: '#ffffff', borderRadius: '12px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-bell" style={{ color: '#f59e0b' }}></i>
              Ma Trận Lọc Sự Cố Phát Cảnh Báo
            </h3>
            <p style={{ fontSize: '12px', color: '#64748b', marginBottom: '12px' }}>
              Chọn các chủng loại tấn công bạn muốn nhận cảnh báo tức thì về điện thoại:
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertSqli} onChange={(e) => setAlertSqli(e.target.checked)} />
                <span>💉 SQL Injection (SQLi)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertXss} onChange={(e) => setAlertXss(e.target.checked)} />
                <span>⚡ Cross-Site Scripting (XSS)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertRce} onChange={(e) => setAlertRce(e.target.checked)} />
                <span>⚙️ Remote Code Execution (RCE)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertLfi} onChange={(e) => setAlertLfi(e.target.checked)} />
                <span>📁 Path Traversal (LFI)</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertCC} onChange={(e) => setAlertCC(e.target.checked)} />
                <span>⚡ CC Flood / DDoS Challenge</span>
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#334155', cursor: 'pointer' }}>
                <input type="checkbox" checked={alertScanner} onChange={(e) => setAlertScanner(e.target.checked)} />
                <span>🤖 Vulnerability Scanners (sqlmap)</span>
              </label>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Realistic Telegram Message Preview & Live Simulator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="dashboard-card" style={{ padding: '20px', background: '#0f172a', color: '#ffffff', borderRadius: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '14.5px', fontWeight: 800, margin: 0, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-mobile-screen-button" style={{ color: '#38bdf8' }}></i>
                Mô Phỏng Tin Nhắn Cảnh Báo Live (Telegram UI)
              </h3>
              <span style={{ fontSize: '11px', background: '#1e293b', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', border: '1px solid #334155' }}>
                HTML Formatted
              </span>
            </div>

            {/* Telegram Message Bubble */}
            <div
              style={{
                background: '#1e293b',
                borderRadius: '10px',
                padding: '16px',
                border: '1px solid #334155',
                fontSize: '12.5px',
                lineHeight: 1.6,
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
              }}
            >
              <div style={{ color: '#f43f5e', fontWeight: 800, fontSize: '14px', marginBottom: '8px' }}>
                🚨 [CORAZA WAF ALERT] Phát Hiện Tấn Công!
              </div>

              <div style={{ color: '#cbd5e1' }}>
                • <strong>Loại tấn công:</strong> <span style={{ color: '#f87171', fontFamily: 'monospace' }}>SQL Injection (SQLi)</span><br />
                • <strong>IP Nguồn:</strong> <span style={{ color: '#38bdf8', fontFamily: 'monospace' }}>203.175.10.230</span> (🇮🇩 Indonesia)<br />
                • <strong>Hành động:</strong> ⛔ <strong>DENY (403 Forbidden)</strong><br />
                • <strong>Rule ID:</strong> <code>942100</code><br />
                • <strong>Mô tả:</strong> SQL Injection Attack: SQL Operator Detected<br />
                • <strong>Domain đích:</strong> <code>192.168.246.100</code><br />
                • <strong>Method & URI:</strong> <code>GET /?id=1 UNION SELECT password...</code><br />
                • <strong>Thời gian:</strong> <i>{new Date().toLocaleTimeString('vi-VN')} (GMT+7 Hà Nội)</i>
              </div>

              {/* Inline Action Buttons (Keyboard Markup) */}
              <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
                <button
                  type="button"
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#dc2626',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => alert('Thao tác tương tác từ Telegram Bot: Cấm IP vĩnh viễn')}
                >
                  ⛔ Cấm IP Này (Blacklist)
                </button>

                <button
                  type="button"
                  style={{
                    padding: '8px',
                    borderRadius: '6px',
                    background: '#16a34a',
                    color: '#ffffff',
                    border: 'none',
                    fontSize: '11px',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                  onClick={() => alert('Thao tác tương tác từ Telegram Bot: Bỏ qua / Cho vào Whitelist')}
                >
                  🛡️ Bỏ Qua (Whitelist)
                </button>
              </div>
            </div>

            <div style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '12px' }}>
              💡 Quản trị viên có thể bấm trực tiếp các nút bấm trên Telegram để cấm IP hoặc mở khóa mà không cần truy cập máy tính!
            </div>
          </div>

          {/* Quick Guide Card */}
          <div className="dashboard-card" style={{ padding: '18px', background: '#ffffff', borderRadius: '12px' }}>
            <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', marginBottom: '10px' }}>
              Hướng Dẫn Cấu Hình 3 Bước Nhanh:
            </h4>
            <ol style={{ fontSize: '12px', color: '#475569', paddingLeft: '18px', margin: 0, lineHeight: 1.7 }}>
              <li>Mở Telegram, tìm <strong>@BotFather</strong> và gõ <code>/newbot</code> để tạo Bot và nhận <strong>API Token</strong>.</li>
              <li>Mở bot bạn vừa tạo, bấm <strong>Start</strong> để mở phiên trò chuyện.</li>
              <li>Tìm bot <strong>@userinfobot</strong> để lấy <strong>Chat ID</strong> của bạn, dán vào bảng bên trái và bấm <strong>Lưu Cấu Hình</strong>.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
