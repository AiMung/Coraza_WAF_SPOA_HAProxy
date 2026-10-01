import React, { useState, useEffect, useMemo } from 'react';
import { wafApi } from '../api/client';

// Resilient Clipboard Copy Helper (works on HTTP, LAN IPs, and HTTPS)
const copyToClipboard = async (text) => {
  if (!text) return false;
  try {
    if (navigator?.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) {
    // Fall through to fallback
  }

  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    textArea.setAttribute('readonly', '');
    document.body.appendChild(textArea);
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    return successful;
  } catch (err) {
    console.error('Fallback copy failed:', err);
    return false;
  }
};

export default function WebsiteList({ stats = {} }) {
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWafMode, setFilterWafMode] = useState('all');
  const [filterHealth, setFilterHealth] = useState('all');
  const [copiedTarget, setCopiedTarget] = useState(null);
  const [pingStates, setPingStates] = useState({});
  const [pingingAll, setPingingAll] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  // Test WAF States
  const [testingWafStates, setTestingWafStates] = useState({});
  const [testModalData, setTestModalData] = useState(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingSite, setEditingSite] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    domain: '',
    upstream_target: '',
    port: 80,
    ssl_enabled: false,
    waf_mode: 'prevention',
  });
  const [formError, setFormError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modalPingLoading, setModalPingLoading] = useState(false);
  const [modalPingResult, setModalPingResult] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3200);
  };

  const loadSites = async (showSpinner = false) => {
    try {
      if (showSpinner) setLoading(true);
      const data = await wafApi.sites();
      setSites(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Không thể tải danh sách website: ' + (err.message || err), 'err');
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  useEffect(() => {
    loadSites(sites.length === 0);
    const interval = setInterval(() => loadSites(false), 20000);
    return () => clearInterval(interval);
  }, []);

  const filteredSites = useMemo(() => {
    return sites.filter((s) => {
      const q = searchTerm.toLowerCase().trim();
      const matchQuery =
        !q ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        (s.domain && s.domain.toLowerCase().includes(q)) ||
        (s.upstream_target && s.upstream_target.toLowerCase().includes(q));
      if (!matchQuery) return false;
      if (filterWafMode !== 'all' && s.waf_mode !== filterWafMode) return false;
      if (filterHealth !== 'all' && s.health !== filterHealth) return false;
      return true;
    });
  }, [sites, searchTerm, filterWafMode, filterHealth]);

  // Ping upstream target
  const handleTestPing = async (site) => {
    setPingStates((prev) => ({ ...prev, [site.id]: { loading: true } }));
    try {
      const res = await wafApi.pingSite(site.id);
      setPingStates((prev) => ({
        ...prev,
        [site.id]: {
          loading: false,
          latency: res.latency_ms,
          status: res.status,
          code: res.status_code,
          message: res.message,
        },
      }));
    } catch (err) {
      setPingStates((prev) => ({
        ...prev,
        [site.id]: { loading: false, status: 'down', message: err.message },
      }));
    }
  };

  const handlePingAll = async () => {
    if (sites.length === 0) return;
    setPingingAll(true);
    await Promise.allSettled(sites.map((s) => handleTestPing(s)));
    setPingingAll(false);
    showToast('Kiểm tra kết nối toàn bộ máy chủ hoàn tất!');
  };

  // Test WAF Live Enforcement
  const handleTestWAF = async (site) => {
    setTestingWafStates((prev) => ({ ...prev, [site.id]: true }));
    try {
      const res = await wafApi.testWAFSite(site.id);
      setTestModalData({
        ...res,
        siteName: site.name,
      });
    } catch (err) {
      showToast('Lỗi kiểm tra WAF: ' + (err.message || err), 'err');
    } finally {
      setTestingWafStates((prev) => ({ ...prev, [site.id]: false }));
    }
  };

  // Quick Change WAF Mode (3-Way: Prevention, Detection, Bypass)
  const handleChangeWafMode = async (site, targetMode) => {
    if (site.waf_mode === targetMode) return;
    try {
      await wafApi.toggleSiteWAF(site.id, { waf_mode: targetMode });
      const modeLabels = {
        prevention: '🛡️ Prevention (Chặn đứng 403)',
        detection: '👁️ Detection (Giám sát / Ghi log)',
        bypass: '⚪ Bypass (Tắt lọc WAF)',
      };
      showToast(`${site.domain} → ${modeLabels[targetMode] || targetMode}`);
      loadSites();
    } catch (err) {
      showToast('Lỗi chuyển chế độ: ' + (err.message || err), 'err');
    }
  };

  // Modal Handlers
  const handleOpenAdd = () => {
    setEditingSite(null);
    setFormData({
      name: '',
      domain: '',
      upstream_target: '',
      port: 80,
      ssl_enabled: false,
      waf_mode: 'prevention',
    });
    setFormError('');
    setModalPingResult(null);
    setShowModal(true);
  };

  const handleOpenEdit = (site) => {
    setEditingSite(site);
    setFormData({
      name: site.name,
      domain: site.domain,
      upstream_target: site.upstream_target,
      port: site.port || 80,
      ssl_enabled: site.ssl_enabled || false,
      waf_mode: site.waf_mode || 'prevention',
    });
    setFormError('');
    setModalPingResult(null);
    setShowModal(true);
  };

  const handleTestModalTarget = async () => {
    if (!formData.upstream_target.trim()) {
      setFormError('Vui lòng nhập Máy chủ Web gốc trước khi kiểm tra');
      return;
    }
    setModalPingLoading(true);
    setFormError('');
    setModalPingResult(null);
    try {
      // Real TCP ping to the upstream target via backend API
      const res = await wafApi.pingUpstream(formData.upstream_target.trim());
      setModalPingResult({
        status: res.status,
        latency: res.latency_ms,
        message: res.status === 'up'
          ? `✅ Kết nối thành công! Độ trễ TCP: ${res.latency_ms}ms — Máy chủ đang hoạt động.`
          : `❌ Không thể kết nối: ${res.message}`,
      });
    } catch (err) {
      setModalPingResult({ status: 'down', message: `❌ Lỗi kiểm tra: ${err.message}` });
    } finally {
      setModalPingLoading(false);
    }
  };

  const handleSaveSite = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.domain.trim() || !formData.upstream_target.trim()) {
      setFormError('Vui lòng điền đầy đủ Tên Website, Tên miền và Máy chủ đích');
      return;
    }
    try {
      setActionLoading(true);
      setFormError('');
      if (editingSite) {
        await wafApi.updateSite(editingSite.id, formData);
        showToast(`Đã cập nhật cấu hình ${formData.domain}`);
      } else {
        await wafApi.addSite(formData);
        showToast(`Đã thêm ${formData.domain} vào hệ thống WAF`);
      }
      setShowModal(false);
      loadSites();
    } catch (err) {
      setFormError(err.message || 'Lỗi lưu website');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteSite = async (site) => {
    if (!window.confirm(`Xác nhận xóa "${site.domain}" khỏi diện bảo vệ WAF?`)) return;
    try {
      await wafApi.deleteSite(site.id);
      showToast(`Đã xóa ${site.domain}`);
      loadSites();
    } catch (err) {
      showToast('Lỗi xóa website: ' + (err.message || err), 'err');
    }
  };

  const handleCopyTarget = async (target) => {
    const ok = await copyToClipboard(target);
    if (ok) {
      setCopiedTarget(target);
      setTimeout(() => setCopiedTarget(null), 1800);
    }
  };

  const handleExportCSV = () => {
    if (filteredSites.length === 0) {
      alert('Không có dữ liệu website để xuất.');
      return;
    }
    const headers = [
      'STT (ID)',
      'Tên Website',
      'Tên Miền (Domain)',
      'Máy Chủ Đích (Upstream Target)',
      'Yêu Cầu Hợp Lệ',
      'Tấn Công Bị Chặn',
      'Chế Độ WAF',
      'Giao Thức SSL',
      'Trạng Thái Máy Chủ',
    ];
    const rows = filteredSites.map((s) => {
      const valid = s.valid_requests ?? Math.max(0, (s.total_requests || 0) - (s.attacks_blocked || 0));
      const blocked = s.blocked_requests ?? (s.attacks_blocked || 0);
      return [
        s.id,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${(s.domain || '').replace(/"/g, '""')}"`,
        `"${(s.upstream_target || '').replace(/"/g, '""')}"`,
        valid,
        blocked,
        s.waf_mode || 'prevention',
        s.ssl_enabled ? 'HTTPS' : 'HTTP',
        (pingStates[s.id]?.status || s.health) === 'up' ? 'UP' : 'DOWN',
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `WAF_Protected_Websites_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calculated Totals
  const totalUp = sites.filter((s) => (pingStates[s.id]?.status || s.health) === 'up').length;
  const totalPrevention = sites.filter((s) => s.waf_mode === 'prevention').length;
  const totalDetection = sites.filter((s) => s.waf_mode === 'detection').length;
  const totalBypass = sites.filter((s) => s.waf_mode === 'bypass').length;
  const totalBlocked = sites.reduce((sum, s) => sum + (s.blocked_requests ?? (s.attacks_blocked || 0)), 0);

  // Table styling
  const thStyle = {
    padding: '11px 14px',
    color: '#475569',
    fontSize: '11px',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    whiteSpace: 'nowrap',
  };
  const tdStyle = { padding: '12px 14px', fontSize: '12.5px', color: '#1e293b' };
  const btnSmall = {
    padding: '5px 10px',
    borderRadius: '6px',
    fontSize: '11.5px',
    cursor: 'pointer',
    border: '1px solid #cbd5e1',
    background: '#ffffff',
    color: '#475569',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    fontWeight: 600,
    transition: 'all 0.15s ease',
  };

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', color: '#0f172a' }}>
      {/* 1. TOP ENTERPRISE KPI CARDS */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
          marginBottom: '14px',
        }}
      >
        {/* Card 1: Tổng Website Bảo Vệ */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>
              Tổng Website Bảo Vệ
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#0f172a', marginTop: '4px', letterSpacing: '-0.5px' }}>
              {sites.length} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>VHost</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-server" style={{ fontSize: '10px', color: '#2563eb' }}></i>
              <span>Reverse Proxy Gateway tập trung</span>
            </div>
          </div>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' }}>
            Multi-Tenant
          </span>
        </div>

        {/* Card 2: Máy Chủ Đích Hoạt Động */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>
              Máy Chủ Đích Trực Tuyến
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#059669', marginTop: '4px', letterSpacing: '-0.5px' }}>
              {totalUp} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>/ {sites.length} UP</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-heart-pulse" style={{ fontSize: '10px', color: '#10b981' }}></i>
              <span>TCP Health Ping tự động</span>
            </div>
          </div>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }}>
            Origin Health
          </span>
        </div>

        {/* Card 3: Chế Độ Chặn Chủ Động */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>
              Chế Độ Chặn (Prevention)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#dc2626', marginTop: '4px', letterSpacing: '-0.5px' }}>
              {totalPrevention} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>active</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-shield-halved" style={{ fontSize: '10px', color: '#dc2626' }}></i>
              <span>Chặn 403 khi phát hiện mã độc</span>
            </div>
          </div>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' }}>
            Zero Bypass
          </span>
        </div>

        {/* Card 4: Chế Độ Giám Sát */}
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #e2e8f0',
            borderRadius: '10px',
            padding: '16px 18px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
          }}
        >
          <div>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', color: '#64748b', fontWeight: 700, letterSpacing: '0.5px' }}>
              Chế Độ Giám Sát (Detection)
            </div>
            <div style={{ fontSize: '24px', fontWeight: 800, color: '#d97706', marginTop: '4px', letterSpacing: '-0.5px' }}>
              {totalDetection} <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 500 }}>monitor</span>
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <i className="fa-solid fa-eye" style={{ fontSize: '10px', color: '#d97706' }}></i>
              <span>Ghi log & thông báo Telegram</span>
            </div>
          </div>
          <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '6px', background: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }}>
            Safe Dry-Run
          </span>
        </div>
      </div>

      {/* 2. REVERSE PROXY ARCHITECTURE & ONBOARDING GUIDE (Collapsible) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '14px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#f0fdf4',
                color: '#15803d',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                border: '1px solid #bbf7d0',
              }}
            >
              <i className="fa-solid fa-network-wired"></i>
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a' }}>
                Kiến Trúc Reverse Proxy Gateway & Hướng Dẫn Đưa Website Vào Bảo Vệ
              </div>
              <div style={{ fontSize: '11.5px', color: '#64748b' }}>
                Mọi lưu lượng đi qua HAProxy (Port 80/443) → Coraza SPOA WAF L7 → Máy Chủ Web Gốc (Origin LAN)
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            style={{
              padding: '5px 10px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#f8fafc',
              color: '#334155',
              fontSize: '11.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>{showGuide ? 'Ẩn Hướng Dẫn' : 'Xem Chi Tiết'}</span>
            <i className={`fa-solid ${showGuide ? 'fa-chevron-up' : 'fa-chevron-down'}`}></i>
          </button>
        </div>

        {showGuide && (
          <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid #f1f5f9', animation: 'fadeInPanel 0.2s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#0284c7' }}>
                  <i className="fa-solid fa-1"></i> Bước 1: Trỏ DNS Domain
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: 1.5 }}>
                  Tạo bản ghi <strong>A</strong> hoặc <strong>CNAME</strong> của website (ví dụ: <code>erp.company.com</code>) trỏ về địa chỉ IP của máy chủ WAF này (<code>192.168.246.100</code>).
                </p>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#16a34a' }}>
                  <i className="fa-solid fa-2"></i> Bước 2: Khai Báo Máy Chủ Đích
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: 1.5 }}>
                  Nhấn <strong>"Thêm Website"</strong>, điền Domain và địa chỉ <strong>Máy chủ Web gốc</strong> trong mạng nội bộ (ví dụ: <code>192.168.1.50:8080</code> hoặc tên container <code>protected-app:80</code>).
                </p>
              </div>

              <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 700, color: '#7c3aed' }}>
                  <i className="fa-solid fa-3"></i> Bước 3: Lựa Chọn Chế Độ WAF
                </div>
                <p style={{ margin: '6px 0 0', fontSize: '11.5px', color: '#475569', lineHeight: 1.5 }}>
                  Chọn <strong>Prevention</strong> để chặn đứng tấn công bằng mã lỗi 403, hoặc <strong>Detection</strong> để theo dõi ghi nhận log trước khi kích hoạt chặn chính thức.
                </p>
              </div>
            </div>

            {/* LAN Demo Scenario */}
            <div style={{ marginTop: '14px', background: '#0f172a', borderRadius: '10px', padding: '16px 18px', color: '#f1f5f9' }}>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#34d399', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <i className="fa-solid fa-flask"></i>
                Kịch Bản Demo: Bảo Vệ Website trong Mạng LAN Nội Bộ
              </div>
              <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '11px', color: '#94a3b8', lineHeight: 1.8 }}>
                <div style={{ color: '#64748b', marginBottom: '6px' }}># Ví dụ: Bảo vệ web app ERP chạy tại 192.168.1.50:8080 trong mạng nội bộ</div>
                <div><span style={{ color: '#f59e0b' }}>Domain:    </span><span style={{ color: '#34d399' }}>erp.company.vn</span><span style={{ color: '#64748b' }}>  (trỏ DNS A → 192.168.246.100 = IP máy WAF)</span></div>
                <div><span style={{ color: '#f59e0b' }}>Upstream:  </span><span style={{ color: '#60a5fa' }}>192.168.1.50:8080</span><span style={{ color: '#64748b' }}>  (IP server ERP trong LAN, ẩn hoàn toàn với internet)</span></div>
                <div><span style={{ color: '#f59e0b' }}>WAF Mode:  </span><span style={{ color: '#10b981' }}>Prevention</span><span style={{ color: '#64748b' }}>  (chặn đứng SQLi/XSS/LFI bằng 403)</span></div>
                <div style={{ marginTop: '10px', color: '#64748b' }}># Luồng request thực tế:</div>
                <div>
                  <span style={{ color: '#fbbf24' }}>[Internet / Kẻ tấn công]</span>
                  <span style={{ color: '#475569' }}> → </span>
                  <span style={{ color: '#34d399' }}>[WAF HAProxy :80]</span>
                  <span style={{ color: '#475569' }}> → </span>
                  <span style={{ color: '#60a5fa' }}>[Coraza SPOA :9000]</span>
                  <span style={{ color: '#475569' }}> → </span>
                  <span style={{ color: '#a78bfa' }}>[ERP Server :8080 LAN]</span>
                </div>
                <div style={{ marginTop: '6px', color: '#64748b' }}># Demo nhanh: Bắn XSS payload qua WAF (Test WAF button)</div>
                <div><span style={{ color: '#f87171' }}>curl -A "sqlmap/1.6" http://erp.company.vn/</span><span style={{ color: '#64748b' }}> → 403 Forbidden (X-Blocked-By: aaWAF-Scanner-Shield)</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. TOOLBAR */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '12px 16px',
          marginBottom: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '10px',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)',
        }}
      >
        {/* Left: Search Box */}
        <div style={{ position: 'relative', minWidth: '240px', maxWidth: '340px', flex: 1 }}>
          <i
            className="fa-solid fa-magnifying-glass"
            style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '11px' }}
          ></i>
          <input
            type="text"
            placeholder="Tìm theo tên website, domain, IP upstream..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              height: '34px',
              paddingLeft: '32px',
              paddingRight: '12px',
              borderRadius: '6px',
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              fontSize: '12px',
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
                right: '8px',
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

        {/* Right: Filters and Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <select
            value={filterWafMode}
            onChange={(e) => setFilterWafMode(e.target.value)}
            style={{
              height: '34px',
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '11.5px',
              padding: '0 10px',
              fontWeight: 600,
            }}
          >
            <option value="all">🎯 Tất cả Chế độ WAF</option>
            <option value="prevention">🛡️ Prevention (Chặn 403)</option>
            <option value="detection">👁️ Detection (Giám sát)</option>
            <option value="bypass">⚪ Bypass (Tắt WAF)</option>
          </select>

          <select
            value={filterHealth}
            onChange={(e) => setFilterHealth(e.target.value)}
            style={{
              height: '34px',
              background: '#ffffff',
              color: '#334155',
              border: '1px solid #cbd5e1',
              borderRadius: '6px',
              fontSize: '11.5px',
              padding: '0 10px',
              fontWeight: 600,
            }}
          >
            <option value="all">Tất cả Trạng thái</option>
            <option value="up">🟢 Máy chủ Online</option>
            <option value="down">🔴 Máy chủ Offline</option>
          </select>

          <button
            type="button"
            onClick={handlePingAll}
            disabled={pingingAll || sites.length === 0}
            title="Kiểm tra kết nối TCP tới toàn bộ máy chủ gốc"
            style={{
              ...btnSmall,
              height: '34px',
              border: '1px solid #bae6fd',
              background: '#f0f9ff',
              color: '#0284c7',
            }}
          >
            <i className={`fa-solid fa-bolt ${pingingAll ? 'fa-spin' : ''}`}></i>
            <span>Ping All</span>
          </button>

          <button
            type="button"
            onClick={handleExportCSV}
            title="Xuất danh sách website ra file Excel (CSV)"
            style={{ ...btnSmall, height: '34px' }}
          >
            <i className="fa-solid fa-file-excel" style={{ color: '#16a34a' }}></i>
            <span>Xuất CSV</span>
          </button>

          <button
            type="button"
            onClick={() => loadSites(true)}
            title="Tải lại danh sách website"
            style={{ ...btnSmall, height: '34px', width: '34px', justifyContent: 'center' }}
          >
            <i className={`fa-solid fa-rotate ${loading ? 'fa-spin' : ''}`}></i>
          </button>

          <button
            type="button"
            onClick={handleOpenAdd}
            style={{
              ...btnSmall,
              height: '34px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontWeight: 700,
              boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
              padding: '0 14px',
            }}
          >
            <i className="fa-solid fa-plus"></i>
            <span>Thêm Website</span>
          </button>
        </div>
      </div>

      {/* 4. TABLE */}
      <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.02)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ ...thStyle, width: '220px' }}>Website & Domain</th>
                <th style={{ ...thStyle, width: '190px' }}>Máy Chủ Đích (Upstream)</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Lưu Lượng</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Đã Chặn</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Độ Trễ</th>
                <th style={{ ...thStyle, width: '90px', textAlign: 'center' }}>Máy Chủ</th>
                <th style={{ ...thStyle, width: '220px' }}>Chế Độ Bảo Vệ WAF</th>
                <th style={{ ...thStyle, width: '70px', textAlign: 'center' }}>SSL</th>
                <th style={{ ...thStyle, width: '130px', textAlign: 'center' }}>Thao Tác</th>
              </tr>
            </thead>
            <tbody>
              {filteredSites.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
                    <i className="fa-solid fa-server" style={{ fontSize: '32px', color: '#cbd5e1', display: 'block', marginBottom: '8px' }}></i>
                    {searchTerm ? `Không tìm thấy website nào khớp với từ khóa "${searchTerm}"` : 'Hiện chưa có website nào được khai báo. Nhấn "Thêm Website" để bắt đầu bảo vệ.'}
                  </td>
                </tr>
              ) : (
                filteredSites.map((site) => {
                  const ping = pingStates[site.id];
                  const isUp = (ping?.status || site.health) === 'up';
                  const latency = ping?.latency !== undefined ? `${ping.latency}ms` : `${site.latency_ms || 1}ms`;
                  const isPingLoading = ping?.loading;
                  const isTestingWaf = testingWafStates[site.id];
                  const valid = site.valid_requests ?? Math.max(0, (site.total_requests || 0) - (site.attacks_blocked || 0));
                  const blocked = site.blocked_requests ?? (site.attacks_blocked || 0);

                  return (
                    <tr
                      key={site.id}
                      style={{ borderBottom: '1px solid #f1f5f9', transition: 'background 0.15s' }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    >
                      {/* Website & Domain */}
                      <td style={tdStyle}>
                        <div style={{ fontWeight: 800, fontSize: '13px', color: '#0f172a' }}>{site.name}</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <code style={{ fontSize: '11.5px', color: '#0284c7', fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
                            {site.domain}
                          </code>
                          <a
                            href={`http://${site.domain}:${site.port || 80}/`}
                            target="_blank"
                            rel="noreferrer"
                            title="Mở website qua cổng WAF"
                            style={{ color: '#94a3b8', fontSize: '10px' }}
                          >
                            <i className="fa-solid fa-arrow-up-right-from-square"></i>
                          </a>
                        </div>
                      </td>

                      {/* Upstream Target */}
                      <td style={tdStyle}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <code style={{ fontSize: '11.5px', color: '#334155', fontFamily: 'var(--font-mono, monospace)', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', border: '1px solid #e2e8f0' }}>
                            {site.upstream_target}
                          </code>
                          <button
                            type="button"
                            onClick={() => handleCopyTarget(site.upstream_target)}
                            title={copiedTarget === site.upstream_target ? 'Đã sao chép!' : 'Sao chép máy chủ đích'}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: copiedTarget === site.upstream_target ? '#10b981' : '#94a3b8',
                              cursor: 'pointer',
                              padding: '2px 4px',
                              fontSize: '11px',
                            }}
                          >
                            <i className={`fa-solid ${copiedTarget === site.upstream_target ? 'fa-check' : 'fa-copy'}`}></i>
                          </button>
                        </div>
                      </td>

                      {/* Valid Requests (Lưu Lượng Hợp Lệ) */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div title={`${valid.toLocaleString()} requests hợp lệ đã chuyển tiếp đến máy chủ origin`}>
                          <span style={{ fontWeight: 700, color: '#15803d', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                            {valid > 0 ? valid.toLocaleString() : <span style={{ color: '#cbd5e1' }}>—</span>}
                          </span>
                          {valid > 0 && (
                            <div style={{ width: '100%', height: '3px', background: '#e2e8f0', borderRadius: '2px', marginTop: '4px' }}>
                              <div style={{
                                width: `${Math.min(100, (valid / Math.max(1, valid + blocked)) * 100)}%`,
                                height: '3px',
                                background: '#10b981',
                                borderRadius: '2px',
                                transition: 'width 0.5s ease',
                              }} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Blocked Attacks */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div title={`${blocked.toLocaleString()} tấn công đã bị WAF chặn đứng`}>
                          <span style={{ fontWeight: 800, color: blocked > 0 ? '#dc2626' : '#94a3b8', fontFamily: 'var(--font-mono, monospace)', fontSize: '12px' }}>
                            {blocked > 0 ? blocked.toLocaleString() : <span style={{ color: '#cbd5e1' }}>0</span>}
                          </span>
                          {blocked > 0 && (
                            <div style={{ width: '100%', height: '3px', background: '#fee2e2', borderRadius: '2px', marginTop: '4px' }}>
                              <div style={{
                                width: `${Math.min(100, (blocked / Math.max(1, valid + blocked)) * 100)}%`,
                                height: '3px',
                                background: '#ef4444',
                                borderRadius: '2px',
                                transition: 'width 0.5s ease',
                              }} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Ping Latency */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span style={{ fontWeight: 700, color: isUp ? '#0284c7' : '#dc2626', fontFamily: 'var(--font-mono, monospace)', fontSize: '11.5px' }}>
                          {isPingLoading ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '11px' }}></i> : latency}
                        </span>
                      </td>

                      {/* Status UP/DOWN */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '10.5px',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: isUp ? '#ecfdf5' : '#fef2f2',
                            color: isUp ? '#15803d' : '#b91c1c',
                            border: isUp ? '1px solid #a7f3d0' : '1px solid #fecaca',
                          }}
                        >
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isUp ? '#10b981' : '#ef4444' }}></span>
                          {isUp ? 'ONLINE' : 'OFFLINE'}
                        </span>
                      </td>

                      {/* Tri-State WAF Segmented Control */}
                      <td style={tdStyle}>
                        <div
                          style={{
                            display: 'inline-flex',
                            background: '#f1f5f9',
                            padding: '2px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            gap: '2px',
                          }}
                        >
                          {/* Option 1: Prevention */}
                          <button
                            type="button"
                            onClick={() => handleChangeWafMode(site, 'prevention')}
                            title="Chặn đứng tấn công (403 Forbidden)"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: 'none',
                              background: site.waf_mode === 'prevention' ? '#10b981' : 'transparent',
                              color: site.waf_mode === 'prevention' ? '#ffffff' : '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: site.waf_mode === 'prevention' ? '0 1px 2px rgba(16,185,129,0.3)' : 'none',
                            }}
                          >
                            <i className="fa-solid fa-shield-halved" style={{ fontSize: '10px' }}></i>
                            <span>Chặn</span>
                          </button>

                          {/* Option 2: Detection */}
                          <button
                            type="button"
                            onClick={() => handleChangeWafMode(site, 'detection')}
                            title="Giám sát & Ghi log (Không chặn 403)"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: 'none',
                              background: site.waf_mode === 'detection' ? '#f59e0b' : 'transparent',
                              color: site.waf_mode === 'detection' ? '#ffffff' : '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: site.waf_mode === 'detection' ? '0 1px 2px rgba(245,158,11,0.3)' : 'none',
                            }}
                          >
                            <i className="fa-solid fa-eye" style={{ fontSize: '10px' }}></i>
                            <span>Giám Sát</span>
                          </button>

                          {/* Option 3: Bypass */}
                          <button
                            type="button"
                            onClick={() => handleChangeWafMode(site, 'bypass')}
                            title="Tắt lọc WAF (Cho qua thẳng)"
                            style={{
                              padding: '4px 8px',
                              borderRadius: '6px',
                              fontSize: '11px',
                              fontWeight: 700,
                              cursor: 'pointer',
                              border: 'none',
                              background: site.waf_mode === 'bypass' ? '#64748b' : 'transparent',
                              color: site.waf_mode === 'bypass' ? '#ffffff' : '#64748b',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              boxShadow: site.waf_mode === 'bypass' ? '0 1px 2px rgba(100,116,139,0.3)' : 'none',
                            }}
                          >
                            <i className="fa-solid fa-ban" style={{ fontSize: '10px' }}></i>
                            <span>Tắt</span>
                          </button>
                        </div>
                      </td>

                      {/* SSL */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        {site.ssl_enabled ? (
                          <span style={{ color: '#16a34a', fontSize: '11.5px', fontWeight: 600 }} title="HTTPS Đã Bật">
                            <i className="fa-solid fa-lock"></i>
                          </span>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '11.5px' }} title="HTTP Chuẩn">
                            <i className="fa-solid fa-lock-open"></i>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td style={{ ...tdStyle, textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '5px' }}>
                          {/* Live Test WAF Button */}
                          <button
                            type="button"
                            onClick={() => handleTestWAF(site)}
                            disabled={isTestingWaf}
                            title="Kiểm tra xác thực khả năng bảo vệ WAF thời gian thực"
                            style={{
                              ...btnSmall,
                              padding: '4px 8px',
                              border: '1px solid #86efac',
                              background: '#f0fdf4',
                              color: '#15803d',
                            }}
                          >
                            <i className={`fa-solid ${isTestingWaf ? 'fa-spinner fa-spin' : 'fa-shield-virus'}`}></i>
                            <span>Test WAF</span>
                          </button>

                          {/* Edit Button */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(site)}
                            title="Chỉnh sửa cấu hình website"
                            style={{ ...btnSmall, padding: '4px 7px' }}
                          >
                            <i className="fa-solid fa-pen"></i>
                          </button>

                          {/* Delete Button */}
                          <button
                            type="button"
                            onClick={() => handleDeleteSite(site)}
                            title="Xóa website khỏi hệ thống WAF"
                            style={{
                              ...btnSmall,
                              padding: '4px 7px',
                              border: '1px solid #fecaca',
                              background: '#fff1f2',
                              color: '#dc2626',
                            }}
                          >
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

      {/* 5. LIVE WAF VERIFICATION TEST MODAL */}
      {testModalData && (
        <div
          onClick={() => setTestModalData(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.55)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: '16px',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '12px',
              maxWidth: '560px',
              width: '100%',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'fadeInPanel 0.2s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-shield-virus" style={{ fontSize: '18px', color: '#2563eb' }}></i>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  Kết Quả Kiểm Tra WAF Thực Tế · {testModalData.domain}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setTestModalData(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '16px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px' }}>
              {/* Verdict Card */}
              <div
                style={{
                  background:
                    testModalData.result === 'blocked'
                      ? '#fef2f2'
                      : testModalData.result === 'detected'
                      ? '#fffbeb'
                      : '#f0fdf4',
                  border: `1px solid ${
                    testModalData.result === 'blocked'
                      ? '#fecaca'
                      : testModalData.result === 'detected'
                      ? '#fde68a'
                      : '#bbf7d0'
                  }`,
                  borderRadius: '10px',
                  padding: '14px 16px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '12px',
                }}
              >
                <i
                  className={`fa-solid ${
                    testModalData.result === 'blocked'
                      ? 'fa-circle-xmark'
                      : testModalData.result === 'detected'
                      ? 'fa-eye'
                      : 'fa-circle-check'
                  }`}
                  style={{
                    fontSize: '22px',
                    color:
                      testModalData.result === 'blocked'
                        ? '#dc2626'
                        : testModalData.result === 'detected'
                        ? '#d97706'
                        : '#16a34a',
                    marginTop: '2px',
                  }}
                ></i>
                <div>
                  <div
                    style={{
                      fontSize: '14px',
                      fontWeight: 800,
                      color:
                        testModalData.result === 'blocked'
                          ? '#991b1b'
                          : testModalData.result === 'detected'
                          ? '#92400e'
                          : '#166534',
                    }}
                  >
                    {testModalData.verdict}
                  </div>
                  <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px', lineHeight: 1.5 }}>
                    {testModalData.explanation}
                  </div>
                </div>
              </div>

              {/* Technical Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', marginBottom: '14px' }}>
                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Mã phản hồi HTTP</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a', marginTop: '2px' }}>
                    {testModalData.status_code || 200}{' '}
                    <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 500 }}>
                      {testModalData.status_code === 403 ? 'Forbidden' : 'OK'}
                    </span>
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Độ trễ xử lý WAF</div>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: '#0284c7', marginTop: '2px' }}>
                    {testModalData.latency_ms || 1} ms
                  </div>
                </div>

                <div style={{ background: '#f8fafc', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', gridColumn: 'span 2' }}>
                  <div style={{ fontSize: '11px', color: '#64748b' }}>Header bảo mật từ WAF Gateway</div>
                  <code style={{ fontSize: '12px', color: '#7c3aed', fontWeight: 700, display: 'block', marginTop: '2px' }}>
                    X-Blocked-By: {testModalData.blocked_by || 'Không có (Lưu lượng được cho qua)'}
                  </code>
                </div>
              </div>

              {/* Payload tested */}
              <div>
                <div style={{ fontSize: '11px', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                  Mẫu payload thử nghiệm đã gửi:
                </div>
                <pre
                  style={{
                    background: '#0f172a',
                    color: '#34d399',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    fontSize: '11.5px',
                    fontFamily: 'monospace',
                    margin: 0,
                    overflowX: 'auto',
                  }}
                >
                  {`GET /?test_probe=<script>alert('WAF_ENTERPRISE_PROBE')</script> HTTP/1.1\nHost: ${testModalData.domain}`}
                </pre>
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '12px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', background: '#f8fafc' }}>
              <button
                type="button"
                onClick={() => setTestModalData(null)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. ADD / EDIT WEBSITE MODAL */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.45)',
            backdropFilter: 'blur(4px)',
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
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '14px',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.25)',
              overflow: 'hidden',
              animation: 'fadeInPanel 0.2s ease',
            }}
          >
            {/* Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid #e2e8f0',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: '#f8fafc',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-globe" style={{ fontSize: '16px', color: '#2563eb' }}></i>
                <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                  {editingSite ? 'Chỉnh Sửa Cấu Hình Website' : 'Thêm Website Vào Diện Bảo Vệ'}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '16px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveSite}>
              <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
                {formError && (
                  <div
                    style={{
                      background: '#fff1f2',
                      border: '1px solid #fecaca',
                      color: '#b91c1c',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      fontSize: '12px',
                      marginBottom: '16px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <i className="fa-solid fa-triangle-exclamation"></i>
                    <span>{formError}</span>
                  </div>
                )}

                {/* Tên Website */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>
                    Tên Gợi Nhớ <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: Cổng Thông Tin Nội Bộ, Web Bán Hàng"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      height: '38px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      padding: '0 12px',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Domain / Host Tiếp Nhận */}
                <div style={{ marginBottom: '14px' }}>
                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>
                    Tên Miền Tiếp Nhận (Domain / Host) <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: shop.company.vn hoặc 192.168.246.100"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    style={{
                      width: '100%',
                      height: '38px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      padding: '0 12px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                    }}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    HAProxy Gateway sẽ căn cứ vào Header <code>Host: {formData.domain || '<domain>'}</code> để phân loại và lọc WAF.
                  </small>
                </div>

                {/* Máy Chủ Đích (Upstream Target) */}
                <div style={{ marginBottom: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                    <label style={{ fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700 }}>
                      Máy Chủ Web Gốc (Upstream Target) <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleTestModalTarget}
                      disabled={modalPingLoading}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#0284c7',
                        fontSize: '11px',
                        cursor: 'pointer',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <i className={`fa-solid ${modalPingLoading ? 'fa-spinner fa-spin' : 'fa-bolt'}`}></i>
                      <span>Kiểm tra kết nối</span>
                    </button>
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="ví dụ: 192.168.1.50:8080 hoặc protected-app:80"
                    value={formData.upstream_target}
                    onChange={(e) => setFormData({ ...formData, upstream_target: e.target.value })}
                    style={{
                      width: '100%',
                      height: '38px',
                      background: '#f8fafc',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      color: '#0f172a',
                      padding: '0 12px',
                      fontSize: '13px',
                      fontFamily: 'monospace',
                      outline: 'none',
                    }}
                  />
                  <small style={{ color: '#64748b', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    Địa chỉ IP và cổng của máy chủ nội bộ thực tế (nằm kín sau Gateway).
                  </small>
                  {modalPingResult && (
                    <div style={{ marginTop: '6px', fontSize: '11px', color: modalPingResult.status === 'up' ? '#16a34a' : '#dc2626', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <i className={`fa-solid ${modalPingResult.status === 'up' ? 'fa-circle-check' : 'fa-triangle-exclamation'}`}></i>
                      <span>{modalPingResult.message}</span>
                    </div>
                  )}
                </div>

                {/* 3-Card WAF Mode Selection */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '8px' }}>
                    Chế Độ Bảo Vệ WAF Cho Website Này
                  </label>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* Mode 1: Prevention */}
                    <div
                      onClick={() => setFormData({ ...formData, waf_mode: 'prevention' })}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: formData.waf_mode === 'prevention' ? '2px solid #10b981' : '1px solid #e2e8f0',
                        background: formData.waf_mode === 'prevention' ? '#f0fdf4' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        checked={formData.waf_mode === 'prevention'}
                        onChange={() => setFormData({ ...formData, waf_mode: 'prevention' })}
                        style={{ marginTop: '3px', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: formData.waf_mode === 'prevention' ? '#15803d' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="fa-solid fa-shield-halved" style={{ color: '#10b981' }}></i>
                          <span>Prevention (Chặn Chủ Động - Khuyên dùng)</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Tự động chặn đứng 403 Forbidden khi phát hiện mã độc (SQLi, XSS, RCE, Scanner).
                        </div>
                      </div>
                    </div>

                    {/* Mode 2: Detection */}
                    <div
                      onClick={() => setFormData({ ...formData, waf_mode: 'detection' })}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: formData.waf_mode === 'detection' ? '2px solid #f59e0b' : '1px solid #e2e8f0',
                        background: formData.waf_mode === 'detection' ? '#fffbeb' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        checked={formData.waf_mode === 'detection'}
                        onChange={() => setFormData({ ...formData, waf_mode: 'detection' })}
                        style={{ marginTop: '3px', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: formData.waf_mode === 'detection' ? '#b45309' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="fa-solid fa-eye" style={{ color: '#f59e0b' }}></i>
                          <span>Detection (Chỉ Giám Sát / Ghi Log)</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Quét và ghi nhật ký vi phạm, gửi cảnh báo Telegram nhưng KHÔNG chặn request (tránh chặn nhầm).
                        </div>
                      </div>
                    </div>

                    {/* Mode 3: Bypass */}
                    <div
                      onClick={() => setFormData({ ...formData, waf_mode: 'bypass' })}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '8px',
                        border: formData.waf_mode === 'bypass' ? '2px solid #64748b' : '1px solid #e2e8f0',
                        background: formData.waf_mode === 'bypass' ? '#f8fafc' : '#ffffff',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <input
                        type="radio"
                        checked={formData.waf_mode === 'bypass'}
                        onChange={() => setFormData({ ...formData, waf_mode: 'bypass' })}
                        style={{ marginTop: '3px', cursor: 'pointer' }}
                      />
                      <div>
                        <div style={{ fontSize: '12.5px', fontWeight: 800, color: formData.waf_mode === 'bypass' ? '#475569' : '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <i className="fa-solid fa-ban" style={{ color: '#64748b' }}></i>
                          <span>Bypass (Tắt Lọc WAF Tạm Thời)</span>
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                          Bỏ qua bộ lọc Coraza, lưu lượng chuyển tiếp thẳng vào máy chủ web nội bộ.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Port & SSL Options */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 700, marginBottom: '5px' }}>
                      Cổng Lắng Nghe
                    </label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({ ...formData, port: Number(e.target.value) })}
                      style={{
                        width: '100%',
                        height: '38px',
                        background: '#f8fafc',
                        border: '1px solid #cbd5e1',
                        borderRadius: '8px',
                        color: '#0f172a',
                        padding: '0 12px',
                        fontSize: '13px',
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', marginTop: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '12.5px', fontWeight: 600, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={formData.ssl_enabled}
                        onChange={(e) => setFormData({ ...formData, ssl_enabled: e.target.checked })}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span>Kích hoạt SSL / HTTPS</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid #e2e8f0',
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: '10px',
                  background: '#f8fafc',
                }}
              >
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: '1px solid #cbd5e1',
                    background: '#ffffff',
                    color: '#475569',
                    fontSize: '12.5px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    border: 'none',
                    background: '#10b981',
                    color: '#ffffff',
                    fontSize: '12.5px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <i className={`fa-solid ${actionLoading ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                  <span>{editingSite ? 'Lưu Thay Đổi' : 'Khai Báo Website'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. APP TOAST */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: '24px',
            right: '24px',
            zIndex: 999999,
            background: toast.kind === 'err' ? '#ef4444' : '#10b981',
            color: '#ffffff',
            padding: '11px 18px',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '13px',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            animation: 'fadeInPanel 0.2s ease',
          }}
        >
          <i className={`fa-solid ${toast.kind === 'err' ? 'fa-triangle-exclamation' : 'fa-circle-check'}`}></i>
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
