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
            color: '#10b981',
            fontSize: '11.5px',
            fontWeight: 600,
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '3px 9px',
            borderRadius: '12px',
            border: '1px solid rgba(16, 185, 129, 0.25)',
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
            color: '#f59e0b',
            fontSize: '11.5px',
            fontWeight: 600,
            background: 'rgba(245, 158, 11, 0.1)',
            padding: '3px 9px',
            borderRadius: '12px',
            border: '1px solid rgba(245, 158, 11, 0.25)',
          }}
        >
          <i className="fa-solid fa-lock"></i> Vĩnh viễn
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
            color: '#ef4444',
            fontSize: '11px',
            fontWeight: 600,
            background: 'rgba(239, 68, 68, 0.12)',
            padding: '3px 8px',
            borderRadius: '12px',
            border: '1px solid rgba(239, 68, 68, 0.3)',
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
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '11.5px',
          fontWeight: 700,
          color: '#38bdf8',
          background: 'rgba(56, 189, 248, 0.12)',
          padding: '3px 10px',
          borderRadius: '12px',
          border: '1px solid rgba(56, 189, 248, 0.3)',
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
    <div className="tab-panel active">
      {/* 1. Top Enterprise KPI Metrics Strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ef4444', fontSize: '18px' }}>
            <i className="fa-solid fa-ban"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Blacklist Đang Cấm</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>{blacklistRules.length} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>IP</span></div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', fontSize: '18px' }}>
            <i className="fa-solid fa-hourglass-half"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Sắp Hết Hạn (&lt;1h)</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>{expiringSoonCount} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>IP</span></div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(168, 85, 247, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#c084fc', fontSize: '18px' }}>
            <i className="fa-solid fa-lock"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Cấm Vĩnh Viễn</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#e879f9', marginTop: '2px' }}>{permanentCount} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>IP</span></div>
          </div>
        </div>

        <div style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '14px 18px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '18px' }}>
            <i className="fa-solid fa-circle-check"></i>
          </div>
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 600, letterSpacing: '0.5px' }}>Whitelist Tin Cậy</div>
            <div style={{ fontSize: '20px', fontWeight: 800, color: '#34d399', marginTop: '2px' }}>{whitelistRules.length} <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 400 }}>IP</span></div>
          </div>
        </div>
      </div>

      {/* 2. Main Card */}
      <div className="panel-card" style={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: '10px', padding: '16px 20px' }}>
        {/* Head Bar */}
        <div className="panel-head" style={{ flexWrap: 'wrap', gap: '12px', borderBottom: '1px solid #1e293b', paddingBottom: '12px', marginBottom: '14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#10b981', fontSize: '16px' }}>
              <i className="fa-solid fa-sliders"></i>
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '15px', color: '#f8fafc', fontWeight: 800 }}>Kiểm Soát Truy Cập IP (IP Access Control)</h4>
              <p style={{ fontSize: '11.5px', margin: '2px 0 0', color: '#94a3b8' }}>
                Đồng bộ hóa 2 tầng: HAProxy L4/L7 Fast-Path & Coraza SPOA WAF Engine.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="btn-outline-sm"
              onClick={handleExportList}
              title="Xuất danh sách IP ra file text"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              <i className="fa-solid fa-file-arrow-down"></i> Xuất .TXT
            </button>

            <button className="btn-green" onClick={onOpenAddModal} style={{ fontSize: '12px', padding: '6px 14px' }}>
              <i className="fa-solid fa-plus"></i> Thêm IP
            </button>
          </div>
        </div>

        {/* 3. Modern 2-Tab Navigation */}
        <div style={{ display: 'flex', borderBottom: '1px solid #1e293b', marginTop: '16px', gap: '6px' }}>
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
              background: activeSubTab === 'blacklist' ? 'rgba(239, 68, 68, 0.12)' : 'transparent',
              color: activeSubTab === 'blacklist' ? '#f87171' : '#94a3b8',
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
                background: activeSubTab === 'blacklist' ? '#ef4444' : '#334155',
                color: '#fff',
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
              background: activeSubTab === 'whitelist' ? 'rgba(16, 185, 129, 0.12)' : 'transparent',
              color: activeSubTab === 'whitelist' ? '#34d399' : '#94a3b8',
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
                background: activeSubTab === 'whitelist' ? '#10b981' : '#334155',
                color: '#fff',
                fontWeight: 800,
              }}
            >
              {whitelistRules.length}
            </span>
          </button>
        </div>

        {/* 4. Filter Toolbar with Search & Sub-filters */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '14px', flexWrap: 'wrap', gap: '10px' }}>
          {/* Search Box with icon */}
          <div style={{ position: 'relative', minWidth: '260px', flex: '1', maxWidth: '380px' }}>
            <i
              className="fa-solid fa-magnifying-glass"
              style={{ position: 'absolute', left: '11px', top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontSize: '12px' }}
            ></i>
            <input
              type="text"
              className="form-ctrl"
              placeholder={activeSubTab === 'blacklist' ? 'Tìm IP, lý do, quốc gia...' : 'Tìm IP, ghi chú Whitelist...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', paddingLeft: '32px', height: '34px', fontSize: '12px' }}
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
                className={`btn-sm ${filterDuration === 'all' ? 'btn-green' : 'btn-outline'}`}
                style={{ fontSize: '11.5px', padding: '3px 10px', height: '32px' }}
                onClick={() => setFilterDuration('all')}
              >
                <i className="fa-solid fa-list-ul"></i> Tất cả ({blacklistRules.length})
              </button>
              <button
                type="button"
                className={`btn-sm ${filterDuration === 'temporary' ? 'btn-green' : 'btn-outline'}`}
                style={{ fontSize: '11.5px', padding: '3px 10px', height: '32px' }}
                onClick={() => setFilterDuration('temporary')}
              >
                <i className="fa-solid fa-stopwatch"></i> Đếm ngược ({blacklistRules.filter((r) => r.expires_at).length})
              </button>
              <button
                type="button"
                className={`btn-sm ${filterDuration === 'permanent' ? 'btn-green' : 'btn-outline'}`}
                style={{ fontSize: '11.5px', padding: '3px 10px', height: '32px' }}
                onClick={() => setFilterDuration('permanent')}
              >
                <i className="fa-solid fa-lock"></i> Vĩnh viễn ({blacklistRules.filter((r) => !r.expires_at).length})
              </button>
            </div>
          )}
        </div>

        {/* 5. Data Table */}
        {/* 5. Data Table */}
        <div className="table-container" style={{ marginTop: '14px', overflowX: 'auto' }}>
          <table className="aawaf-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#1e293b', borderBottom: '1px solid #334155' }}>
                <th style={{ width: '220px', padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                  <i className="fa-solid fa-network-wired" style={{ marginRight: '6px', color: '#64748b' }}></i>
                  Địa Chỉ IP / CIDR
                </th>
                <th style={{ width: '120px', padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                  <i className="fa-solid fa-shield" style={{ marginRight: '6px', color: '#64748b' }}></i>
                  Chính Sách
                </th>
                {activeSubTab === 'blacklist' && (
                  <th style={{ width: '180px', padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                    <i className="fa-solid fa-hourglass-half" style={{ marginRight: '6px', color: '#64748b' }}></i>
                    Thời Hạn (TTL)
                  </th>
                )}
                <th style={{ padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                  <i className="fa-solid fa-tag" style={{ marginRight: '6px', color: '#64748b' }}></i>
                  Lý Do / Nguồn Phát Hiện
                </th>
                <th style={{ width: '140px', padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                  <i className="fa-solid fa-clock" style={{ marginRight: '6px', color: '#64748b' }}></i>
                  Thời Điểm Tạo
                </th>
                <th style={{ width: '130px', textAlign: 'center', padding: '10px 12px', color: '#94a3b8', fontSize: '11.5px' }}>
                  <i className="fa-solid fa-bolt" style={{ marginRight: '6px', color: '#64748b' }}></i>
                  Thao Tác
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredList.length === 0 ? (
                <tr>
                  <td colSpan={activeSubTab === 'blacklist' ? 6 : 5} style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                    <i
                      className={`fa-solid ${activeSubTab === 'blacklist' ? 'fa-shield-xmark' : 'fa-shield-check'}`}
                      style={{ fontSize: '32px', display: 'block', marginBottom: '10px', color: '#334155' }}
                    ></i>
                    {searchTerm
                      ? `Không tìm thấy kết quả nào khớp với "${searchTerm}".`
                      : activeSubTab === 'blacklist'
                      ? 'Danh sách Blacklist hiện đang trống.'
                      : 'Danh sách Whitelist hiện đang trống.'}
                  </td>
                </tr>
              ) : (
                filteredList.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px' }}>{r.flag || '🌐'}</span>
                        <code
                          style={{
                            fontSize: '12.5px',
                            fontWeight: 700,
                            color: activeSubTab === 'blacklist' ? '#f87171' : '#34d399',
                            fontFamily: 'var(--font-mono, monospace)',
                          }}
                        >
                          {r.ip}
                        </code>
                        <button
                          type="button"
                          title={copiedIP === r.ip ? 'Đã chép!' : 'Sao chép IP'}
                          onClick={() => handleCopy(r.ip)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: copiedIP === r.ip ? '#10b981' : '#64748b',
                            cursor: 'pointer',
                            padding: '2px 4px',
                            fontSize: '11px',
                          }}
                        >
                          <i className={`fa-solid ${copiedIP === r.ip ? 'fa-check' : 'fa-copy'}`}></i>
                        </button>
                      </div>
                    </td>

                    <td>
                      <span className={`badge-status ${r.rule_type === 'blacklist' ? 'red' : 'green'}`} style={{ fontSize: '11px' }}>
                        {r.rule_type === 'blacklist' ? '⛔ CẤM' : '⚪ CHO PHÉP'}
                      </span>
                    </td>

                    {activeSubTab === 'blacklist' && <td>{formatCountdown(r.expires_at, r.rule_type)}</td>}

                    <td style={{ color: '#cbd5e1', fontSize: '12px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        {r.reason || 'Chính sách an ninh thủ công'}
                      </span>
                    </td>

                    <td style={{ color: '#94a3b8', fontSize: '11.5px', fontFamily: 'var(--font-mono, monospace)' }}>
                      {r.created_at ? r.created_at.slice(5, 16) : 'Mới tạo'}
                    </td>

                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                        {/* Quick Extend Button for temporary blacklisted IPs */}
                        {activeSubTab === 'blacklist' && r.expires_at && onQuickExtend && (
                          <button
                            type="button"
                            className="btn-sm"
                            title="Gia hạn thêm 15 phút"
                            onClick={() => onQuickExtend(r.ip, '15m')}
                            style={{
                              background: 'rgba(56, 189, 248, 0.1)',
                              color: '#38bdf8',
                              border: '1px solid rgba(56, 189, 248, 0.25)',
                              padding: '2px 6px',
                              fontSize: '10.5px',
                              cursor: 'pointer',
                              borderRadius: '4px',
                            }}
                          >
                            +15m
                          </button>
                        )}

                        {/* Delete/Unban button */}
                        <button
                          type="button"
                          className="btn-sm"
                          style={{
                            background: 'rgba(239, 68, 68, 0.1)',
                            color: '#f87171',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            padding: '3px 7px',
                            fontSize: '11px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                          }}
                          onClick={() => onDeleteRule && onDeleteRule(r.id)}
                          title="Xóa quy tắc này"
                        >
                          <i className="fa-solid fa-trash-can"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
