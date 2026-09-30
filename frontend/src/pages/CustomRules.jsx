import React, { useState, useEffect, useMemo } from 'react';
import { wafApi } from '../api/client';

export default function CustomRules() {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  // Modals
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [viewingCode, setViewingCode] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    rule_id: 1006,
    name: '',
    description: '',
    sec_rule: '',
    severity: 'CRITICAL',
    action: 'deny',
    phase: 2,
  });
  const [syntaxCheck, setSyntaxCheck] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Toast
  const [toast, setToast] = useState(null);
  const showToast = (message, kind = 'ok') => {
    setToast({ message, kind });
    setTimeout(() => setToast(null), 3000);
  };

  const loadRules = async () => {
    try {
      setLoading(true);
      const data = await wafApi.customRules();
      setRules(Array.isArray(data) ? data : []);
    } catch (err) {
      showToast('Lỗi nạp danh sách rules: ' + (err.message || err), 'err');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRules();
  }, []);

  const openAddModal = () => {
    const maxID = rules.reduce((max, r) => (r.rule_id > max ? r.rule_id : max), 1005);
    const nextID = maxID + 1;

    setEditingRule(null);
    setFormData({
      rule_id: nextID,
      name: '',
      description: '',
      sec_rule: `SecRule ARGS|REQUEST_URI "@rx (?i)(attack_signature)" \\\n    "id:${nextID},\\\n    phase:2,\\\n    deny,\\\n    status:403,\\\n    log,\\\n    auditlog,\\\n    msg:'Mô tả phát hiện tấn công',\\\n    tag:'custom',\\\n    severity:'CRITICAL'"`,
      severity: 'CRITICAL',
      action: 'deny',
      phase: 2,
    });
    setSyntaxCheck(null);
    setShowEditModal(true);
  };

  const openEditModal = (rule) => {
    setEditingRule(rule);
    setFormData({
      rule_id: rule.rule_id,
      name: rule.name,
      description: rule.description || '',
      sec_rule: rule.sec_rule,
      severity: rule.severity || 'CRITICAL',
      action: rule.action || 'deny',
      phase: rule.phase || 2,
    });
    setSyntaxCheck(null);
    setShowEditModal(true);
  };

  const handleToggle = async (rule) => {
    try {
      const res = await wafApi.toggleCustomRule(rule.id);
      showToast(res.message || 'Đã chuyển trạng thái quy tắc');
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, enabled: !r.enabled } : r))
      );
    } catch (err) {
      showToast('Lỗi khi bật/tắt rule: ' + (err.message || err), 'err');
    }
  };

  const handleDelete = async (rule) => {
    if (!window.confirm(`Xác nhận xóa quy tắc [${rule.rule_id}] "${rule.name}"?`)) return;
    try {
      await wafApi.deleteCustomRule(rule.id);
      showToast('Đã xóa quy tắc thành công');
      setRules((prev) => prev.filter((r) => r.id !== rule.id));
    } catch (err) {
      showToast('Lỗi khi xóa rule: ' + (err.message || err), 'err');
    }
  };

  const handleTestSyntax = async () => {
    if (!formData.sec_rule.trim()) {
      setSyntaxCheck({ valid: false, message: 'Vui lòng nhập nội dung SecRule' });
      return;
    }
    try {
      const res = await wafApi.testCustomRule({ sec_rule: formData.sec_rule });
      setSyntaxCheck(res);
    } catch (err) {
      setSyntaxCheck({ valid: false, error: err.message || 'Lỗi kiểm tra cú pháp' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.sec_rule.trim()) {
      showToast('Vui lòng điền đầy đủ Tên và Nội dung SecRule', 'err');
      return;
    }

    try {
      setActionLoading(true);
      if (editingRule) {
        await wafApi.updateCustomRule(editingRule.id, formData);
        showToast('Đã cập nhật quy tắc WAF thành công');
      } else {
        await wafApi.addCustomRule(formData);
        showToast('Đã tạo mới quy tắc WAF tùy biến');
      }
      setShowEditModal(false);
      loadRules();
    } catch (err) {
      showToast('Lỗi lưu quy tắc: ' + (err.message || err), 'err');
    } finally {
      setActionLoading(false);
    }
  };

  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.name.toLowerCase().includes(q) ||
        (r.description && r.description.toLowerCase().includes(q)) ||
        String(r.rule_id).includes(q) ||
        r.sec_rule.toLowerCase().includes(q);

      if (!matchSearch) return false;
      if (severityFilter !== 'all' && r.severity !== severityFilter) return false;
      if (actionFilter !== 'all' && r.action !== actionFilter) return false;
      return true;
    });
  }, [rules, search, severityFilter, actionFilter]);

  const activeCount = rules.filter((r) => r.enabled).length;
  const disabledCount = rules.length - activeCount;

  return (
    <div style={{ animation: 'fadeInPanel 0.25s ease', color: '#0f172a' }}>
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
            background: toast.kind === 'err' ? '#dc2626' : '#059669',
            color: '#fff',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '13px',
            fontWeight: 500,
          }}
        >
          <i className={toast.kind === 'err' ? 'fa-solid fa-circle-exclamation' : 'fa-solid fa-circle-check'} />
          {toast.message}
        </div>
      )}

      {/* Header Bar (Light Card) */}
      <div
        style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '14px 18px',
          marginBottom: '14px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#0f172a', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <i className="fa-solid fa-code-branch" style={{ color: '#10b981' }}></i>
              Quản Lý Quy Tắc WAF (Coraza Custom Rules)
            </h3>
            <span
              style={{
                fontSize: '11px',
                padding: '2px 8px',
                borderRadius: '12px',
                background: '#f1f5f9',
                color: '#475569',
                border: '1px solid #cbd5e1',
                fontWeight: 600,
              }}
            >
              {rules.length} rules
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748b' }}>
            Định nghĩa chữ ký phát hiện tấn công, rule SecRule nâng cao và áp dụng thời gian thực lên Coraza SPOA Engine.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Quick Metrics */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '6px 14px',
              background: '#f8fafc',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              fontSize: '12px',
              fontWeight: 600,
            }}
          >
            <span style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a' }} />
              {activeCount} Đang bật
            </span>
            <span style={{ color: '#cbd5e1' }}>|</span>
            <span style={{ color: '#64748b', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#94a3b8' }} />
              {disabledCount} Đã tắt
            </span>
          </div>

          <button
            onClick={openAddModal}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 16px',
              borderRadius: '6px',
              background: '#2563eb',
              color: '#fff',
              fontSize: '13px',
              fontWeight: 600,
              border: 'none',
              cursor: 'pointer',
              transition: 'background 0.2s',
            }}
          >
            <i className="fa-solid fa-plus" /> Thêm Quy Tắc Mới
          </button>
        </div>
      </div>

      {/* Filter and Search Bar (Light Card) */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          alignItems: 'center',
          flexWrap: 'wrap',
          marginBottom: '14px',
          padding: '12px 16px',
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
        }}
      >
        <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
          <i
            className="fa-solid fa-magnifying-glass"
            style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: '12px' }}
          />
          <input
            type="text"
            placeholder="Tìm kiếm theo Tên rule, ID, nội dung SecRule..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '6px',
              background: '#f8fafc',
              border: '1px solid #cbd5e1',
              color: '#0f172a',
              fontSize: '12.5px',
              outline: 'none',
            }}
          />
        </div>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontSize: '12.5px',
            outline: 'none',
          }}
        >
          <option value="all">Tất cả Mức độ</option>
          <option value="CRITICAL">CRITICAL (Nghiêm trọng)</option>
          <option value="HIGH">HIGH (Cao)</option>
          <option value="MEDIUM">MEDIUM (Trung bình)</option>
          <option value="LOW">LOW (Thấp)</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            color: '#334155',
            fontSize: '12.5px',
            outline: 'none',
          }}
        >
          <option value="all">Tất cả Hành vi</option>
          <option value="deny">Chặn (403 Deny)</option>
          <option value="drop">Ngắt kết nối (Drop)</option>
          <option value="allow">Cho phép (Allow)</option>
        </select>

        <button
          onClick={loadRules}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            background: '#f8fafc',
            border: '1px solid #cbd5e1',
            color: '#475569',
            fontSize: '12.5px',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            fontWeight: 600,
          }}
          title="Tải lại danh sách"
        >
          <i className="fa-solid fa-arrows-rotate" /> Làm mới
        </button>
      </div>

      {/* Rules Table (Light Card) */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '10px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: '#f8fafc', color: '#64748b', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '90px', fontSize: '11.5px', textTransform: 'uppercase' }}>Rule ID</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, fontSize: '11.5px', textTransform: 'uppercase' }}>Tên Quy Tắc & Mục Đích</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '110px', fontSize: '11.5px', textTransform: 'uppercase' }}>Giai đoạn</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '120px', fontSize: '11.5px', textTransform: 'uppercase' }}>Mức độ</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '110px', fontSize: '11.5px', textTransform: 'uppercase' }}>Hành vi</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '110px', fontSize: '11.5px', textTransform: 'uppercase' }}>Trạng thái</th>
                <th style={{ padding: '12px 16px', fontWeight: 700, width: '120px', textAlign: 'center', fontSize: '11.5px', textTransform: 'uppercase' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-solid fa-spinner fa-spin" style={{ marginRight: '8px' }} /> Đang tải danh sách quy tắc WAF...
                  </td>
                </tr>
              ) : filteredRules.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    <i className="fa-solid fa-filter" style={{ marginRight: '8px' }} /> Không tìm thấy quy tắc nào khớp với bộ lọc
                  </td>
                </tr>
              ) : (
                filteredRules.map((rule) => {
                  const isCritical = rule.severity === 'CRITICAL';
                  const isHigh = rule.severity === 'HIGH';
                  const isMedium = rule.severity === 'MEDIUM';

                  return (
                    <tr
                      key={rule.id}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        background: rule.enabled ? '#ffffff' : '#f8fafc',
                        opacity: rule.enabled ? 1 : 0.65,
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background: '#f1f5f9',
                            color: '#2563eb',
                            border: '1px solid #e2e8f0',
                            fontSize: '12px',
                          }}
                        >
                          {rule.rule_id}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>
                          {rule.name}
                        </div>
                        {rule.description && (
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '3px' }}>
                            {rule.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            background: rule.phase === 1 ? '#e0f2fe' : '#ede9fe',
                            color: rule.phase === 1 ? '#0369a1' : '#6d28d9',
                            border: `1px solid ${rule.phase === 1 ? '#bae6fd' : '#ddd6fe'}`,
                          }}
                        >
                          Phase {rule.phase} ({rule.phase === 1 ? 'Header' : 'Body'})
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            background: isCritical
                              ? '#fee2e2'
                              : isHigh
                              ? '#ffedd5'
                              : isMedium
                              ? '#fef9c3'
                              : '#dbeafe',
                            color: isCritical
                              ? '#b91c1c'
                              : isHigh
                              ? '#c2410c'
                              : isMedium
                              ? '#a16207'
                              : '#1d4ed8',
                            border: `1px solid ${
                              isCritical ? '#fecaca' : isHigh ? '#fed7aa' : isMedium ? '#fef08a' : '#bfdbfe'
                            }`,
                          }}
                        >
                          {rule.severity || 'CRITICAL'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: rule.action === 'deny' ? '#dc2626' : rule.action === 'drop' ? '#7c3aed' : '#16a34a',
                          }}
                        >
                          {rule.action === 'deny' ? '403 Deny' : rule.action === 'drop' ? 'Drop' : 'Allow'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <button
                          onClick={() => handleToggle(rule)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '4px 10px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: `1px solid ${rule.enabled ? '#bbf7d0' : '#e2e8f0'}`,
                            cursor: 'pointer',
                            background: rule.enabled ? '#f0fdf4' : '#f8fafc',
                            color: rule.enabled ? '#16a34a' : '#64748b',
                          }}
                        >
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: rule.enabled ? '#16a34a' : '#94a3b8',
                            }}
                          />
                          {rule.enabled ? 'Kích hoạt' : 'Tạm tắt'}
                        </button>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', gap: '6px' }}>
                          <button
                            onClick={() => {
                              setViewingCode(rule);
                              setShowCodeModal(true);
                            }}
                            title="Xem mã SecRule"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#475569',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-code" />
                          </button>
                          <button
                            onClick={() => openEditModal(rule)}
                            title="Chỉnh sửa rule"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#2563eb',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-pen-to-square" />
                          </button>
                          <button
                            onClick={() => handleDelete(rule)}
                            title="Xóa rule"
                            style={{
                              padding: '5px 8px',
                              borderRadius: '4px',
                              background: '#ffffff',
                              border: '1px solid #cbd5e1',
                              color: '#dc2626',
                              cursor: 'pointer',
                            }}
                          >
                            <i className="fa-solid fa-trash-can" />
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

      {/* Modal: View SecRule Code */}
      {showCodeModal && viewingCode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          onClick={() => setShowCodeModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              width: '90%',
              maxWidth: '650px',
              padding: '24px',
              color: '#0f172a',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <i className="fa-solid fa-file-code" style={{ color: '#2563eb', fontSize: '18px' }} />
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700 }}>
                  SecRule Directive: {viewingCode.name}
                </h3>
              </div>
              <button
                onClick={() => setShowCodeModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <pre
              style={{
                background: '#0f172a',
                padding: '16px',
                borderRadius: '8px',
                color: '#34d399',
                fontSize: '13px',
                fontFamily: 'monospace',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: '350px',
                overflowY: 'auto',
              }}
            >
              {viewingCode.sec_rule}
            </pre>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', gap: '10px' }}>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(viewingCode.sec_rule);
                  showToast('Đã sao chép mã SecRule vào Clipboard');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#f1f5f9',
                  border: '1px solid #cbd5e1',
                  color: '#334155',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                <i className="fa-solid fa-copy" /> Sao chép
              </button>
              <button
                onClick={() => setShowCodeModal(false)}
                style={{
                  padding: '8px 16px',
                  borderRadius: '6px',
                  background: '#2563eb',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: 600,
                }}
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add / Edit Rule */}
      {showEditModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.4)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 999,
          }}
          onClick={() => setShowEditModal(false)}
        >
          <div
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              border: '1px solid #e2e8f0',
              width: '90%',
              maxWidth: '720px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
              color: '#0f172a',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                {editingRule ? `Chỉnh Sửa Quy Tắc [${editingRule.rule_id}]` : 'Thêm Quy Tắc WAF Tùy Biến Mới'}
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '18px', cursor: 'pointer' }}
              >
                <i className="fa-solid fa-xmark" />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Rule ID (Mã định danh)
                  </label>
                  <input
                    type="number"
                    value={formData.rule_id}
                    disabled={!!editingRule}
                    onChange={(e) => setFormData({ ...formData, rule_id: parseInt(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: editingRule ? '#f1f5f9' : '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#2563eb',
                      fontFamily: 'monospace',
                      fontWeight: 700,
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Tên Quy Tắc *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Chặn khai thác lỗ hổng Log4j / RCE"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                  Mô Tả Chi Tiết
                </label>
                <input
                  type="text"
                  placeholder="Mô tả hành vi hoặc CVE bảo mật liên quan"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    background: '#ffffff',
                    border: '1px solid #cbd5e1',
                    color: '#0f172a',
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Mức độ nghiêm trọng
                  </label>
                  <select
                    value={formData.severity}
                    onChange={(e) => setFormData({ ...formData, severity: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  >
                    <option value="CRITICAL">CRITICAL</option>
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Hành vi can thiệp
                  </label>
                  <select
                    value={formData.action}
                    onChange={(e) => setFormData({ ...formData, action: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  >
                    <option value="deny">403 Deny</option>
                    <option value="drop">Silent Drop</option>
                    <option value="allow">Allow</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '6px' }}>
                    Giai đoạn (Phase)
                  </label>
                  <select
                    value={formData.phase}
                    onChange={(e) => setFormData({ ...formData, phase: parseInt(e.target.value) || 2 })}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      borderRadius: '6px',
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#0f172a',
                    }}
                  >
                    <option value={1}>Phase 1 (Headers / URL)</option>
                    <option value={2}>Phase 2 (Body / POST Data)</option>
                  </select>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                  <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>
                    Nội dung SecRule (Coraza / ModSecurity v2 Syntax) *
                  </label>
                  <button
                    type="button"
                    onClick={handleTestSyntax}
                    style={{
                      background: '#f1f5f9',
                      border: '1px solid #cbd5e1',
                      color: '#2563eb',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <i className="fa-solid fa-vial-circle-check" /> Kiểm tra cú pháp
                  </button>
                </div>

                <textarea
                  rows={6}
                  required
                  value={formData.sec_rule}
                  onChange={(e) => {
                    setFormData({ ...formData, sec_rule: e.target.value });
                    setSyntaxCheck(null);
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '6px',
                    background: '#0f172a',
                    border: '1px solid #cbd5e1',
                    color: '#34d399',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: 1.4,
                  }}
                />

                {syntaxCheck && (
                  <div
                    style={{
                      marginTop: '6px',
                      padding: '8px 12px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: syntaxCheck.valid ? '#f0fdf4' : '#fef2f2',
                      color: syntaxCheck.valid ? '#16a34a' : '#dc2626',
                      border: `1px solid ${syntaxCheck.valid ? '#bbf7d0' : '#fecaca'}`,
                      fontWeight: 600,
                    }}
                  >
                    <i className={syntaxCheck.valid ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-exclamation'} />{' '}
                    {syntaxCheck.message || syntaxCheck.error}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    background: '#f1f5f9',
                    border: '1px solid #cbd5e1',
                    color: '#475569',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  style={{
                    padding: '8px 20px',
                    borderRadius: '6px',
                    background: '#2563eb',
                    border: 'none',
                    color: '#fff',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {actionLoading ? (
                    <span>
                      <i className="fa-solid fa-spinner fa-spin" /> Đang lưu...
                    </span>
                  ) : editingRule ? (
                    'Cập Nhật Quy Tắc'
                  ) : (
                    'Lưu & Áp Dụng Ngay'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
