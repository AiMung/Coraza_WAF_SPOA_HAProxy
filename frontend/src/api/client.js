const sameOrigin = typeof window !== 'undefined' && window.location.protocol.startsWith('http');

export const API_BASE = sameOrigin ? `${window.location.origin}/api` : '/api';

export const WS_URL = sameOrigin
  ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
  : 'ws://127.0.0.1:8080/ws';

async function parse(res) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

export async function apiGet(path) {
  const res = await fetch(`${API_BASE}${path}`);
  const data = await parse(res);
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

export async function apiSend(path, method, body) {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await parse(res);
  if (!res.ok) throw new Error(data?.error || res.statusText);
  return data;
}

export const wafApi = {
  stats: (range = '30days', category = 'ip_rank') =>
    apiGet(`/stats?range=${encodeURIComponent(range)}&category=${encodeURIComponent(category)}`),
  logs: ({ limit = 200, page = 1, ip = '', type = '', q = '' } = {}) => {
    const qs = new URLSearchParams({ limit: String(limit), page: String(page) });
    if (ip) qs.set('ip', ip);
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    return apiGet(`/logs?${qs.toString()}`);
  },
  ipRules: () => apiGet('/ip-rules'),
  rules: () => apiGet('/rules'),
  telegram: () => apiGet('/telegram'),
  saveTelegram: (cfg) => apiSend('/telegram', 'POST', cfg),
  testTelegram: () => apiSend('/telegram/test', 'POST'),
  addIpRule: (payload) => apiSend('/ip-rules', 'POST', payload),
  sites: () => apiGet('/sites'),
  addSite: (payload) => apiSend('/sites', 'POST', payload),
  updateSite: (id, payload) => apiSend(`/sites/${id}`, 'PUT', payload),
  deleteSite: (id) => apiSend(`/sites/${id}`, 'DELETE'),
  toggleSiteWAF: (id, payload = {}) => apiSend(`/sites/${id}/toggle`, 'POST', payload),
  pingSite: (id) => apiSend(`/sites/${id}/ping`, 'POST'),
  testWAFSite: (id) => apiSend(`/sites/${id}/test-waf`, 'POST'),
  simulate: (type = 'sqli') => apiSend(`/simulate-attack?type=${encodeURIComponent(type)}`, 'POST'),
  systemFix: () => apiSend('/system/fix', 'POST'),
  systemReboot: () => apiSend('/system/reboot', 'POST'),
  exportLogs: (format = 'json', filters = {}) => {
    const qs = new URLSearchParams({ format });
    if (filters.type) qs.set('type', filters.type);
    if (filters.ip) qs.set('ip', filters.ip);
    if (filters.q) qs.set('q', filters.q);
    return `${API_BASE}/logs/export?${qs.toString()}`;
  },
  customRules: () => apiGet('/custom-rules'),
  addCustomRule: (payload) => apiSend('/custom-rules', 'POST', payload),
  updateCustomRule: (id, payload) => apiSend(`/custom-rules/${id}`, 'PUT', payload),
  deleteCustomRule: (id) => apiSend(`/custom-rules/${id}`, 'DELETE'),
  toggleCustomRule: (id) => apiSend(`/custom-rules/${id}/toggle`, 'POST'),
  testCustomRule: (payload) => apiSend('/custom-rules/test-eval', 'POST', payload),
  settings: () => apiGet('/settings'),
  saveSettings: (payload) => apiSend('/settings', 'POST', payload),
  updatePassword: (payload) => apiSend('/settings/password', 'POST', payload),
};
