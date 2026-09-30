import React, { useState, useEffect, useRef, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Overview from './pages/Overview';
import AttackMap from './pages/AttackMap';
import WebsiteList from './pages/WebsiteList';
import InterceptionLogs from './pages/InterceptionLogs';
import BlackWhiteList from './pages/BlackWhiteList';
import CustomRules from './pages/CustomRules';
import RecaptchaBot from './pages/RecaptchaBot';
import TelegramSettings from './pages/TelegramSettings';
import Settings from './pages/Settings';
import ErrorBoundary from './components/ErrorBoundary';
import { wafApi, WS_URL } from './api/client';



const playAlertChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch {
    /* Audio may be blocked until user gesture */
  }
};

export default function App() {
  const [activeTab, setActiveTab] = useState('overview');
  const [stats, setStats] = useState({});
  const [logs, setLogs] = useState([]);
  const [liveLogs, setLiveLogs] = useState([]);
  const [ipRules, setIpRules] = useState([]);
  const [rules, setRules] = useState([]);
  const [telegramConfig, setTelegramConfig] = useState({});
  const [attackPins, setAttackPins] = useState([]);
  const [wsConnected, setWsConnected] = useState(false);
  const [liveEnabled, setLiveEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [range, setRange] = useState('30days');
  const [category, setCategory] = useState('ip_rank');
  const [toast, setToast] = useState(null);

  const [showAddIPModal, setShowAddIPModal] = useState(false);
  const [newIP, setNewIP] = useState('');
  const [newIPType, setNewIPType] = useState('blacklist');
  const [newIPReason, setNewIPReason] = useState('');
  const [newIPDuration, setNewIPDuration] = useState('15m');

  const liveEnabledRef = useRef(liveEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    liveEnabledRef.current = liveEnabled;
    soundEnabledRef.current = soundEnabled;
  }, [liveEnabled, soundEnabled]);

  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3200);
  };

  const loadStats = useCallback(async (nextRange = range, nextCat = category) => {
    try {
      setStats(await wafApi.stats(nextRange, nextCat));
    } catch (e) {
      console.error('Failed to load stats:', e);
    }
  }, [range, category]);

  const loadLogs = useCallback(async (ip = '', type = '', q = '') => {
    try {
      const data = await wafApi.logs({ limit: 200, ip, type, q });
      setLogs(data.data || []);
    } catch (e) {
      console.error('Failed to load logs:', e);
    }
  }, []);

  const loadIPRules = useCallback(async () => {
    try {
      setIpRules((await wafApi.ipRules()) || []);
    } catch (e) {
      console.error('Failed to load IP rules:', e);
    }
  }, []);

  const loadRules = useCallback(async () => {
    try {
      setRules((await wafApi.rules()) || []);
    } catch (e) {
      console.error('Failed to load rules:', e);
    }
  }, []);

  const loadTelegram = useCallback(async () => {
    try {
      setTelegramConfig(await wafApi.telegram());
    } catch (e) {
      console.error('Failed to load Telegram config:', e);
    }
  }, []);

  const handleRangeChange = (nextRange, nextCat = category) => {
    setRange(nextRange);
    setCategory(nextCat);
    loadStats(nextRange, nextCat);
  };

  const loadStatsRef = useRef(loadStats);
  useEffect(() => {
    loadStatsRef.current = loadStats;
  }, [loadStats]);

  useEffect(() => {
    loadStats();
    loadLogs();
    loadIPRules();
    loadRules();
    loadTelegram();

    let socket = null;
    let reconnectTimeout = null;

    const connectWS = () => {
      socket = new WebSocket(WS_URL);
      socket.onopen = () => setWsConnected(true);
      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event !== 'new_attack') return;
          const attackData = msg.data || {};
          const enriched = {
            ...attackData,
            // GeoIP data is now provided by the backend
            country: attackData.country || 'Unknown',
            flag: attackData.flag || '🌐',
            lat: attackData.lat || 10.8231,
            lng: attackData.lng || 106.6297,
          };

          if (soundEnabledRef.current) playAlertChime();
          if (!liveEnabledRef.current) return;

          const isDup = (item) =>
            (enriched.id && item.id === enriched.id) || (enriched.txn_id && item.txn_id === enriched.txn_id);

          setLiveLogs((prev) => (prev.some(isDup) ? prev : [enriched, ...prev.slice(0, 49)]));
          setLogs((prev) => (prev.some(isDup) ? prev : [enriched, ...prev]));
          setAttackPins((prev) => [...prev.slice(-20), enriched]);
          loadStatsRef.current();
        } catch (err) {
          console.error('WS parse error:', err);
        }
      };
      socket.onclose = () => {
        setWsConnected(false);
        reconnectTimeout = setTimeout(connectWS, 3000);
      };
      socket.onerror = () => setWsConnected(false);
    };

    connectWS();
    const poll = setInterval(() => loadStatsRef.current(), 20000);

    return () => {
      if (socket) socket.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSimulateAttack = async (type = 'sqli') => {
    try {
      await wafApi.simulate(type);
      if (soundEnabled) playAlertChime();
      showToast(`Đã mô phỏng ${String(type).toUpperCase()} — Coraza chặn 403`);
      loadStats();
      loadLogs();
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

const isValidIPOrCIDR = (val) => {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/(12[0-8]|1[0-1][0-9]|[1-9]?[0-9]))?$/;
  return ipv4Regex.test(s) || ipv6Regex.test(s) || s === '::1';
};

  const handleDirectAddBlacklist = async (ip, reason = 'Blocked from Dashboard', duration = '15m') => {
    if (!ip) return;
    const trimmed = ip.trim();
    if (!isValidIPOrCIDR(trimmed)) {
      showToast(`Địa chỉ IP không hợp lệ: "${trimmed}"`, 'err');
      return;
    }
    try {
      await wafApi.addIpRule({ ip: trimmed, rule_type: 'blacklist', reason, duration: duration || '15m' });
      showToast(`Đã đưa ${trimmed} vào Blacklist (${duration || '15m'})`);
      loadIPRules();
      loadStats();
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const handleDirectAddWhitelist = async (ip, reason = 'Whitelisted from Dashboard') => {
    if (!ip) return;
    const trimmed = ip.trim();
    if (!isValidIPOrCIDR(trimmed)) {
      showToast(`Địa chỉ IP không hợp lệ: "${trimmed}"`, 'err');
      return;
    }
    try {
      await wafApi.addIpRule({ ip: trimmed, rule_type: 'whitelist', reason, duration: 'permanent' });
      showToast(`Đã thêm ${trimmed} vào Whitelist (Miễn trừ kiểm tra WAF)`);
      loadIPRules();
      loadStats();
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const handleSaveTelegram = async (cfg) => {
    try {
      await wafApi.saveTelegram(cfg);
      showToast('Đã lưu cấu hình Telegram');
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const handleTestTelegram = async () => {
    try {
      const data = await wafApi.testTelegram();
      showToast(data.message || 'Đã gửi tin test');
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const handleSaveIPRule = async () => {
    const trimmedIP = newIP.trim();
    if (!trimmedIP) {
      showToast('Vui lòng nhập địa chỉ IP hoặc dải mạng CIDR', 'err');
      return;
    }
    if (!isValidIPOrCIDR(trimmedIP)) {
      showToast('Định dạng IP/CIDR không hợp lệ! Ví dụ đúng: 192.168.1.1 hoặc 192.168.1.0/24', 'err');
      return;
    }
    try {
      await wafApi.addIpRule({
        ip: trimmedIP,
        rule_type: newIPType,
        reason: newIPReason.trim() || (newIPType === 'blacklist' ? 'Thủ công từ Dashboard' : 'Whitelist tin cậy'),
        duration: newIPType === 'blacklist' ? newIPDuration : 'permanent',
      });
      setShowAddIPModal(false);
      setNewIP('');
      setNewIPReason('');
      setNewIPDuration('15m');
      loadIPRules();
      loadStats();
      showToast(
        newIPType === 'blacklist'
          ? `Đã thêm ${trimmedIP} vào Blacklist (Cấm ${newIPDuration === 'permanent' ? 'vĩnh viễn' : newIPDuration})`
          : `Đã thêm ${trimmedIP} vào Whitelist (Miễn trừ kiểm tra WAF)`
      );
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const handleDeleteIPRule = async (id) => {
    if (!window.confirm('Xác nhận xóa quy tắc IP này?')) return;
    try {
      await wafApi.deleteIpRule(id);
      loadIPRules();
      loadStats();
      showToast('Đã xóa quy tắc IP');
    } catch (e) {
      console.error(e);
      showToast(String(e.message || e), 'err');
    }
  };

  const handleQuickExtendIP = async (ip, extraDuration = '15m') => {
    try {
      await wafApi.addIpRule({
        ip,
        rule_type: 'blacklist',
        duration: extraDuration,
        reason: 'Gia hạn cấm qua Quick Action',
      });
      loadIPRules();
      showToast(`Đã gia hạn cấm ${ip} thêm ${extraDuration}`);
    } catch (e) {
      showToast(String(e.message || e), 'err');
    }
  };

  const pageTitles = {
    overview: 'Range Overview · SOC Command Center',
    map: 'Global Attack Origin Map',
    website: 'Protected Virtual Hosts',
    logs: 'Interception Logs · Threat Forensics',
    'ip-control': 'IP Access Control',
    rules: 'OWASP CRS & Custom Rules',
    bot: 'Anti-Bot Challenge',
    telegram: 'Telegram Alert Dispatcher',
    settings: 'Engine Settings',
  };

  return (
    <div className="aawaf-layout">
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalBlocked={stats.total_attacks || logs.length}
      />

      <main className="aawaf-main">
        <Header
          title={pageTitles[activeTab] || 'Overview'}
          stats={stats}
          wsConnected={wsConnected}
          onRefresh={() => {
            loadStats();
            loadLogs();
            loadIPRules();
          }}
          onSimulateAttack={handleSimulateAttack}
        />

        <div className="aawaf-content">
          <ErrorBoundary key={activeTab}>
          {activeTab === 'overview' && (
            <Overview
              stats={stats}
              liveLogs={liveLogs}
              attackPins={attackPins}
              timeFilter={range}
              onTimeFilterChange={(nextRange, cat) => handleRangeChange(nextRange, cat || category)}
              onCategoryFilterChange={(nextRange, cat) => handleRangeChange(nextRange || range, cat)}
              onSimulateAttack={handleSimulateAttack}
              onAddBlacklist={handleDirectAddBlacklist}
              onRefresh={() => loadStats()}
            />
          )}

          {activeTab === 'map' && (
            <AttackMap attackPins={attackPins} onSimulateAttack={handleSimulateAttack} />
          )}

          {activeTab === 'website' && <WebsiteList stats={stats} />}

          {activeTab === 'logs' && (
            <InterceptionLogs
              logs={logs}
              stats={stats}
              onFilter={loadLogs}
              onRefresh={() => loadLogs()}
              onAddBlacklist={handleDirectAddBlacklist}
              onAddWhitelist={handleDirectAddWhitelist}
              liveEnabled={liveEnabled}
              setLiveEnabled={setLiveEnabled}
              soundEnabled={soundEnabled}
              setSoundEnabled={setSoundEnabled}
              wsConnected={wsConnected}
            />
          )}

          {activeTab === 'ip-control' && (
            <BlackWhiteList
              ipRules={ipRules}
              onOpenAddModal={() => setShowAddIPModal(true)}
              onDeleteRule={handleDeleteIPRule}
              onQuickExtend={handleQuickExtendIP}
              onAddBlacklist={handleDirectAddBlacklist}
              onAddWhitelist={handleDirectAddWhitelist}
            />
          )}

          {activeTab === 'rules' && <CustomRules rules={rules} />}
          {activeTab === 'bot' && <RecaptchaBot />}
          {activeTab === 'telegram' && (
            <TelegramSettings
              telegramConfig={telegramConfig}
              onSave={handleSaveTelegram}
              onTest={handleTestTelegram}
            />
          )}
          {activeTab === 'settings' && <Settings />}
          </ErrorBoundary>
        </div>
      </main>

      {toast && (
        <div className={`app-toast ${toast.kind === 'err' ? 'err' : 'ok'}`}>
          {toast.message}
        </div>
      )}

      {showAddIPModal && (
        <div className="modal-overlay" onClick={() => setShowAddIPModal(false)}>
          <div className="modal-dialog" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">
                <i className="fa-solid fa-shield-halved" style={{ color: '#10b981' }}></i>
                <span>Add IP Access Rule</span>
              </div>
              <button className="modal-close-btn" onClick={() => setShowAddIPModal(false)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label-caps">IP Address</label>
                <input
                  type="text"
                  className="form-ctrl"
                  style={{ width: '100%' }}
                  placeholder="e.g. 192.168.1.100"
                  value={newIP}
                  onChange={(e) => setNewIP(e.target.value)}
                />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label className="form-label-caps">Rule Type</label>
                <select className="form-ctrl" style={{ width: '100%' }} value={newIPType} onChange={(e) => setNewIPType(e.target.value)}>
                  <option value="blacklist">Blacklist (403 Forbidden)</option>
                  <option value="whitelist">Whitelist (Bypass inspection)</option>
                </select>
              </div>

              {newIPType === 'blacklist' && (
                <div style={{ marginBottom: '14px' }}>
                  <label className="form-label-caps">
                    <i className="fa-solid fa-stopwatch" style={{ color: '#ec4899', marginRight: '6px' }}></i>
                    Thời hạn cấm (Duration / Countdown)
                  </label>
                  <select
                    className="form-ctrl"
                    style={{ width: '100%' }}
                    value={newIPDuration}
                    onChange={(e) => setNewIPDuration(e.target.value)}
                  >
                    <option value="15m">⏳ 15 phút (Khuyên dùng để tránh False Positive)</option>
                    <option value="30m">⏳ 30 phút</option>
                    <option value="1h">⏳ 1 giờ</option>
                    <option value="6h">⏳ 6 giờ</option>
                    <option value="24h">⏳ 24 giờ (1 ngày)</option>
                    <option value="7d">⏳ 7 ngày</option>
                    <option value="permanent">🔒 Vô thời hạn (Cấm vĩnh viễn)</option>
                  </select>
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    Hết thời gian đếm ngược, hệ thống WAF sẽ tự động mở khóa và phục hồi quyền truy cập.
                  </small>
                </div>
              )}
              <div style={{ marginBottom: '18px' }}>
                <label className="form-label-caps">Reason</label>
                <input
                  type="text"
                  className="form-ctrl"
                  style={{ width: '100%' }}
                  placeholder="Ghi chú"
                  value={newIPReason}
                  onChange={(e) => setNewIPReason(e.target.value)}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <button className="btn-outline" onClick={() => setShowAddIPModal(false)}>Cancel</button>
                <button className="btn-green" onClick={handleSaveIPRule}>
                  <i className="fa-solid fa-check"></i> Save IP Rule
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
