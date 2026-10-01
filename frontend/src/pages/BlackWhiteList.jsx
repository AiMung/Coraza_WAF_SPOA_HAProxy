import React, { useState, useEffect, useMemo } from 'react';

// Validation helper for IPv4, IPv6, and CIDR
const isValidIPOrCIDR = (val) => {
  if (!val || typeof val !== 'string') return false;
  const s = val.trim();
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:\/(?:[0-9]|[1-2][0-9]|3[0-2]))?$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/(12[0-8]|1[0-1][0-9]|[1-9]?[0-9]))?$/;
  return ipv4Regex.test(s) || ipv6Regex.test(s) || s === '::1';
};

// Clean timestamp formatter: HH:mm:ss · DD/MM/YYYY (GMT+7 Hà Nội)
const formatTimestamp = (isoStr) => {
  if (!isoStr) return '—';
  try {
    let clean = isoStr;
    if (!clean.includes('T') && !clean.includes('Z') && !clean.includes('+')) {
      clean = clean.replace(' ', 'T') + '+07:00';
    }
    const d = new Date(clean);
    if (isNaN(d.getTime())) return isoStr;

    const formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Ho_Chi_Minh',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(d);
    const getPart = (type) => parts.find((p) => p.type === type)?.value || '';
    return `${getPart('hour')}:${getPart('minute')}:${getPart('second')} · ${getPart('day')}/${getPart('month')}/${getPart('year')}`;
  } catch {
    return isoStr;
  }
};

const parseToTime = (str) => {
  if (!str) return 0;
  let clean = str;
  if (!clean.includes('T') && !clean.includes('Z') && !clean.includes('+')) {
    clean = clean.replace(' ', 'T') + '+07:00';
  }
  return new Date(clean).getTime();
};

export default function BlackWhiteList({
  ipRules = [],
  onOpenAddModal,
  onDeleteRule,
  onQuickExtend,
  onAddBlacklist,
  onAddWhitelist,
}) {
  const [activeSubTab, setActiveSubTab] = useState('blacklist'); // 'blacklist' | 'whitelist'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDuration, setFilterDuration] = useState('all'); // 'all' | 'temporary' | 'permanent'
  const [copiedIP, setCopiedIP] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [showArchModal, setShowArchModal] = useState(false);

  // Live IP Inspector state
  const [inspectorIP, setInspectorIP] = useState('');
  const [inspectorResult, setInspectorResult] = useState(null);

  // Real-time tick every second for live countdown
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const rulesList = Array.isArray(ipRules) ? ipRules : [];

  // Metrics
  const blacklistRules = useMemo(() => rulesList.filter((r) => r.rule_type === 'blacklist'), [rulesList]);
  const whitelistRules = useMemo(() => rulesList.filter((r) => r.rule_type === 'whitelist'), [rulesList]);

  const expiringSoonCount = useMemo(() => {
    return blacklistRules.filter((r) => {
      if (!r.expires_at) return false;
      const diff = parseToTime(r.expires_at) - now;
      return diff > 0 && diff < 3600000; // < 1 hour
    }).length;
  }, [blacklistRules, now]);

  const permanentCount = useMemo(() => {
    return blacklistRules.filter((r) => !r.expires_at).length;
  }, [blacklistRules]);

  // Current active list based on selected sub-tab
  const currentTabList = activeSubTab === 'blacklist' ? blacklistRules : whitelistRules;

  // Filtered list
  const filteredList = useMemo(() => {
    return currentTabList.filter((r) => {
      const searchLower = searchTerm.toLowerCase().trim();
      const matchSearch =
        !searchLower ||
        (r.ip && r.ip.toLowerCase().includes(searchLower)) ||
        (r.reason && r.reason.toLowerCase().includes(searchLower)) ||
        (r.country && r.country.toLowerCase().includes(searchLower)) ||
        (r.created_at && r.created_at.includes(searchLower));

      if (!matchSearch) return false;

      if (activeSubTab === 'blacklist') {
        if (filterDuration === 'temporary') return !!r.expires_at;
        if (filterDuration === 'permanent') return !r.expires_at;
      }

      return true;
    });
  }, [currentTabList, searchTerm, filterDuration, activeSubTab]);

  const handleCopy = (ip) => {
    navigator.clipboard.writeText(ip);
    setCopiedIP(ip);
    setTimeout(() => setCopiedIP(null), 2000);
  };

  const handleExportList = () => {
    const ips = filteredList.map((r) => r.ip).join('\n');
    const blob = new Blob([ips], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `waf_${activeSubTab}_ips.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleInspectIP = (e) => {
    if (e) e.preventDefault();
    const target = inspectorIP.trim();
    if (!target) return;

    if (!isValidIPOrCIDR(target)) {
      setInspectorResult({
        ip: target,
        verdict: 'invalid',
        title: 'Địa chỉ IP không hợp lệ',
        badge: '⚠️ SAI ĐỊNH DẠNG',
        badgeColor: '#b45309',
        badgeBg: '#fef3c7',
        message: 'Chuỗi nhập vào không phải là IPv4, IPv6 hoặc CIDR hợp lệ (Ví dụ đúng: 192.168.1.1 hoặc 192.168.1.0/24).',
        rule: null,
      });
      return;
    }

    // 1. Check in whitelist
    const foundWhite = rulesList.find((r) => r.rule_type === 'whitelist' && r.ip.trim() === target);
    if (foundWhite) {
      setInspectorResult({
        ip: target,
        verdict: 'whitelist',
        title: 'Miễn Trừ Kiểm Tra (Whitelist Bypass)',
        badge: '🟢 ĐƯỢC PHÉP TRUY CẬP',
        badgeColor: '#15803d',
        badgeBg: '#dcfce7',
        message: 'Nằm trong Whitelist tin cậy. HAProxy chuyển thẳng vào máy chủ web, BỎ QUA TOÀN BỘ phân tích Coraza WAF.',
        rule: foundWhite,
      });
      return;
    }

    // 2. Check in blacklist
    const foundBlack = rulesList.find((r) => r.rule_type === 'blacklist' && r.ip.trim() === target);
    if (foundBlack) {
      const isExpired = foundBlack.expires_at && new Date(foundBlack.expires_at).getTime() <= now;
      if (isExpired) {
        setInspectorResult({
          ip: target,
          verdict: 'expired',
          title: 'Hết Hạn Cấm (Đang Tự Động Gỡ)',
          badge: '🟡 HẾT HẠN',
          badgeColor: '#b45309',
          badgeBg: '#fef3c7',
          message: 'Thời hạn cấm đã kết thúc. Daemon nền đang tự động gỡ bỏ khỏi bộ lọc HAProxy.',
          rule: foundBlack,
        });
      } else {
        setInspectorResult({
          ip: target,
          verdict: 'blacklist',
          title: 'Bị Chặn Đứng Tức Thì (Fast-Path 403 Forbidden)',
          badge: '🔴 BỊ CHẶN (403)',
          badgeColor: '#b91c1c',
          badgeBg: '#fee2e2',
          message: 'Nằm trong Blacklist. HAProxy từ chối kết nối ngay tại tầng L4/L7 với HTTP 403 mà không tốn tài nguyên gọi WAF.',
          rule: foundBlack,
        });
      }
      return;
    }

    // 3. Clean / Standard WAF Deep Inspection
    setInspectorResult({
      ip: target,
      verdict: 'standard',
      title: 'Lưu Lượng Tiêu Chuẩn (Standard Coraza L7 Deep Inspection)',
      badge: '🔵 PHÂN TÍCH L7 WAF',
      badgeColor: '#0369a1',
      badgeBg: '#e0f2fe',
      message: 'Không nằm trong danh sách cấm hay miễn trừ. Yêu cầu HTTP sẽ được Coraza SPOA kiểm tra sâu bộ luật OWASP CRS v4.9.',
      rule: null,
    });
  };

  const formatCountdown = (expiresAt, ruleType) => {
    if (ruleType === 'whitelist') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: '#15803d',
            fontSize: '11px',
            fontWeight: 700,
            background: '#dcfce7',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #bbf7d0',
          }}
        >
          <i className="fa-solid fa-circle-check"></i> Bypass WAF
        </span>
      );
    }

    if (!expiresAt) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: '#7e22ce',
            fontSize: '11px',
            fontWeight: 700,
            background: '#f3e8ff',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #e9d5ff',
          }}
        >
          <i className="fa-solid fa-infinity"></i> Vĩnh viễn
        </span>
      );
    }

    const expTime = parseToTime(expiresAt);
    const diff = expTime - now;

    if (diff <= 0) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: '#b91c1c',
            fontSize: '11px',
            fontWeight: 700,
            background: '#fee2e2',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #fecaca',
          }}
        >
          <i className="fa-solid fa-hourglass-end"></i> Đang gỡ...
        </span>
      );
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    let displayStr = '';
    if (days > 0) displayStr += `${days}d `;
    if (hours > 0 || days > 0) displayStr += `${hours}h `;
    if (mins > 0 || hours > 0 || days > 0) {
      displayStr += `${mins}m ${secs}s`;
    } else {
      displayStr += `${secs}s (Demo)`;
    }

    const isUrgent = diff <= 25000;

    return (
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: '11.5px',
          fontWeight: 700,
          color: isUrgent ? '#4338ca' : '#0369a1',
          background: isUrgent ? '#eef2ff' : '#e0f2fe',
          padding: '2px 8px',
          borderRadius: '6px',
          border: isUrgent ? '1px solid #c7d2fe' : '1px solid #bae6fd',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          whiteSpace: 'nowrap',
          animation: isUrgent ? 'pulse 1.5s infinite' : 'none',
        }}
      >
        <i
          className={isUrgent ? 'fa-solid fa-bolt' : 'fa-solid fa-stopwatch fa-spin'}
          style={{ animationDuration: isUrgent ? '1s' : '4s', fontSize: '10px' }}
        ></i>
        {displayStr}
      </span>
    );
  };

  return (
    <div style={{ animation: 'fadeInPanel 0.2s ease', color: '#0f172a' }}>
      {/* 1. Sleek Enterprise KPI Metrics Strip */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '14px',
        }}
      >
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
              background: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#dc2626',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-ban"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px' }}>
              Blacklist Đang Cấm
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#dc2626', marginTop: '1px' }}>
              {blacklistRules.length} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px' }}>
              Sắp Hết Hạn (&lt;1h)
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#d97706', marginTop: '1px' }}>
              {expiringSoonCount} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9333ea',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-lock"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px' }}>
              Cấm Vĩnh Viễn
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#9333ea', marginTop: '1px' }}>
              {permanentCount} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

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
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#16a34a',
              fontSize: '16px',
            }}
          >
            <i className="fa-solid fa-shield-check"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.4px' }}>
              Whitelist Tin Cậy
            </div>
            <div style={{ fontSize: '18px', fontWeight: 800, color: '#16a34a', marginTop: '1px' }}>
              {whitelistRules.length} <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Enterprise Container */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '16px 20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        {/* Head Bar: Clean title & primary actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            borderBottom: '1px solid #f1f5f9',
            paddingBottom: '12px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '34px',
                height: '34px',
                borderRadius: '8px',
                background: '#ecfdf5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#10b981',
                fontSize: '15px',
              }}
            >
              <i className="fa-solid fa-sliders"></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a', fontWeight: 800 }}>
                Kiểm Soát Truy Cập IP (IP Access Control)
              </h4>
              <p style={{ fontSize: '12px', margin: '2px 0 0', color: '#64748b' }}>
                Đồng bộ hóa 2 tầng: HAProxy L4/L7 Fast-Path & Coraza SPOA WAF Engine.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setShowArchModal(true)}
              title="Xem quy chuẩn kiến trúc phòng thủ 2 tầng"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#334155',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <i className="fa-solid fa-layer-group" style={{ color: '#0284c7' }}></i>
              Kiến Trúc 2 Tầng
            </button>

            <button
              type="button"
              onClick={handleExportList}
              title="Xuất danh sách IP ra file text"
              style={{
                fontSize: '12px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                background: '#ffffff',
                color: '#475569',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <i className="fa-solid fa-file-arrow-down"></i> Xuất .TXT
            </button>

            <button
              onClick={onOpenAddModal}
              style={{
                fontSize: '12px',
                padding: '6px 14px',
                borderRadius: '6px',
                border: 'none',
                background: '#2563eb',
                color: '#fff',
                cursor: 'pointer',
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
              }}
            >
              <i className="fa-solid fa-plus"></i> Thêm IP
            </button>
          </div>
        </div>

        {/* 3. Compact Live IP Diagnostic Inspector Bar (Non-intrusive) */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: '8px',
            padding: '10px 14px',
            marginBottom: '14px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: '1', minWidth: '280px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#334155', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-magnifying-glass-location" style={{ color: '#0284c7' }}></i>
                Tra cứu nhanh IP:
              </span>
              <form onSubmit={handleInspectIP} style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
                <input
                  type="text"
                  placeholder="Nhập IP cần kiểm tra quyền (e.g. 192.168.246.1)..."
                  value={inspectorIP}
                  onChange={(e) => {
                    setInspectorIP(e.target.value);
                    if (!e.target.value) setInspectorResult(null);
                  }}
                  style={{
                    flex: 1,
                    maxWidth: '300px',
                    height: '30px',
                    fontSize: '12px',
                    padding: '0 10px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    borderRadius: '5px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  style={{
                    height: '30px',
                    fontSize: '11.5px',
                    padding: '0 10px',
                    borderRadius: '5px',
                    border: 'none',
                    background: '#0284c7',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}
                >
                  <i className="fa-solid fa-check"></i> Kiểm Tra
                </button>
              </form>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#64748b' }}>
              <span>Thử nhanh:</span>
              <button
                type="button"
                onClick={() => {
                  setInspectorIP('127.0.0.1');
                  setTimeout(() => handleInspectIP(), 20);
                }}
                style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px', color: '#334155', fontWeight: 600 }}
              >
                127.0.0.1
              </button>
              <button
                type="button"
                onClick={() => {
                  setInspectorIP('192.168.246.1');
                  setTimeout(() => handleInspectIP(), 20);
                }}
                style={{ background: '#e2e8f0', border: 'none', borderRadius: '4px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px', color: '#334155', fontWeight: 600 }}
              >
                192.168.246.1
              </button>
            </div>
          </div>

          {/* Inline verdict banner if inspected */}
          {inspectorResult && (
            <div
              style={{
                marginTop: '8px',
                background: '#ffffff',
                border: `1px solid ${
                  inspectorResult.verdict === 'blacklist'
                    ? '#fecaca'
                    : inspectorResult.verdict === 'whitelist'
                    ? '#bbf7d0'
                    : inspectorResult.verdict === 'invalid'
                    ? '#fde68a'
                    : '#bae6fd'
                }`,
                borderRadius: '6px',
                padding: '8px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
                animation: 'fadeInPanel 0.15s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '260px' }}>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: inspectorResult.badgeBg,
                    color: inspectorResult.badgeColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {inspectorResult.badge}
                </span>
                <span style={{ fontSize: '12px', color: '#0f172a' }}>
                  <strong>{inspectorResult.ip}:</strong> {inspectorResult.message}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {inspectorResult.verdict === 'standard' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddBlacklist) {
                          onAddBlacklist(inspectorResult.ip, 'Chặn thử nghiệm 20 giây', '20s');
                          setTimeout(() => handleInspectIP(), 200);
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#6366f1',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 700,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                      title="Chặn IP trong 20 giây để biểu diễn tính năng đếm ngược & tự động gỡ"
                    >
                      <i className="fa-solid fa-bolt"></i> Chặn 20s
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddBlacklist) {
                          onAddBlacklist(inspectorResult.ip, 'Chặn từ công cụ kiểm tra', '15m');
                          setTimeout(() => handleInspectIP(), 200);
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#dc2626',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      <i className="fa-solid fa-ban"></i> Chặn 15m
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onAddWhitelist) {
                          onAddWhitelist(inspectorResult.ip, 'Thêm từ công cụ kiểm tra');
                          setTimeout(() => handleInspectIP(), 200);
                        }
                      }}
                      style={{
                        fontSize: '11px',
                        padding: '3px 8px',
                        borderRadius: '4px',
                        border: 'none',
                        background: '#16a34a',
                        color: '#fff',
                        cursor: 'pointer',
                        fontWeight: 600,
                      }}
                    >
                      <i className="fa-solid fa-shield-check"></i> Whitelist
                    </button>
                  </>
                )}

                {inspectorResult.rule && (
                  <button
                    type="button"
                    onClick={() => {
                      if (onDeleteRule) {
                        onDeleteRule(inspectorResult.rule.id);
                        setTimeout(() => handleInspectIP(), 200);
                      }
                    }}
                    style={{
                      fontSize: '11px',
                      padding: '3px 8px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      background: '#ffffff',
                      color: '#dc2626',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    <i className="fa-solid fa-trash-can"></i> Gỡ Quy Tắc
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setInspectorIP('');
                    setInspectorResult(null);
                  }}
                  title="Đóng kết quả"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 4. Segmented Tabs & Filters Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: '4px', background: '#f1f5f9', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              onClick={() => {
                setActiveSubTab('blacklist');
                setSearchTerm('');
              }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: activeSubTab === 'blacklist' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'blacklist' ? '#b91c1c' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                boxShadow: activeSubTab === 'blacklist' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <i className="fa-solid fa-shield-xmark"></i>
              <span>Blacklist</span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: activeSubTab === 'blacklist' ? '#fee2e2' : '#e2e8f0',
                  color: activeSubTab === 'blacklist' ? '#b91c1c' : '#64748b',
                  fontWeight: 800,
                }}
              >
                {blacklistRules.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveSubTab('whitelist');
                setSearchTerm('');
              }}
              style={{
                padding: '6px 14px',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                background: activeSubTab === 'whitelist' ? '#ffffff' : 'transparent',
                color: activeSubTab === 'whitelist' ? '#15803d' : '#64748b',
                border: 'none',
                borderRadius: '6px',
                boxShadow: activeSubTab === 'whitelist' ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s',
              }}
            >
              <i className="fa-solid fa-shield-check"></i>
              <span>Whitelist</span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: activeSubTab === 'whitelist' ? '#dcfce7' : '#e2e8f0',
                  color: activeSubTab === 'whitelist' ? '#15803d' : '#64748b',
                  fontWeight: 800,
                }}
              >
                {whitelistRules.length}
              </span>
            </button>
          </div>

          {/* Search & Sub-filters */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            {activeSubTab === 'blacklist' && (
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="button"
                  onClick={() => setFilterDuration('all')}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    background: filterDuration === 'all' ? '#0f172a' : '#ffffff',
                    color: filterDuration === 'all' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Tất cả ({blacklistRules.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDuration('temporary')}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    background: filterDuration === 'temporary' ? '#0f172a' : '#ffffff',
                    color: filterDuration === 'temporary' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Đếm ngược ({blacklistRules.filter((r) => r.expires_at).length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDuration('permanent')}
                  style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    border: '1px solid #cbd5e1',
                    background: filterDuration === 'permanent' ? '#0f172a' : '#ffffff',
                    color: filterDuration === 'permanent' ? '#ffffff' : '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Vĩnh viễn ({blacklistRules.filter((r) => !r.expires_at).length})
                </button>
              </div>
            )}

            <div style={{ position: 'relative', width: '220px' }}>
              <i
                className="fa-solid fa-magnifying-glass"
                style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '11px' }}
              ></i>
              <input
                type="text"
                placeholder={activeSubTab === 'blacklist' ? 'Tìm IP, lý do...' : 'Tìm IP Whitelist...'}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: '28px',
                  paddingRight: '26px',
                  height: '30px',
                  fontSize: '12px',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  outline: 'none',
                }}
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  style={{
                    position: 'absolute',
                    right: '6px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                  }}
                >
                  <i className="fa-solid fa-xmark"></i>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 5. Clean, Professional Data Table */}
        <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: '220px', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Địa Chỉ IP / CIDR
                </th>
                <th style={{ width: '110px', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Chính Sách
                </th>
                {activeSubTab === 'blacklist' && (
                  <th style={{ width: '160px', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                    Thời Hạn (TTL)
                  </th>
                )}
                <th style={{ padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Lý Do / Nguồn Phát Hiện
                </th>
                <th style={{ width: '180px', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                  Thời Điểm Tạo
                </th>
                <th style={{ width: '90px', padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'blacklist' ? 6 : 5} style={{ padding: '36px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-solid fa-inbox" style={{ fontSize: '22px', marginBottom: '6px', display: 'block' }}></i>
                    Chưa có địa chỉ IP nào trong {activeSubTab === 'blacklist' ? 'Blacklist' : 'Whitelist'}
                  </td>
                </tr>
              ) : (
                filteredList.map((rule) => {
                  const isBlacklist = rule.rule_type === 'blacklist';

                  return (
                    <tr
                      key={rule.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: '#ffffff',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = '#ffffff')}
                    >
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                            {rule.ip}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(rule.ip)}
                            title="Sao chép IP"
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedIP === rule.ip ? '#16a34a' : '#94a3b8',
                              cursor: 'pointer',
                              fontSize: '11px',
                              padding: '2px',
                            }}
                          >
                            <i className={copiedIP === rule.ip ? 'fa-solid fa-check' : 'fa-regular fa-copy'}></i>
                          </button>
                        </div>
                        {rule.country && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '1px' }}>
                            {rule.flag || '🌐'} {rule.country}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span
                          style={{
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 7px',
                            borderRadius: '5px',
                            background: isBlacklist ? '#fee2e2' : '#dcfce7',
                            color: isBlacklist ? '#b91c1c' : '#15803d',
                            border: `1px solid ${isBlacklist ? '#fecaca' : '#bbf7d0'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <i className={`fa-solid ${isBlacklist ? 'fa-ban' : 'fa-circle-check'}`}></i>
                          {isBlacklist ? 'CẤM' : 'CHO PHÉP'}
                        </span>
                      </td>
                      {activeSubTab === 'blacklist' && (
                        <td style={{ padding: '10px 14px' }}>
                          {formatCountdown(rule.expires_at, rule.rule_type)}
                        </td>
                      )}
                      <td style={{ padding: '10px 14px', color: '#334155', fontSize: '12px' }}>
                        {rule.reason || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có ghi chú</span>}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '11.5px', whiteSpace: 'nowrap' }}>
                        <i className="fa-regular fa-clock" style={{ marginRight: '5px', color: '#94a3b8' }}></i>
                        {formatTimestamp(rule.created_at)}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {isBlacklist && rule.expires_at && onQuickExtend && (
                            <>
                              <button
                                type="button"
                                onClick={() => onQuickExtend(rule.ip, '20s')}
                                title="Gia hạn cấm thêm 20 giây (Demo)"
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #c7d2fe',
                                  background: '#eef2ff',
                                  color: '#4338ca',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                +20s
                              </button>
                              <button
                                type="button"
                                onClick={() => onQuickExtend(rule.ip, '15m')}
                                title="Gia hạn cấm thêm 15 phút"
                                style={{
                                  padding: '3px 6px',
                                  borderRadius: '4px',
                                  border: '1px solid #cbd5e1',
                                  background: '#f8fafc',
                                  color: '#0369a1',
                                  fontSize: '11px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                +15m
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteRule && onDeleteRule(rule.id, rule.ip)}
                            title="Gỡ bỏ IP khỏi danh sách"
                            style={{
                              padding: '4px 7px',
                              borderRadius: '4px',
                              border: '1px solid #fee2e2',
                              background: '#fff',
                              color: '#dc2626',
                              fontSize: '11px',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-trash-can"></i>
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
      </div>

      {/* 6. Clean Architecture Modal (Opens on demand) */}
      {showArchModal && (
        <div className="modal-overlay" onClick={() => setShowArchModal(false)}>
          <div
            className="modal-dialog"
            style={{ maxWidth: '640px', background: '#ffffff', borderRadius: '10px', padding: '0', overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-layer-group" style={{ color: '#0284c7', fontSize: '16px' }}></i>
                <span style={{ fontWeight: 800, fontSize: '15px', color: '#0f172a' }}>
                  Kiến Trúc Phòng Thủ 2 Tầng (HAProxy Fast-Path & Coraza WAF)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowArchModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '16px' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div style={{ padding: '20px', color: '#334155', fontSize: '13px', lineHeight: 1.6 }}>
              <div style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                <strong style={{ color: '#dc2626', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <i className="fa-solid fa-bolt"></i> Tầng 1: HAProxy L4/L7 Fast-Path Enforcement
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569' }}>
                  Kiểm tra danh sách IP ngay tại thời điểm bắt tay TCP (Layer 4/7). Nếu thuộc <strong>Blacklist</strong>, HAProxy lập tức ngắt kết nối với mã <code>403 Forbidden</code> (kèm header <code>X-Blocked-By: HAProxy-IP-Blacklist</code>) mà không tốn bất kỳ chu kỳ CPU nào của WAF Engine.
                </p>
              </div>

              <div style={{ marginBottom: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '14px' }}>
                <strong style={{ color: '#16a34a', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <i className="fa-solid fa-shield-check"></i> Whitelist Bypass Acceleration
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569' }}>
                  Nếu IP thuộc <strong>Whitelist</strong>, HAProxy cho phép lưu lượng đi thẳng tới Backend Web Server và <strong>bỏ qua toàn bộ bước kiểm tra Coraza SPOA</strong>. Rất phù hợp cho luồng giám sát nội bộ, API đối tác tin cậy hoặc máy chủ quản trị.
                </p>
              </div>

              <div style={{ background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: '8px', padding: '14px' }}>
                <strong style={{ color: '#0284c7', fontSize: '13.5px', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                  <i className="fa-solid fa-microchip"></i> Tầng 2: Coraza SPOA Deep Inspection
                </strong>
                <p style={{ margin: 0, fontSize: '12.5px', color: '#475569' }}>
                  Các IP thông thường không nằm trong danh sách cấm hoặc miễn trừ sẽ được kiểm tra sâu toàn bộ Header, Query, Cookies, Body qua bộ quy tắc bảo mật chuẩn quốc tế <strong>OWASP CRS v4.9</strong>.
                </p>
              </div>

              <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowArchModal(false)}
                  style={{
                    padding: '8px 18px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#0f172a',
                    color: '#fff',
                    fontWeight: 600,
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Đã Hiểu
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
