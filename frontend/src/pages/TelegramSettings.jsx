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
    setTimeout(() => setToast(null), 5000);
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
      showToast(true, '⚡ Đã kích hoạt kịch bản Chặn IP 203.0.113.88 trong 20s! Hãy quan sát thông báo trên Telegram.');
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
      await wafApi.saveEmailSettings({
        enabled: emailEnabled,
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort) || 587,
        sender_email: senderEmail.trim(),
        app_password: appPassword.trim(),
        recipient: recipient.trim(),
      });
      showToast(true, 'Đã lưu cấu hình Email SMTP thành công!');
    } catch (err) {
      showToast(false, `Lỗi lưu email: ${err.message || err}`);
    }
    setSavingEmail(false);
  };

  const handleTestEmail = async () => {
    if (!senderEmail.trim() || !appPassword.trim() || !recipient.trim()) {
      showToast(false, 'Vui lòng nhập đầy đủ Gmail gửi, App Password và Email nhận trước khi test.');
      return;
    }
    setSendingEmailTest(true);
    try {
      const res = await wafApi.testEmail({
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort) || 587,
        sender_email: senderEmail.trim(),
        app_password: appPassword.trim(),
        recipient: recipient.trim(),
      });
      showToast(true, res.message || 'Đã gửi email thử nghiệm thành công! Vui lòng kiểm tra hộp thư đến.');
    } catch (err) {
      showToast(false, `Lỗi gửi test email: ${err.message || err}`);
    }
    setSendingEmailTest(false);
  };

  const handleSendReportNow = async () => {
    if (!recipient.trim()) {
      showToast(false, 'Vui lòng cấu hình Email người nhận trước khi xuất báo cáo.');
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
            background: toast.ok ? '#059669' : '#dc2626',
            color: '#fff',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 600,
          }}
        >
          <i className={toast.ok ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'} />
          <span>{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '16px', marginLeft: '8px' }}
          >
            ×
          </button>
        </div>
      )}

      {/* 1. Sleek KPI Metrics Strip (Matching BlackWhiteList style) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '14px',
        }}
      >
        {/* Card 1: Telegram Status */}
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
              background: enabled ? '#e0f2fe' : '#f1f5f9',
              color: enabled ? '#0284c7' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-brands fa-telegram"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              BOT TELEGRAM
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: enabled ? '#0284c7' : '#64748b', marginTop: '2px' }}>
              {enabled ? 'Đang Hoạt Động' : 'Đang Tắt'}
            </div>
          </div>
        </div>

        {/* Card 2: Channels Count */}
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
              background: '#fef3c7',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-users"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              KÊNH NHẬN TIN
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
              {targetList.length} <span style={{ fontSize: '11.5px', fontWeight: 500, color: '#64748b' }}>kênh đích</span>
            </div>
          </div>
        </div>

        {/* Card 3: Email SMTP Status */}
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
              background: emailEnabled ? '#f3e8ff' : '#f1f5f9',
              color: emailEnabled ? '#7e22ce' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-envelope"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              GMAIL BÁO CÁO
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: emailEnabled ? '#7e22ce' : '#64748b', marginTop: '2px' }}>
              {emailEnabled ? 'Đã Cấu Hình' : 'Chưa Bật'}
            </div>
          </div>
        </div>

        {/* Card 4: Remote Commands */}
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
              background: '#dcfce7',
              color: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-bolt"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              LỆNH REMOTE SOC
            </div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#15803d', marginTop: '2px' }}>
              Inline Keyboards <span style={{ fontSize: '11px', color: '#16a34a' }}>● Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main White Container with Sub-Tab Switcher (Matching BlackWhiteList design) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Navigation Bar matching Blacklist / Whitelist tabs */}
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
          {/* Sub-tab pills */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setActiveTab('telegram')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'telegram' ? '1px solid #bae6fd' : '1px solid #e2e8f0',
                background: activeTab === 'telegram' ? '#f0f9ff' : '#ffffff',
                color: activeTab === 'telegram' ? '#0284c7' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="fa-brands fa-telegram" style={{ color: activeTab === 'telegram' ? '#0284c7' : '#94a3b8' }}></i>
              <span>Kênh Telegram Bot</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: enabled ? '#dcfce7' : '#f1f5f9',
                  color: enabled ? '#15803d' : '#64748b',
                  fontWeight: 800,
                }}
              >
                {enabled ? 'Bật' : 'Tắt'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('email')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 16px',
                borderRadius: '8px',
                border: activeTab === 'email' ? '1px solid #fbcfe8' : '1px solid #e2e8f0',
                background: activeTab === 'email' ? '#fdf2f8' : '#ffffff',
                color: activeTab === 'email' ? '#db2777' : '#64748b',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <i className="fa-solid fa-envelope" style={{ color: activeTab === 'email' ? '#db2777' : '#94a3b8' }}></i>
              <span>Cảnh Báo & Báo Cáo Gmail</span>
              <span
                style={{
                  fontSize: '11px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: emailEnabled ? '#dcfce7' : '#f1f5f9',
                  color: emailEnabled ? '#15803d' : '#64748b',
                  fontWeight: 800,
                }}
              >
                {emailEnabled ? 'Bật' : 'Tắt'}
              </span>
            </button>
          </div>

          <div style={{ fontSize: '12px', color: '#64748b' }}>
            {activeTab === 'telegram' ? (
              <span>Cảnh báo tức thời qua Telegram Bot API</span>
            ) : (
              <span>Gửi báo cáo an ninh qua giao thức SMTP TLS</span>
            )}
          </div>
        </div>

        {/* TAB 1: TELEGRAM BOT */}
        {activeTab === 'telegram' && (
          <form onSubmit={handleSaveTelegram} style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Enable Switch */}
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
                    Kích Hoạt Phát Thanh Cảnh Báo Telegram
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Tự động gửi thông báo khi Coraza phát hiện tấn công L7 hoặc khi có sự cố hệ thống
                  </div>
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
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Bot Token <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="password"
                    placeholder="VD: 8920491204:AAHZFy2PookU8fWtZsyeyhEj6ItrTq0ofUA"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    style={{
                      flex: 1,
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyToken}
                    disabled={verifying}
                    style={{
                      padding: '0 16px',
                      height: '38px',
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
                    <i className={`fa-solid ${verifying ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                    <span>Kiểm Tra</span>
                  </button>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '5px' }}>
                  Lấy token bằng cách chat với <strong>@BotFather</strong> trên Telegram.
                </div>
              </div>

              {/* Bot Verification Badge */}
              {botInfo && (
                <div
                  style={{
                    padding: '12px 16px',
                    borderRadius: '8px',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '12.5px',
                    color: '#166534',
                  }}
                >
                  <i className="fa-solid fa-circle-check" style={{ fontSize: '16px', color: '#16a34a' }}></i>
                  <div>
                    Bot xác thực: <strong>{botInfo.first_name}</strong> (<code>@{botInfo.username}</code>) · ID: {botInfo.id}
                  </div>
                </div>
              )}

              {/* Chat ID Field */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Danh Sách Chat ID (Hỗ trợ vừa gửi Nhóm vừa gửi Cá nhân) <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    placeholder="VD: -1003880486094, 8732919865 (phân tách nhiều ID bằng dấu phẩy)"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    style={{
                      flex: 1,
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleDetectChatId}
                    disabled={detecting}
                    style={{
                      padding: '0 16px',
                      height: '38px',
                      borderRadius: '8px',
                      border: '1px solid #bae6fd',
                      background: '#f0f9ff',
                      color: '#0284c7',
                      fontSize: '12.5px',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <i className={`fa-solid ${detecting ? 'fa-spinner fa-spin' : 'fa-wand-magic-sparkles'}`}></i>
                    <span>Dò Chat ID</span>
                  </button>
                </div>
                <div style={{ fontSize: '11.5px', color: '#64748b', marginTop: '5px' }}>
                  Chat ID nhóm thường bắt đầu bằng dấu trừ <code>-100...</code>, Chat ID cá nhân là số nguyên dương.
                </div>
              </div>

              {/* Channels Preview */}
              {targetList.length > 0 && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {targetList.map((id, idx) => {
                    const isGroup = id.startsWith('-');
                    return (
                      <span
                        key={idx}
                        style={{
                          fontSize: '12px',
                          fontWeight: 700,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          background: isGroup ? '#eff6ff' : '#f0fdf4',
                          color: isGroup ? '#1d4ed8' : '#15803d',
                          border: `1px solid ${isGroup ? '#bfdbfe' : '#bbf7d0'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <i className={`fa-solid ${isGroup ? 'fa-users' : 'fa-user'}`}></i>
                        <span>{isGroup ? 'Nhóm:' : 'Cá nhân:'} <code>{id}</code></span>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Demo Ban 20s Card */}
              <div
                style={{
                  background: '#fefce8',
                  border: '1px solid #fef08a',
                  borderRadius: '10px',
                  padding: '16px',
                }}
              >
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#854d0e', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <i className="fa-solid fa-stopwatch"></i>
                  Kịch Bản Thử Nghiệm: Chặn IP 20 Giây & Tự Động Gỡ Bỏ
                </div>
                <p style={{ fontSize: '12px', color: '#a16207', margin: '0 0 12px 0', lineHeight: 1.5 }}>
                  Bấm nút bên dưới để mô phỏng sự cố: WAF sẽ cấm IP <code>203.0.113.88</code> trong đúng 20 giây, bot gửi thông báo vào Telegram, bảng Blacklist đếm ngược và tự động gỡ bỏ tức thời khi hết hạn!
                </p>
                <button
                  type="button"
                  onClick={handleSimulateDemoBan}
                  disabled={demoRunning}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#eab308',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className={`fa-solid ${demoRunning ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                  <span>Bắt Đầu Demo Chặn 20s</span>
                </button>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '10px' }}>
                <button
                  type="submit"
                  disabled={saving}
                  style={{
                    padding: '9px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <i className={`fa-solid ${saving ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  <span>Lưu Cấu Hình Telegram</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestTelegram}
                  disabled={testing}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
                  <span>Gửi Bản Tin Thử Nghiệm</span>
                </button>
              </div>
            </div>
          </form>
        )}

        {/* TAB 2: EMAIL SMTP */}
        {activeTab === 'email' && (
          <form onSubmit={handleSaveEmail} style={{ maxWidth: '850px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Enable Switch */}
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
                    Kích Hoạt Gửi Báo Cáo Định Kỳ Qua Gmail
                  </div>
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                    Tổng hợp thống kê sự cố, tỷ lệ chặn và danh sách Top IP tấn công gửi về email
                  </div>
                </div>
                <label className="switch-green" style={{ margin: 0 }}>
                  <input
                    type="checkbox"
                    checked={emailEnabled}
                    onChange={(e) => setEmailEnabled(e.target.checked)}
                  />
                  <span className="slider round"></span>
                </label>
              </div>

              {/* Recipient */}
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                  Email Người Nhận Báo Cáo <span style={{ color: '#ef4444' }}>*</span>
                </label>
                <input
                  type="email"
                  placeholder="VD: sep@doanhnghiep.com, security-audit@company.vn"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  style={{
                    width: '100%',
                    height: '38px',
                    padding: '0 12px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Sender & App Password */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Tài Khoản Gmail Gửi Đi (Sender) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="VD: bot-waf-alert@gmail.com"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    style={{
                      width: '100%',
                      height: '38px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                    Google App Password (16 ký tự) <span style={{ color: '#ef4444' }}>*</span>
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
                      fontSize: '13px',
                      fontFamily: 'monospace',
                    }}
                  />
                </div>
              </div>

              <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#eff6ff', border: '1px solid #bfdbfe', fontSize: '12px', color: '#1e40af' }}>
                <i className="fa-solid fa-circle-info" style={{ marginRight: '6px' }}></i>
                <strong>Cách tạo App Password:</strong> Mở <code>myaccount.google.com</code> → Bảo mật → Xác minh 2 bước → Mật khẩu ứng dụng (App Passwords) → Tạo mật khẩu 16 chữ cái cho WAF.
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', paddingTop: '10px', flexWrap: 'wrap' }}>
                <button
                  type="submit"
                  disabled={savingEmail}
                  style={{
                    padding: '9px 24px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                  }}
                >
                  <i className={`fa-solid ${savingEmail ? 'fa-spinner fa-spin' : 'fa-floppy-disk'}`}></i>
                  <span>Lưu Cấu Hình Email</span>
                </button>

                <button
                  type="button"
                  onClick={handleTestEmail}
                  disabled={sendingEmailTest}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className={`fa-solid ${sendingEmailTest ? 'fa-spinner fa-spin' : 'fa-envelope'}`}></i>
                  <span>Gửi Email Thử Nghiệm</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendReportNow}
                  disabled={sendingReport}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #fca5a5',
                    background: '#fef2f2',
                    color: '#dc2626',
                    fontSize: '13px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <i className={`fa-solid ${sendingReport ? 'fa-spinner fa-spin' : 'fa-file-pdf'}`}></i>
                  <span>Trích Xuất & Gửi Báo Cáo Ngay</span>
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
