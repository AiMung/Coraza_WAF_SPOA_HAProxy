import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function TelegramSettings({ telegramConfig, onSave, onTest }) {
  // Telegram States
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [demoRunning, setDemoRunning] = useState(false);
  const [toast, setToast] = useState(null);
  const [botInfo, setBotInfo] = useState(null);

  // Email / Gmail States
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [smtpHost, setSmtpHost] = useState('smtp.gmail.com');
  const [smtpPort, setSmtpPort] = useState(587);
  const [senderEmail, setSenderEmail] = useState('');
  const [appPassword, setAppPassword] = useState('');
  const [recipient, setRecipient] = useState('');
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingEmailTest, setSendingEmailTest] = useState(false);
  const [sendingReport, setSendingReport] = useState(false);

  useEffect(() => {
    if (telegramConfig) {
      setToken(telegramConfig.bot_token || '');
      setChatId(telegramConfig.chat_id || '');
      setEnabled(telegramConfig.enabled || false);
    }
    // Load email settings
    wafApi.emailSettings().then(cfg => {
      if (cfg) {
        setEmailEnabled(cfg.enabled || false);
        setSmtpHost(cfg.smtp_host || 'smtp.gmail.com');
        setSmtpPort(cfg.smtp_port || 587);
        setSenderEmail(cfg.sender_email || '');
        setAppPassword(cfg.app_password || '');
        setRecipient(cfg.recipient || '');
      }
    }).catch(() => {});
  }, [telegramConfig]);

  const showToast = (ok, msg) => {
    setToast({ ok, msg });
    setTimeout(() => setToast(null), 6000);
  };

  const handleSaveTelegram = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        bot_token: token.trim(),
        chat_id: chatId.trim(),
        enabled,
      });
      showToast(true, 'Đã lưu cấu hình Telegram thành công!');
    } catch (err) {
      showToast(false, `Lỗi lưu: ${err.message || err}`);
    }
    setSaving(false);
  };

  const handleVerifyToken = async () => {
    if (!token.trim()) {
      showToast(false, 'Vui lòng nhập Bot Token trước khi kiểm tra.');
      return;
    }
    setVerifying(true);
    try {
      const res = await wafApi.verifyTelegram(token.trim());
      if (res && res.valid) {
        setBotInfo(res.bot);
        showToast(true, `Kết nối thành công với Bot: @${res.bot?.username || 'Bot'} (${res.bot?.first_name || 'WAF Bot'})`);
      } else {
        setBotInfo(null);
        showToast(false, res.error || 'Token không hợp lệ');
      }
    } catch (err) {
      setBotInfo(null);
      showToast(false, `Lỗi kiểm tra: ${err.message || err}`);
    } finally {
      setVerifying(false);
    }
  };

  const handleDetectChatId = async () => {
    if (!token.trim()) {
      showToast(false, 'Vui lòng nhập Bot Token trước khi tìm Chat ID.');
      return;
    }
    setDetecting(true);
    try {
      const res = await wafApi.detectTelegramChatId(token.trim());
      if (res && res.found) {
        const currentList = chatId.split(',').map(s => s.trim()).filter(Boolean);
        if (!currentList.includes(res.chat_id)) {
          currentList.push(res.chat_id);
        }
        setChatId(currentList.join(', '));
        showToast(true, `Đã tìm thấy ID: ${res.chat_id} (${res.first_name || res.username || 'Kênh'})`);
      } else {
        showToast(false, res?.message || 'Chưa tìm thấy tin nhắn. Bạn hãy mở bot và gửi /start hoặc /id trước nhé!');
      }
    } catch (err) {
      showToast(false, `Lỗi phát hiện: ${err.message || err}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleTestAlert = async () => {
    setTesting(true);
    try {
      await onTest();
      showToast(true, 'Đã gửi bản tin thử nghiệm tới tất cả các kênh Telegram đã cấu hình!');
    } catch (err) {
      showToast(false, `Không thể gửi: ${err.message || err}`);
    } finally {
      setTesting(false);
    }
  };

  // Demo 20s Ban & Auto-Unban simulation
  const handleDemo20sBan = async () => {
    setDemoRunning(true);
    const demoIp = '203.0.113.' + Math.floor(Math.random() * 200 + 10);
    try {
      await wafApi.addIpRule({
        ip: demoIp,
        rule_type: 'blacklist',
        duration: '20s',
        reason: 'Demo Chặn Thử Nghiệm 20 Giây (Tự động gỡ cấm)',
      });
      showToast(true, `🚀 Đã kích hoạt lệnh cấm IP ${demoIp} trong 20 GIÂY! Bot đang gửi cảnh báo và sẽ tự động gỡ cấm.`);
    } catch (err) {
      showToast(false, `Lỗi kích hoạt demo: ${err.message || err}`);
    } finally {
      setDemoRunning(false);
    }
  };

  // Email Handlers
  const handleSaveEmail = async (e) => {
    if (e) e.preventDefault();
    setSavingEmail(true);
    try {
      await wafApi.saveEmailSettings({
        smtp_host: smtpHost.trim(),
        smtp_port: parseInt(smtpPort, 10) || 587,
        sender_email: senderEmail.trim(),
        app_password: appPassword.trim(),
        recipient: recipient.trim(),
        enabled: emailEnabled,
      });
      showToast(true, 'Đã lưu cấu hình gửi báo cáo Gmail thành công!');
    } catch (err) {
      showToast(false, `Lỗi lưu cấu hình Email: ${err.message || err}`);
    }
    setSavingEmail(false);
  };

  const handleSendEmailTest = async () => {
    if (!recipient.trim()) {
      showToast(false, 'Vui lòng nhập Email người nhận');
      return;
    }
    setSendingEmailTest(true);
    try {
      const res = await wafApi.sendTestEmail(recipient.trim());
      showToast(true, res.message || 'Đã gửi email thử nghiệm thành công! Hãy kiểm tra hòm thư.');
    } catch (err) {
      showToast(false, `Lỗi gửi test: ${err.message || err}`);
    }
    setSendingEmailTest(false);
  };

  const handleSendEmailReport = async () => {
    if (!recipient.trim()) {
      showToast(false, 'Vui lòng nhập Email người nhận báo cáo');
      return;
    }
    setSendingReport(true);
    try {
      const res = await wafApi.sendReportEmail(recipient.trim());
      showToast(true, res.message || 'Đã gửi Báo cáo Kiểm toán An ninh WAF về Gmail thành công!');
    } catch (err) {
      showToast(false, `Lỗi gửi báo cáo: ${err.message || err}`);
    }
    setSendingReport(false);
  };

  const targetList = chatId.split(',').map(s => s.trim()).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Toast Alert */}
      {toast && (
        <div
          style={{
            padding: '12px 18px',
            borderRadius: '10px',
            background: toast.ok ? '#ecfdf5' : '#fef2f2',
            border: `1px solid ${toast.ok ? '#10b981' : '#ef4444'}`,
            color: toast.ok ? '#065f46' : '#991b1b',
            fontSize: '13px',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
          }}
        >
          <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} style={{ fontSize: '16px' }}></i>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '14px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Header Card */}
      <div
        className="card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '12px',
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid #38bdf8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '22px',
              color: '#38bdf8',
            }}
          >
            <i className="fa-solid fa-bell-concierge"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              Trung Tâm Cảnh Báo An Ninh: Telegram & Gmail
            </h2>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Phát thanh cảnh báo sự cố tức thì qua Telegram và gửi báo cáo kiểm toán bảo mật định kỳ qua Gmail.
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
              background: enabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(148, 163, 184, 0.15)',
              color: enabled ? '#34d399' : '#94a3b8',
              border: enabled ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: enabled ? '#10b981' : '#94a3b8' }}></span>
            {enabled ? 'Telegram: Đang Bật' : 'Telegram: Tắt'}
          </span>
          <span
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: emailEnabled ? 'rgba(56, 189, 248, 0.2)' : 'rgba(148, 163, 184, 0.15)',
              color: emailEnabled ? '#38bdf8' : '#94a3b8',
              border: emailEnabled ? '1px solid rgba(56, 189, 248, 0.4)' : '1px solid rgba(148, 163, 184, 0.3)',
            }}
          >
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: emailEnabled ? '#0284c7' : '#94a3b8' }}></span>
            {emailEnabled ? 'Gmail: Đang Bật' : 'Gmail: Tắt'}
          </span>
        </div>
      </div>

      {/* Main 2-Column Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '20px' }}>
        {/* CARD 1: CẤU HÌNH TELEGRAM BOT */}
        <div className="card" style={{ padding: '22px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-brands fa-telegram" style={{ fontSize: '20px', color: '#0284c7' }}></i>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Kênh Telegram Alert & Lệnh Từ Xa
              </h3>
            </div>
            <label className="switch" style={{ margin: 0 }}>
              <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
              <span className="slider round"></span>
            </label>
          </div>

          <form onSubmit={handleSaveTelegram} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Bot Token */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                Bot Token <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="VD: 8920491204:AAHZFy2Pook..."
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
                  className="btn btn-outline"
                  style={{ height: '38px', padding: '0 14px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' }}
                >
                  <i className={`fa-solid ${verifying ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  {verifying ? 'Đang test...' : 'Kiểm Tra'}
                </button>
              </div>
              {botInfo && (
                <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '4px', fontWeight: 600 }}>
                  ✓ Đã liên kết: <strong>{botInfo.first_name}</strong> (@{botInfo.username})
                </div>
              )}
            </div>

            {/* Target Chat IDs */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                Danh Sách Chat ID (Hỗ trợ vừa gửi Nhóm vừa gửi Cá nhân) <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="VD: -1003880486094, 8732919865"
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
                  className="btn btn-outline"
                  style={{ height: '38px', padding: '0 14px', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap', color: '#047857', borderColor: '#10b981' }}
                  title="Tự động quét ID từ tin nhắn bạn vừa gửi cho Bot"
                >
                  <i className={`fa-solid ${detecting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                  {detecting ? 'Đang dò...' : 'Dò Chat ID'}
                </button>
              </div>

              {/* Active Target Badges */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                {targetList.map((id, idx) => (
                  <span
                    key={idx}
                    style={{
                      background: id.startsWith('-') ? '#eff6ff' : '#f0fdf4',
                      color: id.startsWith('-') ? '#1d4ed8' : '#15803d',
                      border: `1px solid ${id.startsWith('-') ? '#bfdbfe' : '#bbf7d0'}`,
                      borderRadius: '6px',
                      padding: '3px 8px',
                      fontSize: '11px',
                      fontWeight: 700,
                    }}
                  >
                    {id.startsWith('-') ? `👥 Nhóm: ${id}` : `👤 Cá nhân: ${id}`}
                  </span>
                ))}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary"
                style={{ flex: 1, height: '38px', fontSize: '12.5px', fontWeight: 700 }}
              >
                <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                {saving ? 'Đang lưu...' : 'Lưu Cấu Hình'}
              </button>
              <button
                type="button"
                onClick={handleTestAlert}
                disabled={testing || !token || !chatId}
                className="btn btn-outline"
                style={{ height: '38px', padding: '0 16px', fontSize: '12.5px', fontWeight: 700 }}
              >
                <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                {testing ? 'Đang gửi...' : 'Gửi Test'}
              </button>
            </div>
          </form>

          {/* Quick Demo Ban 20s Box */}
          <div style={{ marginTop: '16px', padding: '14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
              <div>
                <div style={{ fontSize: '12.5px', fontWeight: 800, color: '#92400e' }}>
                  ⏱️ Kịch Bản Thử Nghiệm: Chặn IP 20 Giây & Tự Động Gỡ
                </div>
                <div style={{ fontSize: '11.5px', color: '#b45309', marginTop: '2px' }}>
                  Kích hoạt cấm tức thì 20s, bot gửi cảnh báo → hết 20s bot tự động gửi tin nhắn gỡ cấm!
                </div>
              </div>
              <button
                type="button"
                onClick={handleDemo20sBan}
                disabled={demoRunning}
                className="btn btn-warning"
                style={{ height: '34px', padding: '0 14px', fontSize: '11.5px', fontWeight: 800 }}
              >
                <i className={`fa-solid ${demoRunning ? 'fa-spinner fa-spin' : 'fa-stopwatch'}`}></i>
                {demoRunning ? 'Đang chạy...' : '⚡ Bắt Đầu Demo 20s'}
              </button>
            </div>
          </div>

          {/* Cheat Sheet of Commands */}
          <div style={{ marginTop: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>
              📋 Lệnh Gõ Nhanh Trong Nhóm Telegram:
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px', fontSize: '11px', color: '#64748b' }}>
              <div><code>/stats</code> : Thống kê lượt chặn hôm nay</div>
              <div><code>/latest</code> : Xem 5 đợt tấn công gần nhất</div>
              <div><code>/ban &lt;IP&gt; 20s</code> : Chặn thử nghiệm 20 giây</div>
              <div><code>/unban &lt;IP&gt;</code> : Gỡ cấm thủ công</div>
            </div>
          </div>
        </div>

        {/* CARD 2: CẤU HÌNH GỬI BÁO CÁO QUA GMAIL */}
        <div className="card" style={{ padding: '22px', borderRadius: '12px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fa-solid fa-envelope-open-text" style={{ fontSize: '20px', color: '#ea4335' }}></i>
              <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                Gửi Báo Cáo Kiểm Toán Qua Gmail
              </h3>
            </div>
            <label className="switch" style={{ margin: 0 }}>
              <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
              <span className="slider round"></span>
            </label>
          </div>

          <form onSubmit={handleSaveEmail} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Recipient Email */}
            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                Email Người Nhận Báo Cáo <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="email"
                placeholder="VD: sếp@doanhnghiep.com hoặc your-email@gmail.com"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
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

            {/* Sender Gmail & App Password */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Gmail Gửi Đi (Sender)
                </label>
                <input
                  type="email"
                  placeholder="your-bot@gmail.com"
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#475569', marginBottom: '5px' }}>
                  Google App Password (16 ký tự)
                </label>
                <input
                  type="password"
                  placeholder="VD: abcd efgh ijkl mnop"
                  value={appPassword}
                  onChange={(e) => setAppPassword(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: '11px', color: '#64748b', lineHeight: 1.5 }}>
              💡 <i>Tạo App Password tại: Google Account → Security → 2-Step Verification → App Passwords. Giao thức an toàn cổng 587 (TLS).</i>
            </div>

            {/* Actions for Email */}
            <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
              <button
                type="submit"
                disabled={savingEmail}
                className="btn btn-primary"
                style={{ flex: 1, height: '38px', fontSize: '12.5px', fontWeight: 700 }}
              >
                <i className={`fa-solid ${savingEmail ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                {savingEmail ? 'Đang lưu...' : 'Lưu Cấu Hình'}
              </button>
              <button
                type="button"
                onClick={handleSendEmailTest}
                disabled={sendingEmailTest || !senderEmail || !recipient}
                className="btn btn-outline"
                style={{ height: '38px', padding: '0 14px', fontSize: '12px', fontWeight: 700 }}
              >
                <i className={`fa-solid ${sendingEmailTest ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                {sendingEmailTest ? 'Đang gửi...' : 'Test Mail'}
              </button>
            </div>
          </form>

          {/* Instant Security Audit Report to Gmail */}
          <div style={{ marginTop: '16px', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                  📩 Trích Xuất & Gửi Báo Cáo An Ninh Ngay
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '2px' }}>
                  Tự động tổng hợp bảng vi phạm, tỷ lệ chặn và Top IP đe dọa gửi trực tiếp về Gmail.
                </div>
              </div>
              <button
                type="button"
                onClick={handleSendEmailReport}
                disabled={sendingReport || !senderEmail || !recipient}
                className="btn btn-primary"
                style={{ background: '#ea4335', borderColor: '#dc2626', height: '36px', padding: '0 16px', fontSize: '12px', fontWeight: 800 }}
              >
                <i className={`fa-solid ${sendingReport ? 'fa-spinner fa-spin' : 'fa-file-invoice'}`}></i>
                {sendingReport ? 'Đang xuất báo cáo...' : 'Gửi Báo Cáo Về Gmail'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
