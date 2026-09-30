import React, { useState, useMemo, useEffect } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend
);

// Geographic IP resolver helper
const getGeoInfo = (ip = '', log = {}) => {
  if (log.flag || log.country) {
    return {
      flag: log.flag || '🌐',
      country: log.country || 'Unknown',
      city: log.city || '',
      code: log.country || '',
    };
  }
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return { flag: '🏠', country: 'Localhost', city: 'Loopback', code: 'LOCAL' };
  }
  if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.16.') || ip.startsWith('172.18.')) {
    return { flag: '🇻🇳', country: 'Vietnam (LAN)', city: 'Local Network', code: 'VN' };
  }
  if (ip.startsWith('203.')) {
    return { flag: '🇮🇩', country: 'Indonesia', city: 'Jakarta', code: 'ID' };
  }
  if (ip.startsWith('5.') || ip.startsWith('34.') || ip.startsWith('45.')) {
    return { flag: '🇺🇸', country: 'United States', city: 'San Jose', code: 'US' };
  }
  if (ip.startsWith('144.')) {
    return { flag: '🇨🇷', country: 'Costa Rica', city: 'San Jose', code: 'CR' };
  }
  if (ip.startsWith('114.')) {
    return { flag: '🇸🇬', country: 'Singapore', city: 'Singapore', code: 'SG' };
  }
  if (ip.startsWith('79.')) {
    return { flag: '🇮🇷', country: 'Iran', city: 'Tehran', code: 'IR' };
  }
  if (ip.startsWith('13.')) {
    return { flag: '🇯🇵', country: 'Japan', city: 'Tokyo', code: 'JP' };
  }
  return { flag: '🇻🇳', country: 'Vietnam', city: 'Ho Chi Minh City', code: 'VN' };
};

// User-Agent parser helper for forensic fingerprinting
const parseUserAgent = (ua = '') => {
  let browser = { name: 'Unknown Client', icon: 'fa-solid fa-globe' };
  let os = { name: 'Unknown OS', icon: 'fa-solid fa-laptop-code' };

  if (/curl/i.test(ua)) browser = { name: 'cURL Command Tool', icon: 'fa-solid fa-terminal' };
  else if (/python/i.test(ua)) browser = { name: 'Python Automation', icon: 'fa-brands fa-python' };
  else if (/sqlmap/i.test(ua)) browser = { name: 'SQLMap Scanner', icon: 'fa-solid fa-biohazard' };
  else if (/nikto|nmap|acunetix|nessus/i.test(ua)) browser = { name: 'Security Scanner', icon: 'fa-solid fa-radar' };
  else if (/chrome/i.test(ua) && !/edg/i.test(ua)) browser = { name: 'Google Chrome', icon: 'fa-brands fa-chrome' };
  else if (/firefox/i.test(ua)) browser = { name: 'Mozilla Firefox', icon: 'fa-brands fa-firefox' };
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = { name: 'Apple Safari', icon: 'fa-brands fa-safari' };
  else if (/edg/i.test(ua)) browser = { name: 'Microsoft Edge', icon: 'fa-brands fa-edge' };

  if (/linux/i.test(ua)) os = { name: 'Linux OS', icon: 'fa-brands fa-linux' };
  else if (/windows/i.test(ua)) os = { name: 'Windows OS', icon: 'fa-brands fa-windows' };
  else if (/macintosh|mac os/i.test(ua)) os = { name: 'macOS', icon: 'fa-brands fa-apple' };
  else if (/android/i.test(ua)) os = { name: 'Android OS', icon: 'fa-brands fa-android' };
  else if (/iphone|ipad/i.test(ua)) os = { name: 'iOS Device', icon: 'fa-brands fa-apple' };

  return { browser, os };
};

// Threat Severity and Risk Scoring Engine
const getSeverity = (attackType = '', ruleId = '') => {
  const t = (attackType || '').toLowerCase();
  const r = String(ruleId || '');
  if (t.includes('sql') || t.includes('rce') || t.includes('execution') || r.startsWith('942') || r.startsWith('932')) {
    return {
      level: 'CRITICAL',
      label: 'CRIT',
      color: '#ef4444',
      bg: 'rgba(239, 68, 68, 0.15)',
      border: 'rgba(239, 68, 68, 0.35)',
      icon: 'fa-solid fa-skull-crossbones',
      score: 95,
      dotColor: '#ef4444'
    };
  }
  if (t.includes('xss') || t.includes('traversal') || t.includes('lfi') || r.startsWith('941') || r.startsWith('930')) {
    return {
      level: 'HIGH',
      label: 'HIGH',
      color: '#f97316',
      bg: 'rgba(249, 115, 22, 0.15)',
      border: 'rgba(249, 115, 22, 0.35)',
      icon: 'fa-solid fa-triangle-exclamation',
      score: 75,
      dotColor: '#f97316'
    };
  }
  if (t.includes('scanner') || t.includes('probe') || t.includes('bot') || r.startsWith('913')) {
    return {
      level: 'MEDIUM',
      label: 'MED',
      color: '#eab308',
      bg: 'rgba(234, 179, 8, 0.15)',
      border: 'rgba(234, 179, 8, 0.35)',
      icon: 'fa-solid fa-shield-halved',
      score: 50,
      dotColor: '#eab308'
    };
  }
  return {
    level: 'LOW',
    label: 'LOW',
    color: '#38bdf8',
    bg: 'rgba(56, 189, 248, 0.15)',
    border: 'rgba(56, 189, 248, 0.35)',
    icon: 'fa-solid fa-circle-info',
    score: 25,
    dotColor: '#38bdf8'
  };
};

export default function InterceptionLogs({
  logs = [],
  stats = {},
  onFilter,
  onRefresh,
  onAddBlacklist,
  onAddWhitelist,
  liveEnabled = true,
  setLiveEnabled,
  soundEnabled = false,
  setSoundEnabled,
  wsConnected = false,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('all'); // 'all', 'today', 'yesterday', '7days'

  // Stream Freeze / Pause state
  const [streamPaused, setStreamPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState([]);

  // Modal & Detail states
  const [selectedLogModal, setSelectedLogModal] = useState(null);
  const [activeModalTab, setActiveModalTab] = useState('overview');
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [copiedIP, setCopiedIP] = useState(null);

  // Quick Ban Dropdown state per row: { ip: string, open: boolean }
  const [activeBanDropdown, setActiveBanDropdown] = useState(null);

  // Multi-select Batch state
  const [selectedLogIds, setSelectedLogIds] = useState(new Set());

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15); // 15, 30, 50, 100

  // Accurate timestamp formatter
  const formatTimestamp = (ts) => {
    if (!ts) return { full: 'N/A', relative: '' };
    try {
      let d;
      if (ts.endsWith('Z')) {
        d = new Date(ts);
      } else if (ts.includes('T')) {
        d = new Date(ts.endsWith('Z') ? ts : ts + 'Z');
      } else {
        const clean = ts.replace(/\//g, '-');
        d = new Date(clean + 'Z');
      }

      if (isNaN(d.getTime())) {
        d = new Date(ts);
      }

      const now = new Date();
      const diffMs = Math.max(0, now.getTime() - d.getTime());
      const diffSec = Math.floor(diffMs / 1000);

      let rel = 'Vừa xong';
      if (diffSec >= 60 && diffSec < 3600) {
        rel = `${Math.floor(diffSec / 60)}p trước`;
      } else if (diffSec >= 3600 && diffSec < 86400) {
        rel = `${Math.floor(diffSec / 3600)}h trước`;
      } else if (diffSec >= 86400) {
        rel = `${Math.floor(diffSec / 86400)}d trước`;
      }

      const pad = (n) => String(n).padStart(2, '0');
      const year = d.getFullYear();
      const month = pad(d.getMonth() + 1);
      const day = pad(d.getDate());
      const hours = pad(d.getHours());
      const mins = pad(d.getMinutes());
      const secs = pad(d.getSeconds());

      const fullFormatted = `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
      return { full: fullFormatted, relative: rel };
    } catch (e) {
      return { full: ts, relative: 'Gần đây' };
    }
  };

  // Safe URI decoder
  const safeDecodeURI = (uri = '') => {
    try {
      return decodeURIComponent(uri);
    } catch (e) {
      return uri;
    }
  };

  // Handle stream pause/resume
  const handleToggleStreamPause = () => {
    if (!streamPaused) {
      setFrozenLogs([...logs]);
      setStreamPaused(true);
    } else {
      setStreamPaused(false);
      setFrozenLogs([]);
    }
  };

  // Source list: If paused, use snapshot
  const activeSourceLogs = streamPaused && frozenLogs.length > 0 ? frozenLogs : logs;

  // Deduplicate and filter logs
  const filteredLogs = useMemo(() => {
    const seen = new Set();
    const uniqueLogs = [];
    activeSourceLogs.forEach((log) => {
      const key = log.id ? `id-${log.id}` : `txn-${log.txn_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueLogs.push(log);
      }
    });

    uniqueLogs.sort((a, b) => (b.id || 0) - (a.id || 0));

    return uniqueLogs.filter((log) => {
      // Time filter
      if (timeFilter !== 'all') {
        const logDate = new Date(log.timestamp);
        const now = new Date();
        const diffHours = (now - logDate) / (1000 * 60 * 60);

        if (timeFilter === 'today' && diffHours > 24) return false;
        if (timeFilter === 'yesterday' && (diffHours <= 24 || diffHours > 48)) return false;
        if (timeFilter === '7days' && diffHours > 168) return false;
      }

      // Attack Type filter
      if (typeFilter && !log.attack_type?.toLowerCase().includes(typeFilter.toLowerCase())) {
        return false;
      }

      // Method filter
      if (methodFilter && log.method?.toUpperCase() !== methodFilter.toUpperCase()) {
        return false;
      }

      // Severity filter
      if (severityFilter) {
        const sev = getSeverity(log.attack_type, log.rule_id);
        if (sev.level !== severityFilter) return false;
      }

      // Live search query
      if (searchQuery.trim() !== '') {
        const q = searchQuery.toLowerCase();
        const ip = (log.client_ip || '').toLowerCase();
        const uri = (log.uri || '').toLowerCase();
        const decodedUri = safeDecodeURI(log.uri).toLowerCase();
        const ua = (log.user_agent || '').toLowerCase();
        const type = (log.attack_type || '').toLowerCase();
        const ruleMsg = (log.rule_msg || '').toLowerCase();
        const ruleId = String(log.rule_id || '');
        const payload = (log.raw_payload || '').toLowerCase();

        return (
          ip.includes(q) ||
          uri.includes(q) ||
          decodedUri.includes(q) ||
          ua.includes(q) ||
          type.includes(q) ||
          ruleMsg.includes(q) ||
          ruleId.includes(q) ||
          payload.includes(q)
        );
      }
      return true;
    });
  }, [activeSourceLogs, searchQuery, typeFilter, methodFilter, severityFilter, timeFilter]);

  // Distribution of attack types for Chart
  const attackCounts = useMemo(() => {
    const counts = {
      'SQLi': 0,
      'XSS': 0,
      'LFI / Path': 0,
      'RCE': 0,
      'Scanner': 0,
      'CC / Bot': 0,
    };

    filteredLogs.forEach((l) => {
      const t = l.attack_type || '';
      if (t.includes('SQL')) counts['SQLi']++;
      else if (t.includes('XSS')) counts['XSS']++;
      else if (t.includes('Traversal') || t.includes('LFI')) counts['LFI / Path']++;
      else if (t.includes('RCE') || t.includes('Execution')) counts['RCE']++;
      else if (t.includes('Scanner')) counts['Scanner']++;
      else counts['CC / Bot']++;
    });

    return counts;
  }, [filteredLogs]);

  // Doughnut Chart Data
  const donutData = {
    labels: Object.keys(attackCounts),
    datasets: [
      {
        data: Object.values(attackCounts),
        backgroundColor: ['#ef4444', '#a855f7', '#f97316', '#ec4899', '#38bdf8', '#eab308'],
        borderWidth: 2,
        borderColor: '#0f172a',
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: { boxWidth: 8, font: { size: 10 }, padding: 6, color: '#94a3b8' },
      },
    },
    cutout: '72%',
  };

  // Hourly timeline activity
  const hourlyActivity = useMemo(() => {
    const hours = ['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00', 'Now'];
    const counts = [0, 0, 0, 0, 0, 0, 0, 0, 0];

    filteredLogs.forEach((l) => {
      if (l.timestamp && l.timestamp.length >= 13) {
        const hour = parseInt(l.timestamp.slice(11, 13), 10);
        const idx = Math.min(Math.floor(hour / 3), 8);
        counts[idx]++;
      } else {
        counts[8]++;
      }
    });

    return { hours, counts };
  }, [filteredLogs]);

  const barData = {
    labels: hourlyActivity.hours,
    datasets: [
      {
        label: 'Threats Blocked',
        data: hourlyActivity.counts,
        backgroundColor: 'rgba(16, 185, 129, 0.85)',
        borderRadius: 4,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 9 } } },
      y: { grid: { color: 'rgba(51, 65, 85, 0.4)' }, ticks: { color: '#64748b', font: { size: 9 }, precision: 0 }, beginAtZero: true },
    },
  };

  // Pagination calculation
  const totalRecords = filteredLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + pageSize);

  // Multi-select handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const allIds = new Set(paginatedLogs.map((l) => l.id || l.txn_id));
      setSelectedLogIds(allIds);
    } else {
      setSelectedLogIds(new Set());
    }
  };

  const handleSelectRow = (id) => {
    const next = new Set(selectedLogIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedLogIds(next);
  };

  // Batch Ban Action
  const handleBatchBan = (duration = '15m') => {
    if (selectedLogIds.size === 0 || !onAddBlacklist) return;
    const selectedIps = Array.from(
      new Set(
        paginatedLogs
          .filter((l) => selectedLogIds.has(l.id || l.txn_id))
          .map((l) => l.client_ip)
      )
    );

    selectedIps.forEach((ip) => {
      onAddBlacklist(ip, `Batch Block (${selectedLogIds.size} threats)`, duration);
    });
    setSelectedLogIds(new Set());
  };

  // Batch Whitelist Action
  const handleBatchWhitelist = () => {
    if (selectedLogIds.size === 0 || !onAddWhitelist) return;
    const selectedIps = Array.from(
      new Set(
        paginatedLogs
          .filter((l) => selectedLogIds.has(l.id || l.txn_id))
          .map((l) => l.client_ip)
      )
    );

    selectedIps.forEach((ip) => {
      onAddWhitelist(ip, 'Batch Whitelist from Dashboard');
    });
    setSelectedLogIds(new Set());
  };

  // Export handlers
  const handleExportCSV = () => {
    const headers = ['ID', 'Timestamp', 'Client IP', 'Country', 'Method', 'URI', 'Attack Type', 'Rule ID', 'Severity', 'Status'];
    const rows = filteredLogs.map((l) => {
      const geo = getGeoInfo(l.client_ip, l);
      const sev = getSeverity(l.attack_type, l.rule_id);
      return [
        l.id,
        `"${l.timestamp}"`,
        `"${l.client_ip}"`,
        `"${geo.country}"`,
        l.method,
        `"${(l.uri || '').replace(/"/g, '""')}"`,
        `"${l.attack_type}"`,
        l.rule_id,
        sev.level,
        '403 Forbidden',
      ];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.href = encodeURI(csvContent);
    link.download = `coraza_waf_interceptions_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  };

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(filteredLogs, null, 2));
    const link = document.createElement('a');
    link.href = dataStr;
    link.download = `coraza_waf_interceptions_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
  };

  const copyCurlRepro = (log) => {
    const host = window.location.hostname || '192.168.246.100';
    const curlCmd = `curl -i -X ${log.method || 'GET'} "http://${host}${log.uri}" -A "${log.user_agent || 'Mozilla/5.0'}"`;
    navigator.clipboard.writeText(curlCmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const handleCopyIP = (ip) => {
    navigator.clipboard.writeText(ip);
    setCopiedIP(ip);
    setTimeout(() => setCopiedIP(null), 1800);
  };

  return (
    <div className="tab-panel active" style={{ animation: 'fadeInPanel 0.25s ease' }}>
      {/* 1. TOP ENTERPRISE SOC HERO BAR */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0b1329 0%, #0f172a 60%, #11293a 100%)',
          border: '1px solid #1e293b',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '16px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          boxShadow: '0 4px 20px -2px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#f87171',
              fontSize: '18px',
            }}
          >
            <i className="fa-solid fa-shield-virus"></i>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                Cyber Forensics & Interception Feed
              </h3>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa-solid fa-shield-halved"></i> CRS v4.9
              </span>
            </div>
            <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              Luồng giám sát & phân tích sự cố bảo mật theo thời gian thực từ Coraza SPOA WAF Engine.
            </p>
          </div>
        </div>

        {/* Real-time Status Badges & Action Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Stream Pause/Resume Toggle */}
          <button
            type="button"
            onClick={handleToggleStreamPause}
            title={streamPaused ? 'Tiếp tục nhận luồng trực tiếp' : 'Tạm dừng luồng để phân tích sự cố'}
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              border: streamPaused ? '1px solid #f59e0b' : '1px solid rgba(16, 185, 129, 0.4)',
              background: streamPaused ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: streamPaused ? '#fbbf24' : '#34d399',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 0.15s',
            }}
          >
            <i className={`fa-solid ${streamPaused ? 'fa-play' : 'fa-pause'}`}></i>
            <span>{streamPaused ? 'Stream Đã Dừng' : 'Live Stream'}</span>
          </button>

          {/* Sound Alert Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled && setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? 'Âm thanh cảnh báo: BẬT' : 'Âm thanh cảnh báo: TẮT'}
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: soundEnabled ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
              color: soundEnabled ? '#10b981' : '#64748b',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className={`fa-solid ${soundEnabled ? 'fa-volume-high' : 'fa-volume-xmark'}`}></i>
          </button>

          {/* Export Dropdown / Buttons */}
          <button
            type="button"
            onClick={handleExportCSV}
            title="Xuất file CSV báo cáo"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#34d399',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="fa-solid fa-file-csv"></i>
          </button>

          <button
            type="button"
            onClick={handleExportJSON}
            title="Xuất file JSON thô"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#38bdf8',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="fa-solid fa-file-code"></i>
          </button>

          {/* Reload / Refresh Button */}
          <button
            type="button"
            onClick={onRefresh}
            title="Tải lại toàn bộ dữ liệu"
            style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              border: '1px solid #334155',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#94a3b8',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <i className="fa-solid fa-rotate"></i>
          </button>
        </div>
      </div>

      {/* 2. TOP METRICS STRIP (4 Mini SOC KPI Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f87171', fontSize: '18px' }}>
            <i className="fa-solid fa-shield-virus"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Tổng Số Chặn (403)</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
              {stats.total_attacks || filteredLogs.length} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>lần</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(249, 115, 22, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fb923c', fontSize: '18px' }}>
            <i className="fa-solid fa-fire-flame-curved"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Mối Đe Dọa Hôm Nay</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#fb923c', marginTop: '2px' }}>
              {stats.malicious_requests_today || stats.attacks_today || 0} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>vụ</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(56, 189, 248, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8', fontSize: '18px' }}>
            <i className="fa-solid fa-network-wired"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>IP Nguồn Độc Hại</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {new Set(logs.map((l) => l.client_ip)).size || 1} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>độc lập</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#34d399', fontSize: '18px' }}>
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Tỷ Lệ Chặn Thành Công</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>
              100% <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>Active</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. CHARTS ROW: Attack Vectors Donut + Hourly Threat Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-chart-pie" style={{ color: '#10b981' }}></i>
              Phân Loại Vector Tấn Công
            </span>
            <span style={{ fontSize: '10.5px', background: 'rgba(16, 185, 129, 0.1)', color: '#34d399', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              Live SQLite
            </span>
          </div>
          <div style={{ height: '140px' }}>
            <Doughnut data={donutData} options={donutOptions} />
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, color: '#e2e8f0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <i className="fa-solid fa-chart-column" style={{ color: '#38bdf8' }}></i>
              Tần Suất Chặn Theo Giờ
            </span>
            <span style={{ fontSize: '10.5px', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', padding: '2px 8px', borderRadius: '10px', fontWeight: 600 }}>
              24 Giờ
            </span>
          </div>
          <div style={{ height: '140px' }}>
            <Bar data={barData} options={barOptions} />
          </div>
        </div>
      </div>

      {/* 4. MAIN SOC DATA PANEL: TOOLBAR + TABLE */}
      <div className="panel-card" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px 20px' }}>
        {/* Modern Filter Toolbar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', paddingBottom: '14px', borderBottom: '1px solid #1e293b' }}>
          {/* Time range icon buttons */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            <button
              type="button"
              className="btn-sm"
              title="Toàn bộ thời gian"
              onClick={() => { setTimeFilter('all'); setCurrentPage(1); }}
              style={{
                background: timeFilter === 'all' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                color: timeFilter === 'all' ? '#34d399' : '#94a3b8',
                border: timeFilter === 'all' ? '1px solid #10b981' : '1px solid #334155',
                padding: '4px 9px',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-globe"></i> Tất cả
            </button>

            <button
              type="button"
              className="btn-sm"
              title="Trong 24 giờ qua"
              onClick={() => { setTimeFilter('today'); setCurrentPage(1); }}
              style={{
                background: timeFilter === 'today' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                color: timeFilter === 'today' ? '#34d399' : '#94a3b8',
                border: timeFilter === 'today' ? '1px solid #10b981' : '1px solid #334155',
                padding: '4px 9px',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-calendar-day"></i> Hôm nay
            </button>

            <button
              type="button"
              className="btn-sm"
              title="Hôm qua"
              onClick={() => { setTimeFilter('yesterday'); setCurrentPage(1); }}
              style={{
                background: timeFilter === 'yesterday' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                color: timeFilter === 'yesterday' ? '#34d399' : '#94a3b8',
                border: timeFilter === 'yesterday' ? '1px solid #10b981' : '1px solid #334155',
                padding: '4px 9px',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-clock-rotate-left"></i> Hôm qua
            </button>

            <button
              type="button"
              className="btn-sm"
              title="7 ngày gần nhất"
              onClick={() => { setTimeFilter('7days'); setCurrentPage(1); }}
              style={{
                background: timeFilter === '7days' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.6)',
                color: timeFilter === '7days' ? '#34d399' : '#94a3b8',
                border: timeFilter === '7days' ? '1px solid #10b981' : '1px solid #334155',
                padding: '4px 9px',
                fontSize: '11px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              <i className="fa-solid fa-calendar-week"></i> 7 ngày
            </button>
          </div>

          {/* Search Box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '220px', maxWidth: '340px' }}>
            <i
              className="fa-solid fa-magnifying-glass"
              style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '11px' }}
            ></i>
            <input
              type="text"
              placeholder="Tìm IP, URI, Rule ID, Payload..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              style={{
                width: '100%',
                paddingLeft: '30px',
                paddingRight: '26px',
                height: '32px',
                borderRadius: '6px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#f8fafc',
                fontSize: '11.5px',
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '2px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            )}
          </div>

          {/* Quick Selectors (Attack Type, Severity, Method, PageSize) */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setCurrentPage(1); }}
              style={{ height: '32px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px', padding: '0 8px' }}
            >
              <option value="">🎯 Tất cả Vector</option>
              <option value="SQL Injection">💉 SQL Injection (SQLi)</option>
              <option value="Cross-Site Scripting">⚡ Cross-Site Scripting (XSS)</option>
              <option value="Path Traversal">📁 Path Traversal (LFI)</option>
              <option value="Remote Code">⚙️ Remote Code (RCE)</option>
              <option value="Scanner">🤖 Scanner / Probing</option>
              <option value="Bot">🕷️ Botnet / CC</option>
            </select>

            <select
              value={severityFilter}
              onChange={(e) => { setSeverityFilter(e.target.value); setCurrentPage(1); }}
              style={{ height: '32px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px', padding: '0 8px' }}
            >
              <option value="">⚠️ Mức Nguy Hiểm</option>
              <option value="CRITICAL">🔴 Critical (Khẩn cấp)</option>
              <option value="HIGH">🟠 High (Cao)</option>
              <option value="MEDIUM">🟡 Medium (Trung bình)</option>
              <option value="LOW">🔵 Low (Thấp)</option>
            </select>

            <select
              value={methodFilter}
              onChange={(e) => { setMethodFilter(e.target.value); setCurrentPage(1); }}
              style={{ height: '32px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px', padding: '0 8px' }}
            >
              <option value="">Method</option>
              <option value="GET">GET</option>
              <option value="POST">POST</option>
              <option value="PUT">PUT</option>
              <option value="DELETE">DELETE</option>
            </select>

            <select
              value={pageSize}
              onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              style={{ height: '32px', background: '#1e293b', color: '#cbd5e1', border: '1px solid #334155', borderRadius: '6px', fontSize: '11px', padding: '0 6px' }}
            >
              <option value={15}>15 dòng</option>
              <option value={30}>30 dòng</option>
              <option value={50}>50 dòng</option>
              <option value={100}>100 dòng</option>
            </select>

            {(searchQuery || typeFilter || methodFilter || severityFilter || timeFilter !== 'all') && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setTypeFilter('');
                  setMethodFilter('');
                  setSeverityFilter('');
                  setTimeFilter('all');
                  setCurrentPage(1);
                }}
                title="Đặt lại toàn bộ bộ lọc"
                style={{
                  height: '32px',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '6px',
                  padding: '0 10px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <i className="fa-solid fa-filter-circle-xmark"></i> Xóa lọc
              </button>
            )}
          </div>
        </div>

        {/* Floating Batch Action Bar when rows are selected */}
        {selectedLogIds.size > 0 && (
          <div
            style={{
              background: 'linear-gradient(90deg, #1e293b 0%, #0f172a 100%)',
              border: '1px solid #38bdf8',
              borderRadius: '8px',
              padding: '8px 14px',
              marginTop: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              flexWrap: 'wrap',
              animation: 'fadeInPanel 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  background: '#38bdf8',
                  color: '#0f172a',
                  fontWeight: 800,
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                }}
              >
                {selectedLogIds.size}
              </span>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#f8fafc' }}>
                Bản ghi được chọn thao tác hàng loạt
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <button
                type="button"
                onClick={() => handleBatchBan('15m')}
                title="Chặn tạm thời 15 phút (Khuyên dùng)"
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid rgba(245, 158, 11, 0.4)',
                  background: 'rgba(245, 158, 11, 0.15)',
                  color: '#fbbf24',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fa-solid fa-stopwatch"></i> Chặn 15m
              </button>

              <button
                type="button"
                onClick={() => handleBatchBan('permanent')}
                title="Chặn vĩnh viễn"
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  background: 'rgba(239, 68, 68, 0.15)',
                  color: '#f87171',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fa-solid fa-ban"></i> Chặn Vĩnh Viễn
              </button>

              <button
                type="button"
                onClick={handleBatchWhitelist}
                title="Cho phép (Bypass)"
                style={{
                  padding: '5px 10px',
                  fontSize: '11px',
                  fontWeight: 700,
                  borderRadius: '6px',
                  border: '1px solid rgba(16, 185, 129, 0.4)',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#34d399',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <i className="fa-solid fa-shield-check"></i> Whitelist
              </button>

              <button
                type="button"
                onClick={() => setSelectedLogIds(new Set())}
                style={{
                  padding: '5px 8px',
                  fontSize: '11px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <i className="fa-solid fa-xmark"></i> Bỏ chọn
              </button>
            </div>
          </div>
        )}

        {/* 5. SOC DATA TABLE */}
        <div className="table-container" style={{ marginTop: '14px', overflowX: 'auto' }}>
          <table className="aawaf-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <th style={{ width: '38px', textAlign: 'center', padding: '10px 8px' }}>
                  <input
                    type="checkbox"
                    checked={paginatedLogs.length > 0 && selectedLogIds.size === paginatedLogs.length}
                    onChange={handleSelectAll}
                    style={{ cursor: 'pointer' }}
                  />
                </th>
                <th style={{ width: '60px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>#ID</th>
                <th style={{ width: '130px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-clock" style={{ marginRight: '5px' }}></i> Thời Gian
                </th>
                <th style={{ width: '180px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-network-wired" style={{ marginRight: '5px' }}></i> Kẻ Tấn Công (IP)
                </th>
                <th style={{ width: '150px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-globe" style={{ marginRight: '5px' }}></i> Website Mục Tiêu
                </th>
                <th style={{ width: '150px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-shield-halved" style={{ marginRight: '5px' }}></i> Mức Độ / Vector
                </th>
                <th style={{ padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-link" style={{ marginRight: '5px' }}></i> Mục Tiêu (URI)
                </th>
                <th style={{ width: '120px', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-tag" style={{ marginRight: '5px' }}></i> CRS Rule
                </th>
                <th style={{ width: '80px', textAlign: 'center', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  Trạng Thái
                </th>
                <th style={{ width: '150px', textAlign: 'center', padding: '10px 8px', color: '#94a3b8', fontSize: '11px' }}>
                  <i className="fa-solid fa-bolt" style={{ marginRight: '5px' }}></i> Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {paginatedLogs.length === 0 ? (
                <tr>
                  <td colSpan="10" style={{ textAlign: 'center', padding: '40px 10px', color: '#64748b' }}>
                    <i className="fa-solid fa-shield-check" style={{ fontSize: '32px', color: '#10b981', display: 'block', marginBottom: '8px' }}></i>
                    {searchQuery
                      ? `Không có sự kiện nào khớp với từ khóa "${searchQuery}".`
                      : 'Hiện không có bản ghi vi phạm nào trong khoảng thời gian đã chọn.'}
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((log, index) => {
                  const logKey = log.id || log.txn_id || `row-${index}`;
                  const isSelected = selectedLogIds.has(log.id || log.txn_id);
                  const geo = getGeoInfo(log.client_ip, log);
                  const timeInfo = formatTimestamp(log.timestamp);
                  const decodedUri = safeDecodeURI(log.uri);
                  const sev = getSeverity(log.attack_type, log.rule_id);
                  const isBanMenuOpen = activeBanDropdown === logKey;

                  return (
                    <tr
                      key={logKey}
                      style={{
                        background: isSelected ? 'rgba(56, 189, 248, 0.08)' : 'transparent',
                        borderBottom: '1px solid #1e293b',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Checkbox */}
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleSelectRow(log.id || log.txn_id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>

                      {/* ID */}
                      <td style={{ padding: '10px 8px', fontFamily: 'var(--font-mono, monospace)', fontSize: '11px', color: '#64748b' }}>
                        #{log.id || totalRecords - (startIndex + index)}
                      </td>

                      {/* Time */}
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#cbd5e1', fontSize: '11px', fontWeight: 600 }}>{timeInfo.relative}</div>
                        <div style={{ color: '#64748b', fontSize: '10px', fontFamily: 'var(--font-mono, monospace)' }} title={timeInfo.full}>
                          {timeInfo.full.slice(11)}
                        </div>
                      </td>

                      {/* Attacker IP & Geo */}
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '14px' }} title={`${geo.country} (${geo.city})`}>
                            {geo.flag}
                          </span>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <code
                                style={{
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  color: '#38bdf8',
                                  fontFamily: 'var(--font-mono, monospace)',
                                }}
                              >
                                {log.client_ip}
                              </code>
                              <button
                                type="button"
                                onClick={() => handleCopyIP(log.client_ip)}
                                title={copiedIP === log.client_ip ? 'Đã sao chép!' : 'Sao chép IP'}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: copiedIP === log.client_ip ? '#10b981' : '#64748b',
                                  cursor: 'pointer',
                                  padding: '1px 3px',
                                  fontSize: '10px',
                                }}
                              >
                                <i className={`fa-solid ${copiedIP === log.client_ip ? 'fa-check' : 'fa-copy'}`}></i>
                              </button>
                            </div>
                            <div style={{ fontSize: '10px', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                              {geo.country} {geo.city ? `· ${geo.city}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Website Mục Tiêu */}
                      <td style={{ padding: '10px 8px' }}>
                        <span
                          style={{
                            fontSize: '11.5px',
                            fontWeight: 600,
                            color: log.target_host ? '#f0abfc' : '#475569',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                          title={log.target_host || 'Chưa xác định'}
                        >
                          {log.target_host || '—'}
                        </span>
                      </td>

                      {/* Severity & Attack Vector */}
                      <td style={{ padding: '10px 8px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              color: sev.color,
                              background: sev.bg,
                              border: `1px solid ${sev.border}`,
                              padding: '2px 6px',
                              borderRadius: '4px',
                              width: 'fit-content',
                            }}
                          >
                            <i className={sev.icon} style={{ fontSize: '9px' }}></i>
                            {sev.label}
                          </span>
                          <span style={{ fontSize: '11px', color: '#e2e8f0', fontWeight: 600 }}>
                            {log.attack_type || 'General Threat'}
                          </span>
                        </div>
                      </td>

                      {/* Request URI */}
                      <td style={{ padding: '10px 8px', maxWidth: '300px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '9.5px',
                              fontWeight: 800,
                              padding: '2px 5px',
                              borderRadius: '4px',
                              background:
                                log.method === 'POST'
                                  ? 'rgba(249, 115, 22, 0.2)'
                                  : log.method === 'GET'
                                  ? 'rgba(56, 189, 248, 0.2)'
                                  : 'rgba(148, 163, 184, 0.2)',
                              color:
                                log.method === 'POST'
                                  ? '#fb923c'
                                  : log.method === 'GET'
                                  ? '#38bdf8'
                                  : '#cbd5e1',
                              border: '1px solid rgba(255,255,255,0.06)',
                            }}
                          >
                            {log.method}
                          </span>
                          <span
                            style={{
                              fontSize: '11.5px',
                              fontFamily: 'var(--font-mono, monospace)',
                              color: '#cbd5e1',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              maxWidth: '250px',
                            }}
                            title={decodedUri}
                          >
                            {decodedUri}
                          </span>
                        </div>
                      </td>

                      {/* Rule ID */}
                      <td style={{ padding: '10px 8px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontFamily: 'var(--font-mono, monospace)',
                            fontWeight: 700,
                            color: '#c084fc',
                            background: 'rgba(168, 85, 247, 0.12)',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            border: '1px solid rgba(168, 85, 247, 0.25)',
                          }}
                          title={log.rule_msg || `Rule #${log.rule_id}`}
                        >
                          #{log.rule_id}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ textAlign: 'center', padding: '10px 8px' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 800,
                            padding: '2px 6px',
                            borderRadius: '10px',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className="fa-solid fa-ban" style={{ fontSize: '9px' }}></i> 403
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ textAlign: 'center', padding: '10px 8px', position: 'relative' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                          {/* Forensic Inspector Eye Button */}
                          <button
                            type="button"
                            onClick={() => setSelectedLogModal(log)}
                            title="Điều tra pháp y chi tiết"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid rgba(56, 189, 248, 0.3)',
                              background: 'rgba(56, 189, 248, 0.12)',
                              color: '#38bdf8',
                              fontSize: '11.5px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>

                          {/* Quick Ban Action with Duration Popover */}
                          <div style={{ position: 'relative' }}>
                            <button
                              type="button"
                              onClick={() => setActiveBanDropdown(isBanMenuOpen ? null : logKey)}
                              title="Chặn IP kẻ tấn công (Tùy chọn thời hạn)"
                              style={{
                                width: '28px',
                                height: '28px',
                                borderRadius: '6px',
                                border: '1px solid rgba(239, 68, 68, 0.35)',
                                background: isBanMenuOpen ? '#ef4444' : 'rgba(239, 68, 68, 0.12)',
                                color: isBanMenuOpen ? '#ffffff' : '#f87171',
                                fontSize: '11px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              <i className="fa-solid fa-shield-halved"></i>
                            </button>

                            {/* Dropdown Menu for Ban Duration */}
                            {isBanMenuOpen && (
                              <div
                                style={{
                                  position: 'absolute',
                                  right: 0,
                                  top: '32px',
                                  zIndex: 999,
                                  background: '#0f172a',
                                  border: '1px solid #334155',
                                  borderRadius: '8px',
                                  boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
                                  width: '160px',
                                  padding: '4px',
                                  textAlign: 'left',
                                }}
                              >
                                <div style={{ fontSize: '10px', color: '#94a3b8', padding: '4px 8px', fontWeight: 700, textTransform: 'uppercase' }}>
                                  Thời hạn cấm IP:
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onAddBlacklist) onAddBlacklist(log.client_ip, `Chặn tự động từ Rule #${log.rule_id}`, '15m');
                                    setActiveBanDropdown(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#fbbf24',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <i className="fa-solid fa-stopwatch"></i> 15 phút (Ưu tiên)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onAddBlacklist) onAddBlacklist(log.client_ip, `Chặn tự động từ Rule #${log.rule_id}`, '1h');
                                    setActiveBanDropdown(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <i className="fa-solid fa-clock"></i> 1 giờ
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onAddBlacklist) onAddBlacklist(log.client_ip, `Chặn tự động từ Rule #${log.rule_id}`, '24h');
                                    setActiveBanDropdown(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#e2e8f0',
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <i className="fa-solid fa-calendar-day"></i> 24 giờ (1 ngày)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (onAddBlacklist) onAddBlacklist(log.client_ip, `Chặn vĩnh viễn từ Rule #${log.rule_id}`, 'permanent');
                                    setActiveBanDropdown(null);
                                  }}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '5px 8px',
                                    fontSize: '11px',
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#ef4444',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    borderRadius: '4px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                  }}
                                >
                                  <i className="fa-solid fa-lock"></i> Vĩnh viễn
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Quick Whitelist Button */}
                          <button
                            type="button"
                            onClick={() => {
                              if (onAddWhitelist) onAddWhitelist(log.client_ip, `Miễn trừ kiểm tra WAF cho IP này`);
                            }}
                            title="Thêm IP vào Whitelist (Bỏ qua WAF)"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              background: 'rgba(16, 185, 129, 0.12)',
                              color: '#34d399',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <i className="fa-solid fa-shield-check"></i>
                          </button>

                          {/* cURL Copy Button */}
                          <button
                            type="button"
                            onClick={() => copyCurlRepro(log)}
                            title="Sao chép lệnh cURL tái hiện tấn công"
                            style={{
                              width: '28px',
                              height: '28px',
                              borderRadius: '6px',
                              border: '1px solid #334155',
                              background: 'rgba(30, 41, 59, 0.6)',
                              color: '#94a3b8',
                              fontSize: '11px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <i className="fa-solid fa-terminal"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* 6. PAGINATION CONTROLS */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '16px', paddingTop: '12px', borderTop: '1px solid #1e293b', fontSize: '12px', color: '#94a3b8' }}>
          <div>
            Hiển thị <strong>{totalRecords === 0 ? 0 : startIndex + 1} - {Math.min(startIndex + pageSize, totalRecords)}</strong> trong tổng số <strong>{totalRecords}</strong> bản ghi
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              type="button"
              onClick={() => setCurrentPage(1)}
              disabled={safeCurrentPage === 1}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: safeCurrentPage === 1 ? '#475569' : '#cbd5e1',
                cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="fa-solid fa-angles-left"></i>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              disabled={safeCurrentPage === 1}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: safeCurrentPage === 1 ? '#475569' : '#cbd5e1',
                cursor: safeCurrentPage === 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="fa-solid fa-angle-left"></i>
            </button>

            {/* Page number pills */}
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum = i + 1;
              if (totalPages > 5 && safeCurrentPage > 3) {
                pageNum = safeCurrentPage - 3 + i;
                if (pageNum > totalPages) pageNum = totalPages - (4 - i);
              }
              if (pageNum <= 0 || pageNum > totalPages) return null;

              return (
                <button
                  type="button"
                  key={`page-${pageNum}`}
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    minWidth: '28px',
                    height: '28px',
                    borderRadius: '4px',
                    border: safeCurrentPage === pageNum ? '1px solid #10b981' : '1px solid #334155',
                    background: safeCurrentPage === pageNum ? 'rgba(16, 185, 129, 0.2)' : '#1e293b',
                    color: safeCurrentPage === pageNum ? '#34d399' : '#cbd5e1',
                    fontWeight: safeCurrentPage === pageNum ? 800 : 500,
                    cursor: 'pointer',
                    fontSize: '11.5px',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={safeCurrentPage === totalPages}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: safeCurrentPage === totalPages ? '#475569' : '#cbd5e1',
                cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="fa-solid fa-angle-right"></i>
            </button>
            <button
              type="button"
              onClick={() => setCurrentPage(totalPages)}
              disabled={safeCurrentPage === totalPages}
              style={{
                padding: '4px 8px',
                borderRadius: '4px',
                border: '1px solid #334155',
                background: '#1e293b',
                color: safeCurrentPage === totalPages ? '#475569' : '#cbd5e1',
                cursor: safeCurrentPage === totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <i className="fa-solid fa-angles-right"></i>
            </button>
          </div>
        </div>
      </div>

      {/* 7. DEEP FORENSIC INSPECTOR MODAL */}
      {selectedLogModal && (
        <div
          className="modal-backdrop"
          onClick={() => setSelectedLogModal(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(5px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '12px',
              maxWidth: '820px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              animation: 'fadeInPanel 0.2s ease',
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    background: 'rgba(239, 68, 68, 0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#f87171',
                    fontSize: '16px',
                  }}
                >
                  <i className="fa-solid fa-fingerprint"></i>
                </div>
                <div>
                  <h4 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: 800 }}>
                    Threat Forensic Inspection · #{selectedLogModal.id}
                  </h4>
                  <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                    Txn ID: <code style={{ color: '#38bdf8' }}>{selectedLogModal.txn_id || 'N/A'}</code>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogModal(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '16px',
                  cursor: 'pointer',
                  padding: '4px',
                }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Modal Tabs Header */}
            <div style={{ padding: '0 20px', borderBottom: '1px solid #1e293b', display: 'flex', gap: '16px', background: '#090d16' }}>
              <button
                type="button"
                onClick={() => setActiveModalTab('overview')}
                style={{
                  padding: '11px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeModalTab === 'overview' ? '2px solid #10b981' : '2px solid transparent',
                  color: activeModalTab === 'overview' ? '#34d399' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-circle-info"></i> Tổng quan mối đe dọa
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('payload')}
                style={{
                  padding: '11px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeModalTab === 'payload' ? '2px solid #10b981' : '2px solid transparent',
                  color: activeModalTab === 'payload' ? '#34d399' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-code"></i> Payload & Bằng chứng
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('fingerprint')}
                style={{
                  padding: '11px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeModalTab === 'fingerprint' ? '2px solid #10b981' : '2px solid transparent',
                  color: activeModalTab === 'fingerprint' ? '#34d399' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-laptop-code"></i> Dấu vân tay Client
              </button>

              <button
                type="button"
                onClick={() => setActiveModalTab('curl')}
                style={{
                  padding: '11px 0',
                  border: 'none',
                  background: 'none',
                  borderBottom: activeModalTab === 'curl' ? '2px solid #10b981' : '2px solid transparent',
                  color: activeModalTab === 'curl' ? '#34d399' : '#94a3b8',
                  fontWeight: 700,
                  fontSize: '12.5px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <i className="fa-solid fa-terminal"></i> Lệnh cURL
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px', maxHeight: '60vh', overflowY: 'auto' }}>
              {activeModalTab === 'overview' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Địa chỉ IP kẻ tấn công</div>
                    <div style={{ fontSize: '15px', fontWeight: 800, color: '#38bdf8', fontFamily: 'var(--font-mono, monospace)', marginTop: '4px' }}>
                      {selectedLogModal.client_ip}
                    </div>
                  </div>

                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quốc gia & Khu vực</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
                      {getGeoInfo(selectedLogModal.client_ip, selectedLogModal).flag}{' '}
                      {getGeoInfo(selectedLogModal.client_ip, selectedLogModal).country}{' '}
                      ({getGeoInfo(selectedLogModal.client_ip, selectedLogModal).city || 'Network'})
                    </div>
                  </div>

                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Vector Tấn công</div>
                    <div style={{ fontSize: '14px', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
                      {selectedLogModal.attack_type}
                    </div>
                  </div>

                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quyết định xử lý của WAF</div>
                    <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <i className="fa-solid fa-circle-check"></i> Chặn truy cập (403 Forbidden)
                    </div>
                  </div>

                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px', gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Quy tắc bảo vệ OWASP Core Rule Set</div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: '#c084fc', marginTop: '4px' }}>
                      Rule #{selectedLogModal.rule_id} — {selectedLogModal.rule_msg}
                    </div>
                  </div>

                  <div style={{ background: '#1e293b', padding: '12px 14px', borderRadius: '8px', gridColumn: 'span 2' }}>
                    <div style={{ fontSize: '11px', color: '#94a3b8' }}>Thời điểm phát hiện</div>
                    <div style={{ fontSize: '12.5px', fontFamily: 'var(--font-mono, monospace)', color: '#cbd5e1', marginTop: '4px' }}>
                      {formatTimestamp(selectedLogModal.timestamp).full}
                    </div>
                  </div>
                </div>
              )}

              {activeModalTab === 'payload' && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    HTTP URI Mục tiêu:
                  </div>
                  <pre
                    style={{
                      background: '#090d16',
                      color: '#34d399',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflowX: 'auto',
                      border: '1px solid #1e293b',
                      marginBottom: '14px',
                    }}
                  >
                    {safeDecodeURI(selectedLogModal.uri)}
                  </pre>

                  <div style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8', marginBottom: '6px' }}>
                    Payload độc hại trích xuất từ Request:
                  </div>
                  <pre
                    style={{
                      background: '#18121f',
                      color: '#fca5a5',
                      padding: '12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflowX: 'auto',
                      borderLeft: '4px solid #ef4444',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    {safeDecodeURI(selectedLogModal.raw_payload || selectedLogModal.uri)}
                  </pre>
                </div>
              )}

              {activeModalTab === 'fingerprint' && (
                <div>
                  {(() => {
                    const parsed = parseUserAgent(selectedLogModal.user_agent);
                    return (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <i className={parsed.browser.icon} style={{ fontSize: '24px', color: '#38bdf8' }}></i>
                          <div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Trình duyệt / Công cụ</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{parsed.browser.name}</div>
                          </div>
                        </div>

                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <i className={parsed.os.icon} style={{ fontSize: '24px', color: '#34d399' }}></i>
                          <div>
                            <div style={{ fontSize: '11px', color: '#94a3b8' }}>Hệ điều hành</div>
                            <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{parsed.os.name}</div>
                          </div>
                        </div>

                        <div style={{ background: '#1e293b', padding: '14px', borderRadius: '8px', gridColumn: 'span 2' }}>
                          <div style={{ fontSize: '11px', color: '#94a3b8' }}>Chuỗi User-Agent đầy đủ</div>
                          <code style={{ fontSize: '11.5px', color: '#cbd5e1', display: 'block', marginTop: '6px', wordBreak: 'break-all' }}>
                            {selectedLogModal.user_agent || 'Mozilla/5.0'}
                          </code>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {activeModalTab === 'curl' && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
                      Lệnh cURL mô phỏng và tái hiện:
                    </span>
                    <button
                      type="button"
                      onClick={() => copyCurlRepro(selectedLogModal)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11px',
                        borderRadius: '6px',
                        border: '1px solid #10b981',
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#34d399',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      <i className={`fa-solid ${copiedCurl ? 'fa-check' : 'fa-copy'}`}></i>
                      {copiedCurl ? 'Đã chép cURL!' : 'Sao chép'}
                    </button>
                  </div>
                  <pre
                    style={{
                      background: '#090d16',
                      color: '#f8fafc',
                      padding: '14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontFamily: 'var(--font-mono, monospace)',
                      overflowX: 'auto',
                      border: '1px solid #1e293b',
                    }}
                  >
                    {`curl -i -X ${selectedLogModal.method || 'GET'} "http://${window.location.hostname || '192.168.246.100'}${selectedLogModal.uri}" -A "${selectedLogModal.user_agent || 'Mozilla/5.0'}"`}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Enforcement Footer */}
            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid #1e293b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '8px',
                background: '#0b1329',
              }}
            >
              <button
                type="button"
                onClick={() => setSelectedLogModal(null)}
                style={{
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #475569',
                  background: 'transparent',
                  color: '#cbd5e1',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    if (onAddWhitelist) onAddWhitelist(selectedLogModal.client_ip, `Whitelist từ sự cố #${selectedLogModal.id}`);
                    setSelectedLogModal(null);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(16, 185, 129, 0.4)',
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#34d399',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-shield-check"></i> Whitelist
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onAddBlacklist) onAddBlacklist(selectedLogModal.client_ip, `Chặn 15m từ sự cố #${selectedLogModal.id}`, '15m');
                    setSelectedLogModal(null);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(245, 158, 11, 0.4)',
                    background: 'rgba(245, 158, 11, 0.15)',
                    color: '#fbbf24',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-stopwatch"></i> Chặn 15m
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (onAddBlacklist) onAddBlacklist(selectedLogModal.client_ip, `Chặn vĩnh viễn từ sự cố #${selectedLogModal.id}`, 'permanent');
                    setSelectedLogModal(null);
                  }}
                  style={{
                    padding: '6px 12px',
                    borderRadius: '6px',
                    border: '1px solid #ef4444',
                    background: '#ef4444',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className="fa-solid fa-ban"></i> Chặn Vĩnh Viễn
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
