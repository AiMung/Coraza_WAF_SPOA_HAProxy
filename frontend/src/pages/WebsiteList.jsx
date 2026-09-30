import React, { useState, useEffect, useMemo } from 'react';
import { wafApi } from '../api/client';

export default function WebsiteList({ stats = {} }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWafMode, setFilterWafMode] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');
  const [copiedTarget, setCopiedTarget] = useState(null);
  const [pingStates, setPingStates] = useState({});
  const [pingingAll, setPingingAll] = useState(false);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    name: '', domain: '', upstream_target: '', port: 80, ssl_enabled: false, waf_mode: 'prevention',
  });
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const loadSites = async () => {
    try {
      setLoading(true);
      const data = await wafApi.sites();
      setSites(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Không thể tải danh sách website: ' + (err.message || err), 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSites();
    const interval = setInterval(loadSites, 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const q = searchTerm.toLowerCase().trim();
      const matchQuery = !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.domain && s.domain.toLowerCase().includes(q)) ||
        (s.upstream_target && s.upstream_target.toLowerCase().includes(q));
      if (!matchQuery) return false;
      if (filterWafMode !== 'all' && s.waf_mode !== filterWafMode) return false;
      if (filterHealth !== 'all' && s.health !== filterHealth) return false;
      return true;
    });
  }, [sites, searchTerm, filterWafMode, filterHealth]);

  // Ping
  const handleTestPing = async (site) => {
    setPingStates((prev) => ({ ...prev, [site.id]: { loading: true } }));
    try {
      const res = await wafApi.pingSite(site.id);
      setPingStates((prev) => ({ ...prev, [site.id]: { loading: false, latency: res.latency_ms, status: res.status, code: res.status_code, message: res.message } }));
    } catch (err) {
      setPingStates((prev) => ({ ...prev, [site.id]: { loading: false, status: 'down', message: err.message } }));
    }
  };

  const handlePingAll = async () => {
    if (sites.length === 0) return;
    setPingingAll(true);
    await Promise.allSettled(sites.map((s) => handleTestPing(s)));
    setPingingAll(false);
    showToast('Kiểm tra kết nối hoàn tất!');
  };

  // Modal
  const handleOpenAdd = () => { setEditingSite(null); setFormData({ name: '', domain: '', upstream_target: '', port: 80, ssl_enabled: false, waf_mode: 'prevention' }); setFormError(''); setShowModal(true); };
  const handleOpenEdit = (site) => { setEditingSite(site); setFormData({ name: site.name, domain: site.domain, upstream_target: site.upstream_target, port: site.port || 80, ssl_enabled: site.ssl_enabled || false, waf_mode: site.waf_mode || 'prevention' }); setFormError(''); setShowModal(true); };

  const handleSaveSite = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.domain.trim() || !formData.upstream_target.trim()) {
      setFormError('Vui lòng điền đầy đủ Tên, Tên miền và Máy chủ đích');
      return;
    }
    try {
      setActionLoading(true); setFormError('');
      if (editingSite) { await wafApi.updateSite(editingSite.id, formData); showToast(`Đã cập nhật ${formData.domain}`); }
      else { await wafApi.addSite(formData); showToast(`Đã thêm ${formData.domain} vào bảo vệ WAF`); }
      setShowModal(false); loadSites();
    } catch (err) { setFormError(err.message || 'Lỗi lưu website'); }
    finally { setActionLoading(false); }
  };

  const handleDeleteSite = async (site) => {
    if (!window.confirm(`Xóa "${site.domain}" khỏi bảo vệ WAF?`)) return;
    try { await wafApi.deleteSite(site.id); showToast(`Đã xóa ${site.domain}`); loadSites(); }
    catch (err) { showToast('Lỗi xóa: ' + (err.message || err), 'err'); }
  };

  const handleToggleWAF = async (site) => {
    const nextMode = site.waf_mode === 'prevention' ? 'bypass' : 'prevention';
    try { await wafApi.toggleSiteWAF(site.id, { waf_mode: nextMode }); showToast(`${site.domain} → ${nextMode.toUpperCase()}`); loadSites(); }
    catch (err) { showToast('Lỗi: ' + (err.message || err), 'err'); }
  };

  const handleCopyTarget = (target) => { navigator.clipboard.writeText(target); setCopiedTarget(target); setTimeout(() => setCopiedTarget(null), 1800); };

  const handleExportCSV = () => {
    const headers = ['ID','Tên','Domain','Upstream','Hợp Lệ','Bị Chặn','WAF Mode','SSL','Trạng Thái'];
    const rows = filteredSites.map((s) => {
      const valid = s.valid_requests ?? Math.max(0, (s.total_requests || 0) - (s.attacks_blocked || 0));
      const blocked = s.blocked_requests ?? (s.attacks_blocked || 0);
      return [s.id, `"${s.name}"`, `"${s.domain}"`, `"${s.upstream_target}"`, valid, blocked, s.waf_mode, s.ssl_enabled ? 'HTTPS' : 'HTTP', s.health === 'up' ? 'UP' : 'DOWN'];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const link = document.createElement('a'); link.href = encodeURI(csvContent); link.download = `websites_${new Date().toISOString().slice(0, 10)}.csv`; link.click();
  };

  // Totals
  const totalUp = sites.filter((s) => (pingStates[s.id]?.status || s.health) === 'up').length;
  const totalBlocked = sites.reduce((sum, s) => sum + (s.blocked_requests ?? (s.attacks_blocked || 0)), 0);

  // Inline styles
  const thStyle = { padding: '10px 14px', color: '#64748b', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' };
  const tdStyle = { padding: '10px 14px', fontSize: '12.5px', color: '#1e293b' };
  const btnSmall = { padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', border: '1px solid #e2e8f0', background: '#fff', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' };

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', color: '#0f172a' }}>
      {/* COMPACT TOOLBAR */}
      <div style={{
        background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px',
        padding: '12px 16px', marginBottom: '12px', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', flexWrap: 'wrap', gap: '10px',
      }}>
        {/* Left: Title + quick stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <i className="fa-solid fa-server" style={{ color: '#2563eb' }}></i>
            Website Protection
          </h3>
          <div style={{ display: 'flex', gap: '12px', fontSize: '11.5px', fontWeight: 600 }}>
            <span style={{ color: '#64748b' }}>{sites.length} sites</span>
            <span style={{ color: '#16a34a' }}>{totalUp} online</span>
            {totalBlocked > 0 && <span style={{ color: '#e11d48' }}>{totalBlocked.toLocaleString()} blocked</span>}
          </div>
        </div>

        {/* Right: Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', minWidth: '200px' }}>
            <i className="fa-solid fa-magnifying-glass" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '11px' }}></i>
            <input type="text" placeholder="Tìm kiếm..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', height: '32px', paddingLeft: '30px', borderRadius: '6px', border: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '12px', color: '#0f172a', outline: 'none' }}
            />
          </div>
          <select value={filterWafMode} onChange={(e) => setFilterWafMode(e.target.value)}
            style={{ height: '32px', background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '0 8px', fontWeight: 600 }}>
            <option value="all">Tất cả WAF</option>
            <option value="prevention">Prevention</option>
            <option value="detection">Detection</option>
            <option value="bypass">Bypass</option>
          </select>
          <select value={filterHealth} onChange={(e) => setFilterHealth(e.target.value)}
            style={{ height: '32px', background: '#f8fafc', color: '#334155', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px', padding: '0 8px', fontWeight: 600 }}>
            <option value="all">Tất cả</option>
            <option value="up">Online</option>
            <option value="down">Offline</option>
          </select>
          <button type="button" onClick={handlePingAll} disabled={pingingAll || sites.length === 0}
            style={{ ...btnSmall, border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0284c7' }}>
            <i className={`fa-solid fa-bolt ${pingingAll ? 'fa-spin' : ''}`}></i> Ping All
          </button>
          <button type="button" onClick={handleExportCSV} style={btnSmall}>
            <i className="fa-solid fa-download"></i> CSV
          </button>
          <button type="button" onClick={loadSites} style={btnSmall}>
            <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`}></i>
          </button>
          <button type="button" onClick={handleOpenAdd}
            style={{ ...btnSmall, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, boxShadow: '0 2px 6px rgba(16,185,129,0.3)' }}>
            <i className="fa-solid fa-plus"></i> Thêm Website
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ ...thStyle, width: '200px' }}>Website</th>
                <th style={{ ...thStyle, width: '180px' }}>Upstream</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Hợp lệ</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Bị chặn</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Ping</th>
                <th style={{ ...thStyle, width: '80px', textAlign: 'center' }}>Status</th>
                <th style={{ ...thStyle, width: '110px' }}>WAF Mode</th>
                <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}>SSL</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    <i className="fa-solid fa-server" style={{ fontSize: '28px', color: '#cbd5e1', display: 'block', marginBottom: '8px' }}></i>
                    {searchTerm ? `Không tìm thấy "${searchTerm}"` : 'Chưa có website nào. Nhấn "Thêm Website" để bắt đầu.'}
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => {
                  const ping = pingStates[site.id];
                  const isUp = (ping?.status || site.health) === 'up';
                  const latency = ping?.latency !== undefined ? `${ping.latency}ms` : `${site.latency_ms || 1}ms`;
                  const isPingLoading = ping?.loading;
                  const valid = site.valid_requests ?? Math.max(0, (site.total_requests || 0) - (site.attacks_blocked || 0));
                  const blocked = site.blocked_requests ?? (site.attacks_blocked || 0);

                  return (
                    <tr key={site.id} style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Website & Domain */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>{site.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                          <code style={{ fontSize: '11px', color: '#0284c7', fontFamily: 'var(--font-mono)' }}>{site.domain}</code>
                          <a href={`http://${site.domain}:${site.port || 80}/`} target="_blank" rel="noreferrer"
                            style={{ color: '#94a3b8', fontSize: '10px' }}>
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                          </a>
                        </div>
                      </td>

                      {/* Upstream */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <code style={{ fontSize: '11px', color: '#334155', fontFamily: 'var(--font-mono)', background: '#f1f5f9', padding: '2px 6px', borderRadius: '4px' }}>
                            {site.upstream_target}
                          </code>
                          <button type="button" onClick={() => handleCopyTarget(site.upstream_target)}
                            style={{ background: 'none', border: 'none', color: copiedTarget === site.upstream_target ? '#10b981' : '#94a3b8', cursor: 'pointer', padding: '1px 3px', fontSize: '10px' }}>
                            <i className={`fa-solid ${copiedTarget === site.upstream_target ? 'fa-check' : 'fa-copy'}`}></i>
                          </button>
                        </div>
                      </td>

                      {/* Valid */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#15803d', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {valid.toLocaleString()}
                        </span>
                      </td>

                      {/* Blocked */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: blocked > 0 ? '#e11d48' : '#94a3b8', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                          {blocked.toLocaleString()}
                        </span>
                      </td>

                      {/* Ping */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: isUp ? '#0284c7' : '#e11d48', fontFamily: 'var(--font-mono)', fontSize: '11.5px' }}>
                          {isPingLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '11px' }}></i> : latency}
                        </span>
                      </td>

                      {/* Status */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '10.5px', fontWeight: 700,
                          padding: '2px 8px', borderRadius: '10px',
                          background: isUp ? '#ecfdf5' : '#fef2f2',
                          color: isUp ? '#15803d' : '#b91c1c',
                          border: isUp ? '1px solid #a7f3d0' : '1px solid #fecaca',
                        }}>
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isUp ? '#10b981' : '#ef4444' }}></span>
                          {isUp ? 'UP' : 'DOWN'}
                        </span>
                      </td>

                      {/* WAF Mode */}
                      <td style={tdStyle}>
                        <span onClick={() => handleToggleWAF(site)} title="Click để chuyển chế độ"
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700,
                            padding: '3px 8px', borderRadius: '8px', cursor: 'pointer',
                            background: site.waf_mode === 'prevention' ? '#dcfce7' : site.waf_mode === 'detection' ? '#fef3c7' : '#f1f5f9',
                            color: site.waf_mode === 'prevention' ? '#15803d' : site.waf_mode === 'detection' ? '#b45309' : '#64748b',
                            border: site.waf_mode === 'prevention' ? '1px solid #bbf7d0' : site.waf_mode === 'detection' ? '1px solid #fde68a' : '1px solid #cbd5e1',
                          }}>
                          <i className={site.waf_mode === 'prevention' ? 'fa-solid fa-shield-halved' : site.waf_mode === 'detection' ? 'fa-solid fa-eye' : 'fa-solid fa-ban'} style={{ fontSize: '10px' }}></i>
                          {site.waf_mode === 'prevention' ? 'Prevention' : site.waf_mode === 'detection' ? 'Detection' : 'Bypass'}
                        </span>
                      </td>

                      {/* SSL */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {site.ssl_enabled ?
                          <span style={{ color: '#16a34a', fontSize: '11px', fontWeight: 600 }}><i className="fa-solid fa-lock"></i></span> :
                          <span style={{ color: '#cbd5e1', fontSize: '11px' }}><i className="fa-solid fa-lock-open"></i></span>
                        }
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '4px' }}>
                          <button type="button" onClick={() => handleTestPing(site)} disabled={isPingLoading} title="Ping"
                            style={{ ...btnSmall, border: '1px solid #bae6fd', background: '#f0f9ff', color: '#0284c7', padding: '3px 6px' }}>
                            <i className="fa-solid fa-bolt"></i>
                          </button>
                          <button type="button" onClick={() => handleOpenEdit(site)} title="Sửa"
                            style={{ ...btnSmall, padding: '3px 6px' }}>
                            <i className="fa-solid fa-pen"></i>
                          </button>
                          <button type="button" onClick={() => handleDeleteSite(site)} title="Xóa"
                            style={{ ...btnSmall, padding: '3px 6px', border: '1px solid #fecaca', background: '#fff1f2', color: '#e11d48' }}>
                            <i className="fa-solid fa-trash"></i>
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

      {/* MODAL */}
      {showModal && (
        <div onClick={() => setShowModal(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '16px' }}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: '14px', maxWidth: '500px', width: '100%', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', overflow: 'hidden', animation: 'fadeInPanel 0.2s ease' }}>
            {/* Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                <i className="fa-solid fa-globe" style={{ marginRight: '8px', color: '#2563eb' }}></i>
                {editingSite ? 'Chỉnh Sửa Website' : 'Thêm Website Mới'}
              </h4>
              <button type="button" onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '16px', cursor: 'pointer' }}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSite}>
              <div style={{ padding: '20px' }}>
                {formError && (
                  <div style={{ background: '#fff1f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <i className="fa-solid fa-triangle-exclamation"></i> {formError}
                  </div>
                )}

                {[
                  { label: 'Tên Website', key: 'name', placeholder: 'ví dụ: Web Bán Hàng', required: true },
                  { label: 'Domain / Hostname', key: 'domain', placeholder: 'ví dụ: shop.company.vn', required: true, hint: 'HAProxy dùng Host header này để định tuyến.' },
                  { label: 'Upstream Target', key: 'upstream_target', placeholder: 'ví dụ: 192.168.1.50:80', required: true, hint: 'IP:Port hoặc tên container.' },
                ].map(({ label, key, placeholder, required, hint }) => (
                  <div key={key} style={{ marginBottom: '14px' }}>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>
                      {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
                    </label>
                    <input type="text" required={required} placeholder={placeholder} value={formData[key]}
                      onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                      style={{ width: '100%', height: '36px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', padding: '0 12px', fontSize: '12.5px' }}
                    />
                    {hint && <small style={{ color: '#94a3b8', fontSize: '10.5px', marginTop: '3px', display: 'block' }}>{hint}</small>}
                  </div>
                ))}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>Port</label>
                    <input type="number" value={formData.port} onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                      style={{ width: '100%', height: '36px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', padding: '0 12px', fontSize: '12.5px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>WAF Mode</label>
                    <select value={formData.waf_mode} onChange={(e) => setFormData({ ...formData, waf_mode: e.target.value })}
                      style={{ width: '100%', height: '36px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '8px', color: '#0f172a', padding: '0 10px', fontSize: '12px', fontWeight: 600 }}>
                      <option value="prevention">🛡️ Prevention</option>
                      <option value="detection">👁️ Detection</option>
                      <option value="bypass">⚪ Bypass</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input type="checkbox" id="ssl_chk" checked={formData.ssl_enabled} onChange={(e) => setFormData({ ...formData, ssl_enabled: e.target.checked })}
                    style={{ cursor: 'pointer', width: '15px', height: '15px' }} />
                  <label htmlFor="ssl_chk" style={{ fontSize: '12px', color: '#334155', cursor: 'pointer' }}>Kích hoạt SSL / TLS (HTTPS)</label>
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#f8fafc' }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ ...btnSmall, padding: '7px 14px', fontWeight: 600 }}>Hủy</button>
                <button type="submit" disabled={actionLoading}
                  style={{ ...btnSmall, padding: '7px 16px', border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, boxShadow: '0 2px 8px rgba(16,185,129,0.3)' }}>
                  <i className={`fa-solid ${actionLoading ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  {editingSite ? 'Lưu' : 'Thêm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '24px', right: '24px', zIndex: 99999,
          background: toast.kind === 'err' ? '#ef4444' : '#10b981', color: '#fff',
          padding: '10px 16px', borderRadius: '8px', fontWeight: 700, fontSize: '12.5px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', gap: '8px',
          animation: 'fadeInPanel 0.2s ease',
        }}>
          <i className={`fa-solid ${toast.kind === 'err' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
          {toast.message}
        </div>
      )}
    </div>
  );
}
