import React, { useState, useEffect } from 'react';

export default function TelegramSettings({ telegramConfig, onSave, onTest }) {
  const [token, setToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

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
    try {
      await onSave({ bot_token: token, chat_id: chatId, enabled });
      setTestResult({ ok: true, msg: 'Đã lưu cấu hình thành công!' });
    } catch (err) {
      setTestResult({ ok: false, msg: String(err.message || err) });
    }
    setSaving(false);
    setTimeout(() => setTestResult(null), 4000);
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      await onTest();
      setTestResult({ ok: true, msg: '✅ Đã gửi tin nhắn test thành công! Kiểm tra Telegram của bạn.' });
    } catch (err) {
      setTestResult({ ok: false, msg: `❌ Lỗi: ${err.message || err}` });
    }
    setTesting(false);
    setTimeout(() => setTestResult(null), 6000);
  };

  const isConfigured = token.trim() !== '' && chatId.trim() !== '';

  return (
    <div className="tab-panel active">
      <div className="panel-card max-w-750">
        <div className="panel-head">
          <div>
            <h4><i className="fa-brands fa-telegram text-blue"></i> Telegram Instant Attack Alerts</h4>
            <p className="text-muted">
              Gửi thông báo tức thời về điện thoại khi WAF phát hiện các cuộc tấn công nguy hiểm.
              Hỗ trợ SQLi, XSS, LFI, RCE và Scanner.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className={`badge-status ${enabled && isConfigured ? 'green' : 'gray'}`}>
              {enabled && isConfigured ? '● Đang hoạt động' : '○ Chưa bật'}
            </span>
          </div>
        </div>

        {/* Connection Status Banner */}
        {testResult && (
          <div style={{
            padding: '10px 14px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontSize: '12.5px',
            fontWeight: 600,
            background: testResult.ok ? '#ecfdf5' : '#fef2f2',
            color: testResult.ok ? '#065f46' : '#991b1b',
            border: `1px solid ${testResult.ok ? '#a7f3d0' : '#fecaca'}`,
          }}>
            {testResult.msg}
          </div>
        )}

        <form className="settings-form-body" onSubmit={handleSubmit}>
          <div className="settings-form-row">
            <div className="settings-label">Bật cảnh báo Telegram:</div>
            <div className="settings-input">
              <label className="switch-green">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span className="slider round"></span>
              </label>
              <span style={{ fontSize: '11px', color: enabled ? '#059669' : '#94a3b8', fontWeight: 600 }}>
                {enabled ? 'BẬT — Gửi cảnh báo khi có tấn công' : 'TẮT — Không gửi cảnh báo'}
              </span>
            </div>
            <div className="settings-desc">
              Tự động gửi tin nhắn HTML đến Telegram khi Coraza WAF phát hiện mã độc
            </div>
          </div>

          <div className="settings-form-row">
            <div className="settings-label">Bot Token:</div>
            <div className="settings-input">
              <input
                type="text"
                className="form-ctrl w-350"
                placeholder="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </div>
            <div className="settings-desc">
              Tạo bot mới bằng <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-blue" style={{ fontWeight: 600 }}>@BotFather</a> trên Telegram
            </div>
          </div>

          <div className="settings-form-row">
            <div className="settings-label">Chat ID / Group ID:</div>
            <div className="settings-input">
              <input
                type="text"
                className="form-ctrl w-350"
                placeholder="987654321 hoặc -100123456789"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
              />
            </div>
            <div className="settings-desc">
              Lấy Chat ID qua <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer" className="text-blue" style={{ fontWeight: 600 }}>@userinfobot</a> hoặc API getUpdates
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #f1f5f9' }}>
            <button type="submit" className="btn-green" disabled={saving}>
              <i className="fa-solid fa-floppy-disk"></i>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={handleTest}
              disabled={testing || !isConfigured}
              title={!isConfigured ? 'Cần nhập Bot Token và Chat ID trước' : 'Gửi tin nhắn test đến Telegram'}
            >
              <i className={`fa-solid ${testing ? 'fa-spinner fa-spin' : 'fa-paper-plane'}`}></i>
              {testing ? 'Đang gửi...' : 'Gửi tin nhắn thử nghiệm'}
            </button>
          </div>
        </form>

        {/* Preview Alert Template */}
        <div style={{ marginTop: '20px', padding: '14px', background: '#0f172a', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <i className="fa-brands fa-telegram" style={{ color: '#3b82f6' }}></i>
            Mẫu tin nhắn cảnh báo (Preview):
          </div>
          <pre style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11.5px',
            color: '#e2e8f0',
            lineHeight: '1.7',
            whiteSpace: 'pre-wrap',
            margin: 0,
          }}>
{`🚨 [CORAZA WAF ALERT] Phát Hiện Tấn Công!

• Loại tấn công: SQL Injection (SQLi)
• IP Nguồn: 203.175.10.230 (🇮🇩 Indonesia)
• Hành động: ⛔ DENY (403 Forbidden)
• Rule ID: 942100
• Rule Msg: SQL Injection Attack Detected
• Method & URI: GET /?id=1 UNION SELECT...
• Thời gian: ${new Date().toISOString().slice(0, 19).replace('T', ' ')}

🛡️ Coraza SPOA WAF đã tự động phát hiện và chặn cuộc tấn công.

[⛔ Chặn IP 203.175.10.230]   [⚪ Whitelist IP]
[📊 Thống kê WAF]            [🔍 Nhật ký gần nhất]`}
          </pre>
        </div>

        {/* 2-Way Interactive Bot Commands Cheat Sheet */}
        <div style={{ marginTop: '20px', padding: '16px', background: '#0b1120', borderRadius: '10px', border: '1px solid #1e293b' }}>
          <div style={{ fontSize: '13px', color: '#38bdf8', fontWeight: 700, marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-robot"></i>
            Tương tác 2 Chiều với Chatbot Telegram (Interactive Commands):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '10px', fontSize: '12px' }}>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/stats</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Báo cáo thống kê lưu lượng, tổng số đợt tấn công đã chặn và Top 3 IP độc hại.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/status</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Kiểm tra tình trạng CPU, RAM, Uptime máy chủ và Coraza SPOA / HAProxy.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/ban &lt;IP&gt; [lý do]</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Chặn vĩnh viễn IP vào Blacklist trực tiếp từ điện thoại chỉ trong 1 giây.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/unban &lt;IP&gt;</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Gỡ bỏ IP khỏi danh sách chặn, khôi phục quyền truy cập.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/whitelist &lt;IP&gt;</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Thêm IP tin cậy vào Whitelist (bỏ qua mọi bộ lọc an ninh WAF).</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/latest</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Hiển thị danh sách 5 sự kiện vi phạm an ninh vừa bị chặn gần nhất.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>/sim &lt;sqli|xss|lfi&gt;</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Bắn đợt tấn công giả lập để kiểm tra chuông báo và thông báo Telegram.</div>
            </div>
            <div style={{ background: '#1e293b', padding: '10px 12px', borderRadius: '8px' }}>
              <code style={{ color: '#ec4899', fontWeight: 700 }}>Nút bấm 1-chạm (Inline)</code>
              <div style={{ color: '#94a3b8', marginTop: '4px' }}>Mỗi khi có thông báo tấn công, chạm ngay nút [⛔ Chặn IP] để khóa IP tức thì.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
