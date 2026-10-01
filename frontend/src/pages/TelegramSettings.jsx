import React, { useState, useEffect } from 'react';
import { wafApi } from '../api/client';

export default function TelegramSettings({ telegramConfig, onSave, onTest }) {
  // Active Tab: 'telegram' | 'email'
  const [activeTab, setActiveTab] = useState('telegram');

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
    wafApi
      .emailSettings()
      .then((cfg) => {
        if (cfg) {
          setEmailEnabled(cfg.enabled || false);
          setSmtpHost(cfg.smtp_host || 'smtp.gmail.com');
          setSmtpPort(cfg.smtp_port || 587);
          setSenderEmail(cfg.sender_email || '');
          setAppPassword(cfg.app_password || '');
          setRecipient(cfg.recipient || '');
        }
      })
      .catch(() => {});
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
        const currentList = chatId.split(',').map((s) => s.trim()).filter(Boolean);
        const newIdStr = String(res.chat_id);
        if (!currentList.includes(newIdStr)) {
          const updated = currentList.length > 0 ? `${chatId}, ${newIdStr}` : newIdStr;
          setChatId(updated);
          showToast(true, `Đã tìm thấy Chat ID mới: ${newIdStr} (${res.chat_title || res.user_name || 'Kênh Telegram'})!`);
        } else {
          showToast(true, `Kênh này đã có trong danh sách: ${newIdStr}`);
        }
      } else {
        showToast(false, res.message || 'Chưa tìm thấy tin nhắn mới. Hãy mở Telegram gõ /link hoặc gửi tin nhắn cho bot rồi thử lại.');
      }
    } catch (err) {
      showToast(false, `Lỗi tìm Chat ID: ${err.message || err}`);
    } finally {
      setDetecting(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!token.trim() || !chatId.trim()) {
      showToast(false, 'Vui lòng điền đủ Bot Token và Chat ID trước khi test.');
      return;
    }
    setTesting(true);
    try {
      await onTest();
      showToast(true, 'Đã gửi bản tin cảnh báo WAF thử nghiệm đến toàn bộ kênh Telegram!');
    } catch (err) {
      showToast(false, `Lỗi gửi test: ${err.message || err}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSimulateDemoBan = async () => {
    setDemoRunning(true);
    try {
      await wafApi.addIpRule({
        ip: '203.0.113.88',
        rule_type: 'blacklist',
        duration: '20s',
        reason: 'Demo Chặn 20s qua Trung Tâm Điều Khiển',
      });
      showToast(true, '⚡ Đã kích hoạt kịch bản Chặn IP 203.0.113.88 trong 20s! Hãy quan sát thông báo trên Telegram và đếm ngược trên Blacklist.');
    } catch (err) {
      showToast(false, `Lỗi kích hoạt demo: ${err.message || err}`);
    } finally {
      setDemoRunning(false);
    }
  };

  const handleSaveEmail = async (e) => {
    if (e) e.preventDefault();
    setSavingEmail(true);
    try {
      const res = await wafApi.saveEmailSettings({
        enabled: emailEnabled,
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort),
        sender_email: senderEmail.trim(),
        app_password: appPassword.trim(),
        recipient: recipient.trim(),
      });
      showToast(true, res.message || 'Đã lưu cấu hình Gmail / SMTP thành công!');
    } catch (err) {
      showToast(false, `Lỗi lưu email: ${err.message || err}`);
    } finally {
      setSavingEmail(false);
    }
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

  const targetList = chatId.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
            animation: 'fadeInPanel 0.2s ease',
          }}
        >
          <i className={`fa-solid ${toast.ok ? 'fa-circle-check' : 'fa-circle-exclamation'}`} style={{ fontSize: '16px' }}></i>
          <span style={{ flex: 1 }}>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '16px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* Top Banner Card */}
      <div
        className="card"
        style={{
          padding: '20px 24px',
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 100%)',
          color: '#ffffff',
          borderRadius: '14px',
          border: '1px solid rgba(56, 189, 248, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
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
            <i className="fa-solid fa-satellite-dish"></i>
          </div>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
              Trung Tâm Cảnh Báo An Ninh & Thông Báo Đa Kênh
            </h2>
            <p style={{ fontSize: '12.5px', color: '#94a3b8', margin: '4px 0 0 0' }}>
              Phát thanh cảnh báo sự cố tức thì qua Telegram Bot và gửi báo cáo kiểm toán bảo mật định kỳ qua Gmail.
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

      {/* Modern 2-Tab Navigation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: '#ffffff',
          padding: '6px',
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('telegram')}
          style={{
            flex: 1,
            padding: '11px 20px',
            borderRadius: '9px',
            border: activeTab === 'telegram' ? '1px solid #bae6fd' : '1px solid transparent',
            background: activeTab === 'telegram' ? '#f0f9ff' : 'transparent',
            color: activeTab === 'telegram' ? '#0369a1' : '#64748b',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="fa-brands fa-telegram" style={{ fontSize: '18px', color: '#0284c7' }}></i>
          <span>Kênh Cảnh Báo Telegram (Telegram SOC Dispatcher)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: enabled ? '#dcfce7' : '#fee2e2',
              color: enabled ? '#15803d' : '#991b1b',
              fontWeight: 700,
            }}
          >
            {enabled ? 'HOẠT ĐỘNG' : 'TẠM TẮT'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('email')}
          style={{
            flex: 1,
            padding: '11px 20px',
            borderRadius: '9px',
            border: activeTab === 'email' ? '1px solid #bfdbfe' : '1px solid transparent',
            background: activeTab === 'email' ? '#eff6ff' : 'transparent',
            color: activeTab === 'email' ? '#1d4ed8' : '#64748b',
            fontWeight: 800,
            fontSize: '13px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 0.15s ease',
          }}
        >
          <i className="fa-solid fa-envelope-open-text" style={{ fontSize: '16px', color: '#2563eb' }}></i>
          <span>Báo Cáo Kiểm Toán Gmail (Email Security Audit)</span>
          <span
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '12px',
              background: emailEnabled ? '#dcfce7' : '#fee2e2',
              color: emailEnabled ? '#15803d' : '#991b1b',
              fontWeight: 700,
            }}
          >
            {emailEnabled ? 'HOẠT ĐỘNG' : 'TẠM TẮT'}
          </span>
        </button>
      </div>

      {/* TAB 1: TELEGRAM BOT DISPATCHER */}
      {activeTab === 'telegram' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeInPanel 0.2s ease' }}>
          {/* Main Config Form */}
          <div className="card" style={{ padding: '24px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#f0f9ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-brands fa-telegram" style={{ fontSize: '20px', color: '#0284c7' }}></i>
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Cấu Hình Bot Cảnh Báo & Điều Khiển Từ Xa (Remote SOC Control)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Phát sóng cảnh báo trực tiếp khi WAF phát hiện tấn công và cho phép phản ứng nhanh qua nút bấm.
                  </p>
                </div>
              </div>
              <label className="switch" style={{ margin: 0 }}>
                <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
                <span className="slider round"></span>
              </label>
            </div>

            <form onSubmit={handleSaveTelegram}>
              {/* Bot Token Input */}
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                    Telegram Bot Token <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleVerifyToken}
                    disabled={verifying}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#0284c7',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <i className={`fa-solid ${verifying ? 'fa-spinner fa-spin' : 'fa-circle-check'}`}></i>
                    <span>Kiểm tra Token</span>
                  </button>
                </div>
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="VD: 8920491204:AAHZFy2PookU8fWtZsyeyhEj6ItrTq0ofUA"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                  required
                />
                {botInfo && (
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-robot"></i>
                    <span>
                      Đã xác thực: <strong>@{botInfo.username}</strong> ({botInfo.first_name})
                    </span>
                  </div>
                )}
              </div>

              {/* Chat IDs Input */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>
                    Danh Sách Target Chat ID (Cá nhân hoặc Nhóm) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleDetectChatId}
                    disabled={detecting}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#10b981',
                      fontSize: '12px',
                      cursor: 'pointer',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                    title="Tìm Chat ID tự động từ tin nhắn mới nhất trong nhóm hoặc cá nhân"
                  >
                    <i className={`fa-solid ${detecting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    <span>Tự động tìm Chat ID</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={chatId}
                  onChange={(e) => setChatId(e.target.value)}
                  placeholder="VD: -1003880486094, 8732919865"
                  style={{
                    width: '100%',
                    height: '40px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                    fontFamily: 'monospace',
                  }}
                  required
                />
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11.5px', color: '#64748b' }}>Các kênh đang nhận cảnh báo:</span>
                  {targetList.length === 0 ? (
                    <span style={{ fontSize: '11px', color: '#94a3b8', fontStyle: 'italic' }}>Chưa có kênh nào</span>
                  ) : (
                    targetList.map((id, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: '11.5px',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: id.startsWith('-') ? '#f0fdf4' : '#eff6ff',
                          color: id.startsWith('-') ? '#15803d' : '#1d4ed8',
                          border: `1px solid ${id.startsWith('-') ? '#bbf7d0' : '#bfdbfe'}`,
                          fontWeight: 700,
                          fontFamily: 'monospace',
                        }}
                      >
                        {id.startsWith('-') ? '👥 Group: ' : '👤 Private: '}
                        {id}
                      </span>
                    ))
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleTestTelegram}
                    disabled={testing}
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
                      gap: '6px',
                    }}
                  >
                    <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} style={{ color: '#0284c7' }}></i>
                    <span>Gửi Cảnh Báo Mẫu</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSimulateDemoBan}
                    disabled={demoRunning}
                    style={{
                      height: '38px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      border: '1px solid #c7d2fe',
                      background: '#eef2ff',
                      color: '#4338ca',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                    title="Kích hoạt kịch bản cấm IP 20 giây và tự động gỡ theo đếm ngược để biểu diễn"
                  >
                    <i className={`fa-solid ${demoRunning ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                    <span>⚡ Demo Chặn 20s</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    height: '38px',
                    padding: '0 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                  }}
                >
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  <span>Lưu Cấu Hình Telegram</span>
                </button>
              </div>
            </form>
          </div>

          {/* Quick Guide & Interactive Demo Card */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px' }}>
            <div className="card" style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-lightbulb" style={{ color: '#eab308' }}></i>
                Cách Lấy Chat ID Nhóm Trong 3 Giây
              </h4>
              <ol style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#475569', lineHeight: 1.7 }}>
                <li>Thêm Bot vào nhóm Telegram của bạn và gán quyền Admin.</li>
                <li>Gõ lệnh <code>/link</code> hoặc <code>/id</code> trực tiếp vào trong nhóm.</li>
                <li>Hệ thống WAF sẽ tự động kết nối nhóm và kích hoạt phát sóng cảnh báo!</li>
              </ol>
            </div>

            <div className="card" style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-terminal" style={{ color: '#0284c7' }}></i>
                Các Lệnh Điều Khiển Từ Xa (Remote Commands)
              </h4>
              <div style={{ fontSize: '12px', color: '#475569', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                <div><code>/stats</code> : Thống kê WAF</div>
                <div><code>/latest</code> : 5 vi phạm gần nhất</div>
                <div><code>/status</code> : Trạng thái CPU/RAM</div>
                <div><code>/demo</code> : Thử chặn 20s</div>
                <div><code>/ban &lt;IP&gt;</code> : Chặn địa chỉ IP</div>
                <div><code>/unban &lt;IP&gt;</code> : Gỡ cấm IP</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: GMAIL / SMTP SECURITY AUDIT */}
      {activeTab === 'email' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', animation: 'fadeInPanel 0.2s ease' }}>
          {/* Main Email Form */}
          <div className="card" style={{ padding: '24px', borderRadius: '14px', background: '#ffffff', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <i className="fa-solid fa-envelope" style={{ fontSize: '18px', color: '#2563eb' }}></i>
                </div>
                <div>
                  <h3 style={{ fontSize: '15px', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                    Cấu Hình Báo Cáo Kiểm Toán Qua Gmail (SMTP Executive Report)
                  </h3>
                  <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#64748b' }}>
                    Gửi báo cáo định kỳ tổng hợp số liệu lưu lượng, vi phạm CRS và danh sách tấn công về hòm thư lãnh đạo.
                  </p>
                </div>
              </div>
              <label className="switch" style={{ margin: 0 }}>
                <input type="checkbox" checked={emailEnabled} onChange={(e) => setEmailEnabled(e.target.checked)} />
                <span className="slider round"></span>
              </label>
            </div>

            <form onSubmit={handleSaveEmail}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Máy Chủ SMTP Host
                  </label>
                  <input
                    type="text"
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.gmail.com"
                    style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Cổng SMTP (Port)
                  </label>
                  <input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(e.target.value)}
                    placeholder="587 (STARTTLS) hoặc 465 (SSL)"
                    style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Địa Chỉ Email Người Gửi (Sender Gmail)
                  </label>
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="VD: soc.waf.alert@gmail.com"
                    style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                    required
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Mật Khẩu Ứng Dụng (App Password 16 Ký Tự)
                  </label>
                  <input
                    type="password"
                    value={appPassword}
                    onChange={(e) => setAppPassword(e.target.value)}
                    placeholder="VD: xxxx yyyy zzzz wwww"
                    style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px', fontFamily: 'monospace' }}
                    required
                  />
                </div>
              </div>

              {/* Recipient */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '12.5px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Email Người Nhận Báo Cáo (Recipient) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="VD: manager@company.vn hoặc email của bạn"
                  style={{ width: '100%', height: '40px', padding: '0 12px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '13px' }}
                  required
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={handleSendEmailTest}
                    disabled={sendingEmailTest}
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
                      gap: '6px',
                    }}
                  >
                    <i className={`fa-solid ${sendingEmailTest ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`} style={{ color: '#2563eb' }}></i>
                    <span>Gửi Email Test Kết Nối</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendEmailReport}
                    disabled={sendingReport}
                    style={{
                      height: '38px',
                      padding: '0 16px',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe',
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
                    <i className={`fa-solid ${sendingReport ? 'fa-spinner fa-spin' : 'fa-file-invoice'}`}></i>
                    <span>Xuất & Gửi Báo Cáo Kiểm Toán HTML</span>
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={savingEmail}
                  style={{
                    height: '38px',
                    padding: '0 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#2563eb',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 800,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 6px rgba(37, 99, 235, 0.3)',
                  }}
                >
                  <i className={`fa-solid ${savingEmail ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  <span>Lưu Cấu Hình Gmail</span>
                </button>
              </div>
            </form>
          </div>

          {/* Guide Card */}
          <div className="card" style={{ padding: '20px', borderRadius: '12px', background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <h4 style={{ fontSize: '13.5px', fontWeight: 800, color: '#0f172a', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-brands fa-google" style={{ color: '#ea4335' }}></i>
              Hướng Dẫn Tạo Mật Khẩu Ứng Dụng (Gmail App Password)
            </h4>
            <div style={{ fontSize: '12px', color: '#475569', lineHeight: 1.7 }}>
              <p style={{ margin: '0 0 6px 0' }}>
                Do chính sách bảo mật của Google, bạn không thể dùng mật khẩu đăng nhập tài khoản thông thường. Hãy tạo Mật khẩu ứng dụng 16 ký tự:
              </p>
              <ol style={{ margin: 0, paddingLeft: '18px' }}>
                <li>
                  Truy cập{' '}
                  <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" style={{ color: '#2563eb', fontWeight: 600 }}>
                    Tài khoản Google &gt; Bảo mật
                  </a>{' '}
                  và đảm bảo đã bật <strong>Xác minh 2 bước</strong>.
                </li>
                <li>
                  Tìm mục <strong>Mật khẩu ứng dụng (App passwords)</strong>.
                </li>
                <li>
                  Tạo tên mới (VD: <code>Coraza WAF SOC</code>) và copy chuỗi 16 ký tự dán vào ô Mật khẩu ứng dụng ở trên.
                </li>
              </ol>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
