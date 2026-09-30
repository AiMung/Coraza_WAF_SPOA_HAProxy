import React, { useState, useEffect, useMemo } from 'react';

export default function BlackWhiteList({ ipRules = [], onOpenAddModal, onDeleteRule, onQuickExtend }) {
  const [activeSubTab, setActiveSubTab] = useState('blacklist'); // 'blacklist' | 'whitelist'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDuration, setFilterDuration] = useState('all'); // 'all' | 'temporary' | 'permanent'
  const [copiedIP, setCopiedIP] = useState(null);
  const [now, setNow] = useState(Date.now());

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
      const diff = new Date(r.expires_at).getTime() - now;
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

  const formatCountdown = (expiresAt, ruleType) => {
    if (ruleType === 'whitelist') {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            color: '#15803d',
            fontSize: '11.5px',
            fontWeight: 700,
            background: '#dcfce7',
            padding: '3px 9px',
            borderRadius: '12px',
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
            fontSize: '11.5px',
            fontWeight: 700,
            background: '#f3e8ff',
            padding: '3px 9px',
            borderRadius: '12px',
            border: '1px solid #e9d5ff',
          }}
        >
          <i className="fa-solid fa-infinity"></i> Vĩnh viễn
        </span>
      );
    }

    const expTime = new Date(expiresAt).getTime();
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
            padding: '3px 8px',
            borderRadius: '12px',
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
    displayStr += `${mins}m ${secs}s`;

    return (
      <span
        style={{
          fontFamily: 'monospace',
          fontSize: '11.5px',
          fontWeight: 700,
          color: '#0369a1',
          background: '#e0f2fe',
          padding: '3px 10px',
          borderRadius: '12px',
          border: '1px solid #bae6fd',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <i className="fa-solid fa-stopwatch fa-spin" style={{ animationDuration: '4s', fontSize: '10px' }}></i>
        {displayStr}
      </span>
    );
  };

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', color: '#0f172a' }}>
      {/* 1. Top Enterprise KPI Metrics Strip (Light Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '14px' }}>
        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#fee2e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#dc2626', fontSize: '18px' }}>
            <i className="fa-solid fa-ban"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>Blacklist Đang Cấm</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#dc2626', marginTop: '2px' }}>
              {blacklistRules.length} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d97706', fontSize: '18px' }}>
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>Sắp Hết Hạn (&lt;1h)</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#d97706', marginTop: '2px' }}>
              {expiringSoonCount} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9333ea', fontSize: '18px' }}>
            <i className="fa-solid fa-lock"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>Cấm Vĩnh Viễn</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#9333ea', marginTop: '2px' }}>
              {permanentCount} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>

        <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', fontSize: '18px' }}>
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>Whitelist Tin Cậy</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#16a34a', marginTop: '2px' }}>
              {whitelistRules.length} <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 400 }}>IP</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Main Card (Light Theme) */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        {/* Head Bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #e2e8f0', paddingBottom: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: '#ecfdf5', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '16px' }}>
              <i className="fa-solid fa-sliders"></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#0f172a', fontWeight: 800 }}>Kiểm Soát Truy Cập IP (IP Access Control)</h4>
              <p style={{ fontSize: '12px', margin: '2px 0 0', color: '#64748b' }}>
                Đồng bộ hóa 2 tầng: HAProxy L4/L7 Fast-Path & Coraza SPOA WAF Engine.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              }}
            >
              <i className="fa-solid fa-plus"></i> Thêm IP
            </button>
          </div>
        </div>

        {/* 3. Modern 2-Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', gap: '6px' }}>
          <button
            type="button"
            onClick={() => {
              setActiveSubTab('blacklist');
              setSearchTerm('');
            }}
            style={{
              padding: '9px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeSubTab === 'blacklist' ? '#fee2e2' : 'transparent',
              color: activeSubTab === 'blacklist' ? '#b91c1c' : '#64748b',
              border: 'none',
              borderBottom: activeSubTab === 'blacklist' ? '2px solid #ef4444' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            <i className="fa-solid fa-shield-xmark" style={{ fontSize: '14px' }}></i>
            <span>Blacklist</span>
            <span
              style={{
                fontSize: '10.5px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: activeSubTab === 'blacklist' ? '#ef4444' : '#e2e8f0',
                color: activeSubTab === 'blacklist' ? '#fff' : '#475569',
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
              padding: '9px 16px',
              fontSize: '12.5px',
              fontWeight: 700,
              cursor: 'pointer',
              background: activeSubTab === 'whitelist' ? '#dcfce7' : 'transparent',
              color: activeSubTab === 'whitelist' ? '#15803d' : '#64748b',
              border: 'none',
              borderBottom: activeSubTab === 'whitelist' ? '2px solid #10b981' : '2px solid transparent',
              borderRadius: '6px 6px 0 0',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              transition: 'all 0.15s',
            }}
          >
            <i className="fa-solid fa-shield-check" style={{ fontSize: '14px' }}></i>
            <span>Whitelist</span>
            <span
              style={{
                fontSize: '10.5px',
                padding: '2px 7px',
                borderRadius: '10px',
                background: activeSubTab === 'whitelist' ? '#10b981' : '#e2e8f0',
                color: activeSubTab === 'whitelist' ? '#fff' : '#475569',
                fontWeight: 800,
              }}
            >
              {whitelistRules.length}
            </span>
          </button>
        </div>

        {/* 4. Filter Toolbar with Search & Sub-filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
          {/* Search Box */}
          <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '380px' }}>
            <i
              className="fa-solid fa-magnifying-glass"
              style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}
            ></i>
            <input
              type="text"
              placeholder={activeSubTab === 'blacklist' ? 'Tìm IP, lý do, quốc gia...' : 'Tìm IP, ghi chú Whitelist...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                paddingLeft: '32px',
                height: '34px',
                fontSize: '12.5px',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                color: '#0f172a',
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute',
                  right: '9px',
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

          {/* Duration Filter Pills (Only for Blacklist) */}
          {activeSubTab === 'blacklist' && (
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <button
                type="button"
                style={{
                  fontSize: '11.5px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${filterDuration === 'all' ? '#2563eb' : '#cbd5e1'}`,
                  background: filterDuration === 'all' ? '#2563eb' : '#ffffff',
                  color: filterDuration === 'all' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setFilterDuration('all')}
              >
                <i className="fa-solid fa-list-ul"></i> Tất cả ({blacklistRules.length})
              </button>
              <button
                type="button"
                style={{
                  fontSize: '11.5px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${filterDuration === 'temporary' ? '#2563eb' : '#cbd5e1'}`,
                  background: filterDuration === 'temporary' ? '#2563eb' : '#ffffff',
                  color: filterDuration === 'temporary' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setFilterDuration('temporary')}
              >
                <i className="fa-solid fa-stopwatch"></i> Đếm ngược ({blacklistRules.filter((r) => r.expires_at).length})
              </button>
              <button
                type="button"
                style={{
                  fontSize: '11.5px',
                  padding: '4px 12px',
                  borderRadius: '6px',
                  border: `1px solid ${filterDuration === 'permanent' ? '#2563eb' : '#cbd5e1'}`,
                  background: filterDuration === 'permanent' ? '#2563eb' : '#ffffff',
                  color: filterDuration === 'permanent' ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
                onClick={() => setFilterDuration('permanent')}
              >
                <i className="fa-solid fa-lock"></i> Vĩnh viễn ({blacklistRules.filter((r) => !r.expires_at).length})
              </button>
            </div>
          )}
        </div>

        {/* 5. Data Table (Light Theme) */}
        <div style={{ marginTop: '14px', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ width: '220px', padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <i className="fa-solid fa-network-wired" style={{ marginRight: '6px', color: '#2563eb' }}></i>
                  Địa Chỉ IP / CIDR
                </th>
                <th style={{ width: '120px', padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <i className="fa-solid fa-shield" style={{ marginRight: '6px', color: '#2563eb' }}></i>
                  Chính Sách
                </th>
                {activeSubTab === 'blacklist' && (
                  <th style={{ width: '180px', padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                    <i className="fa-solid fa-hourglass-half" style={{ marginRight: '6px', color: '#2563eb' }}></i>
                    Thời Hạn (TTL)
                  </th>
                )}
                <th style={{ padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <i className="fa-solid fa-tag" style={{ marginRight: '6px', color: '#2563eb' }}></i>
                  Lý Do / Nguồn Phát Hiện
                </th>
                <th style={{ width: '150px', padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase' }}>
                  <i className="fa-solid fa-calendar-days" style={{ marginRight: '6px', color: '#2563eb' }}></i>
                  Thời Điểm Tạo
                </th>
                <th style={{ width: '120px', padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontWeight: 700, textTransform: 'uppercase', textAlign: 'center' }}>
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'blacklist' ? 6 : 5} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-solid fa-inbox" style={{ fontSize: '24px', marginBottom: '8px', display: 'block' }}></i>
                    Chưa có địa chỉ IP nào trong danh sách {activeSubTab === 'blacklist' ? 'Blacklist' : 'Whitelist'}
                  </td>
                </tr>
              ) : (
                filteredList.map((rule) => {
                  const isBlacklist = rule.rule_type === 'blacklist';
                  const isExpiringSoon = isBlacklist && rule.expires_at && (new Date(rule.expires_at).getTime() - now < 3600000);

                  return (
                    <tr
                      key={rule.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: '#ffffff',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>
                            {rule.ip}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(rule.ip)}
                            title="Sao chép IP"
                            style={{ background: 'none', border: 'none', color: copiedIP === rule.ip ? '#16a34a' : '#94a3b8', cursor: 'pointer', fontSize: '11px', padding: '2px' }}
                          >
                            <i className={copiedIP === rule.ip ? 'fa-solid fa-check' : 'fa-regular fa-copy'}></i>
                          </button>
                        </div>
                        {rule.country && (
                          <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                            {rule.flag || '🌐'} {rule.country}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '12px',
                            background: isBlacklist ? '#fee2e2' : '#dcfce7',
                            color: isBlacklist ? '#b91c1c' : '#15803d',
                            border: `1px solid ${isBlacklist ? '#fecaca' : '#bbf7d0'}`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <i className={`fa-solid ${isBlacklist ? 'fa-ban' : 'fa-circle-check'}`}></i>
                          {isBlacklist ? 'CẤM' : 'CHO PHÉP'}
                        </span>
                      </td>
                      {activeSubTab === 'blacklist' && (
                        <td style={{ padding: '12px 14px' }}>
                          {formatCountdown(rule.expires_at, rule.rule_type)}
                        </td>
                      )}
                      <td style={{ padding: '12px 14px', color: '#334155', fontSize: '12.5px' }}>
                        {rule.reason || <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Không có ghi chú</span>}
                      </td>
                      <td style={{ padding: '12px 14px', color: '#64748b', fontSize: '11.5px', fontFamily: 'monospace' }}>
                        {rule.created_at || '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                          {isBlacklist && rule.expires_at && onQuickExtend && (
                            <button
                              type="button"
                              onClick={() => onQuickExtend(rule.id, '15m')}
                              title="Gia hạn cấm thêm 15 phút"
                              style={{
                                padding: '4px 8px',
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
                          )}
                          <button
                            type="button"
                            onClick={() => onDeleteRule && onDeleteRule(rule.id, rule.ip)}
                            title="Gỡ bỏ IP khỏi danh sách"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid #fecaca',
                              background: '#fff',
                              color: '#dc2626',
                              fontSize: '12px',
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
    </div>
  );
}
