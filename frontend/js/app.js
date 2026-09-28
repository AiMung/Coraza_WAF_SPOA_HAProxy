// ==========================================
// Coraza WAF Dashboard JavaScript Controller
// ==========================================

const API_BASE = window.location.origin.includes('http') ? `${window.location.origin}/api` : 'http://192.168.246.100:8080/api';
const WS_URL = window.location.origin.includes('http') 
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : 'ws://192.168.246.100:8080/ws';

let timelineChartInstance = null;
let attackTypeChartInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    setupNavigation();
    initCharts();
    loadDashboardStats();
    loadLogs();
    loadIPRules();
    loadTelegramSettings();
    loadRules();
    setupWebSocket();
    setupEventListeners();
});

// 1. Navigation & Tabs
function setupNavigation() {
    const menuItems = document.querySelectorAll('.sidebar-menu .menu-item');
    const tabPanes = document.querySelectorAll('.tab-pane');
    const pageTitle = document.getElementById('page-title');
    const pageSubtitle = document.getElementById('page-subtitle');

    const titles = {
        'dashboard': { title: 'Tổng Quan Bảo Mật Hệ Thống', subtitle: 'Giám sát lưu lượng và ngăn chặn tấn công mạng theo thời gian thực' },
        'logs': { title: 'Nhật Ký Tấn Công & Vi Phạm (Attack Logs)', subtitle: 'Toàn bộ sự kiện đã bị WAF phát hiện và ngăn chặn 403' },
        'rules': { title: 'Quy Tắc Bảo Vệ WAF (Rulesets)', subtitle: 'OWASP Core Rule Set (CRS v4) & Custom Signatures' },
        'ip-control': { title: 'Quản Lý Blacklist / Whitelist IP', subtitle: 'Cô lập các IP tấn công hoặc thêm IP tin cậy' },
        'telegram': { title: 'Cấu Hình Cảnh Báo Telegram', subtitle: 'Nhận thông báo tức thời qua Bot Telegram cá nhân / nhóm' },
        'target-app': { title: 'Cổng Ứng Dụng Đang Được Bảo Vệ', subtitle: 'Xem trạng thái và thử nghiệm trực tiếp trên web demo' }
    };

    menuItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = item.getAttribute('data-tab');

            menuItems.forEach(i => i.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            item.classList.add('active');
            const targetPane = document.getElementById(`tab-${tabId}`);
            if (targetPane) targetPane.classList.add('active');

            if (titles[tabId]) {
                pageTitle.innerText = titles[tabId].title;
                pageSubtitle.innerText = titles[tabId].subtitle;
            }

            if (tabId === 'logs') loadLogs();
            if (tabId === 'ip-control') loadIPRules();
            if (tabId === 'rules') loadRules();
        });
    });
}

// 2. Charts Initialization
function initCharts() {
    // 24h Timeline Chart
    const ctxTimeline = document.getElementById('timelineChart').getContext('2d');
    timelineChartInstance = new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
            datasets: [{
                label: 'Số Lượt Chặn (Blocked Attacks)',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: '#233154' }, ticks: { color: '#94a3b8' } },
                y: { grid: { color: '#233154' }, ticks: { color: '#94a3b8', precision: 0 }, beginAtZero: true }
            }
        }
    });

    // Attack Types Donut Chart
    const ctxType = document.getElementById('attackTypeChart').getContext('2d');
    attackTypeChartInstance = new Chart(ctxType, {
        type: 'doughnut',
        data: {
            labels: ['SQL Injection', 'XSS', 'LFI / Traversal', 'Scanner', 'Others'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: ['#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#10b981'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { color: '#94a3b8', boxWidth: 12, padding: 12 } }
            },
            cutout: '70%'
        }
    });
}

// 3. Load Dashboard Stats
async function loadDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('stat-total-attacks').innerText = data.total_attacks || 0;
        document.getElementById('stat-today-attacks').innerText = data.attacks_today || 0;
        document.getElementById('stat-blocked-ips').innerText = data.blocked_ips || 0;
        document.getElementById('sidebar-attack-badge').innerText = data.total_attacks || 0;

        // Update Attack Types Chart
        if (data.attack_types && Object.keys(data.attack_types).length > 0) {
            attackTypeChartInstance.data.labels = Object.keys(data.attack_types);
            attackTypeChartInstance.data.datasets[0].data = Object.values(data.attack_types);
            attackTypeChartInstance.update();
        }

        // Update Timeline Chart
        if (data.recent_timeline && data.recent_timeline.length > 0) {
            timelineChartInstance.data.labels = data.recent_timeline.map(t => t.hour);
            timelineChartInstance.data.datasets[0].data = data.recent_timeline.map(t => t.count);
            timelineChartInstance.update();
        }

        // Update Top Attacker IPs
        const topList = document.getElementById('top-ip-list');
        if (data.top_attacker_ips && data.top_attacker_ips.length > 0) {
            topList.innerHTML = data.top_attacker_ips.map(item => `
                <div style="display:flex; justify-content:space-between; padding:10px 0; border-bottom:1px solid #233154; font-size:13px;">
                    <div><i data-lucide="shield-alert" style="width:14px; color:#ef4444; vertical-align:middle;"></i> <code>${item.ip}</code></div>
                    <span class="badge-tag tag-danger">${item.count} attacks</span>
                </div>
            `).join('');
            lucide.createIcons();
        }
    } catch (err) {
        console.error('Failed to load stats:', err);
    }
}

// 4. Load Logs List
async function loadLogs() {
    const ip = document.getElementById('filter-ip').value;
    const type = document.getElementById('filter-type').value;

    try {
        const res = await fetch(`${API_BASE}/logs?ip=${encodeURIComponent(ip)}&type=${encodeURIComponent(type)}`);
        if (!res.ok) return;
        const result = await res.json();
        const logs = result.data || [];

        const tbody = document.getElementById('logs-table-body');
        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">Chưa có bản ghi tấn công nào được ghi nhận.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>#${l.id}</td>
                <td>${l.timestamp}</td>
                <td><code>${l.client_ip}</code></td>
                <td><span class="badge-tag tag-warning">${l.method}</span> <code style="font-size:11px;">${escapeHtml(l.uri)}</code></td>
                <td><span class="badge-tag tag-danger">${l.attack_type}</span></td>
                <td>Rule ${l.rule_id}</td>
                <td><span class="badge-tag tag-danger">${l.action} 403</span></td>
                <td><button class="btn btn-secondary" style="padding:4px 8px; font-size:11px;" onclick="viewLogDetail(${JSON.stringify(l).replace(/"/g, '&quot;')})">Xem</button></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed to load logs:', err);
    }
}

// 5. Load IP Rules (Blacklist)
async function loadIPRules() {
    try {
        const res = await fetch(`${API_BASE}/ip-rules`);
        if (!res.ok) return;
        const rules = await res.json();

        const tbody = document.getElementById('ip-table-body');
        if (rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">Chưa có địa chỉ IP nào trong danh sách.</td></tr>`;
            return;
        }

        tbody.innerHTML = rules.map(r => `
            <tr>
                <td><code>${r.ip}</code></td>
                <td><span class="badge-tag ${r.rule_type === 'blacklist' ? 'tag-danger' : 'tag-success'}">${r.rule_type.toUpperCase()}</span></td>
                <td>${escapeHtml(r.reason || 'N/A')}</td>
                <td>${r.created_at}</td>
                <td><button class="btn btn-danger" style="padding:4px 8px; font-size:11px;" onclick="deleteIPRule(${r.id})">Xóa</button></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Failed to load IP rules:', err);
    }
}

// 6. Telegram Settings
async function loadTelegramSettings() {
    try {
        const res = await fetch(`${API_BASE}/telegram`);
        if (!res.ok) return;
        const cfg = await res.json();

        document.getElementById('tg-token').value = cfg.bot_token || '';
        document.getElementById('tg-chat-id').value = cfg.chat_id || '';
        document.getElementById('tg-enabled').checked = cfg.enabled || false;
    } catch (err) {
        console.error('Failed to load telegram settings:', err);
    }
}

// 7. Load Rules List
async function loadRules() {
    try {
        const res = await fetch(`${API_BASE}/rules`);
        if (!res.ok) return;
        const rules = await res.json();

        const list = document.getElementById('rules-list');
        list.innerHTML = rules.map(r => `
            <div class="rule-card">
                <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                    <span class="badge-tag tag-warning">ID: ${r.id}</span>
                    <span class="badge-tag tag-success">${r.status}</span>
                </div>
                <h4>${r.name}</h4>
                <p>Danh mục: <strong>${r.category}</strong> | Hành động: <span style="color:#ef4444;">${r.action}</span></p>
            </div>
        `).join('');
    } catch (err) {
        console.error('Failed to load rules:', err);
    }
}

// 8. WebSocket Setup (Live Events Feed)
function setupWebSocket() {
    const wsStatus = document.getElementById('ws-status');
    let socket = null;

    function connect() {
        socket = new WebSocket(WS_URL);

        socket.onopen = () => {
            wsStatus.innerText = 'Realtime Live';
            document.querySelector('.dot.live-dot').style.background = '#10b981';
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.event === 'new_attack') {
                    handleNewAttackEvent(msg.data);
                }
            } catch (e) {
                console.error('WS Parse Error:', e);
            }
        };

        socket.onclose = () => {
            wsStatus.innerText = 'Connecting...';
            document.querySelector('.dot.live-dot').style.background = '#f97316';
            setTimeout(connect, 3000);
        };
    }
    connect();
}

function handleNewAttackEvent(log) {
    // 1. Prepend to Live Feed Table
    const tbody = document.getElementById('live-feed-body');
    const row = document.createElement('tr');
    row.style.background = 'rgba(239, 68, 68, 0.15)';
    row.innerHTML = `
        <td>${log.timestamp}</td>
        <td><code>${log.client_ip}</code></td>
        <td><span class="badge-tag tag-danger">${log.attack_type}</span></td>
        <td><code style="font-size:11px;">${escapeHtml(log.uri)}</code></td>
        <td>Rule ${log.rule_id}</td>
        <td><span class="badge-tag tag-danger">DENY 403</span></td>
    `;
    if (tbody.children.length > 0 && tbody.children[0].innerText.includes('Đang chờ')) {
        tbody.innerHTML = '';
    }
    tbody.prepend(row);

    // Fade highlight out
    setTimeout(() => { row.style.background = 'transparent'; }, 2000);

    // 2. Increment stats
    loadDashboardStats();
}

// 9. Event Listeners
function setupEventListeners() {
    // Simulate Attack Button
    document.getElementById('btn-simulate-attack').addEventListener('click', async () => {
        const btn = document.getElementById('btn-simulate-attack');
        btn.innerHTML = `<span>Đang kích hoạt...</span>`;
        try {
            const res = await fetch(`${API_BASE}/simulate-attack?type=sqli`, { method: 'POST' });
            const data = await res.json();
            alert('💥 Đã kích hoạt cuộc tấn công mẫu SQL Injection! Kiểm tra bảng Live Feed và thông báo Telegram.');
        } catch (e) {
            alert('Lỗi kích hoạt tấn công mẫu: ' + e);
        } finally {
            btn.innerHTML = `<i data-lucide="zap"></i> <span>Thử Tấn Công (Demo)</span>`;
            lucide.createIcons();
        }
    });

    // Save Telegram Form
    document.getElementById('form-telegram').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            bot_token: document.getElementById('tg-token').value.trim(),
            chat_id: document.getElementById('tg-chat-id').value.trim(),
            enabled: document.getElementById('tg-enabled').checked
        };

        try {
            const res = await fetch(`${API_BASE}/telegram`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                alert('✅ Lưu cấu hình Telegram thành công!');
            }
        } catch (err) {
            alert('Lỗi lưu cấu hình: ' + err);
        }
    });

    // Test Telegram Button
    document.getElementById('btn-test-telegram').addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE}/telegram/test`, { method: 'POST' });
            const data = await res.json();
            if (res.ok) {
                alert('🎉 ' + data.message);
            } else {
                alert('❌ Lỗi gửi tin nhắn: ' + data.error);
            }
        } catch (err) {
            alert('Lỗi kết nối test telegram: ' + err);
        }
    });

    // Filter Logs Button
    document.getElementById('btn-filter-logs').addEventListener('click', loadLogs);
    document.getElementById('btn-refresh-logs').addEventListener('click', loadLogs);

    // IP Modals
    document.getElementById('btn-open-add-ip-modal').addEventListener('click', () => {
        document.getElementById('modal-add-ip').classList.add('active');
    });
    document.getElementById('btn-close-ip-modal').addEventListener('click', () => {
        document.getElementById('modal-add-ip').classList.remove('active');
    });

    // Save IP Rule
    document.getElementById('btn-save-ip-rule').addEventListener('click', async () => {
        const ip = document.getElementById('modal-ip-val').value.trim();
        const rule_type = document.getElementById('modal-ip-type').value;
        const reason = document.getElementById('modal-ip-reason').value.trim();

        if (!ip) {
            alert('Vui lòng nhập địa chỉ IP');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/ip-rules`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ip, rule_type, reason })
            });
            if (res.ok) {
                document.getElementById('modal-add-ip').classList.remove('active');
                loadIPRules();
                loadDashboardStats();
            }
        } catch (err) {
            alert('Lỗi lưu IP: ' + err);
        }
    });

    // Close Log Detail Modal
    document.getElementById('btn-close-modal').addEventListener('click', () => {
        document.getElementById('modal-log-details').classList.remove('active');
    });
}

function viewLogDetail(log) {
    const modalContent = document.getElementById('modal-log-content');
    modalContent.innerHTML = `
        <div style="font-size:13px; font-family:monospace; line-height:1.8;">
            <div><strong>Transaction ID:</strong> <code>${log.txn_id}</code></div>
            <div><strong>IP Nguồn:</strong> <code>${log.client_ip}</code></div>
            <div><strong>Thời Gian:</strong> ${log.timestamp}</div>
            <div><strong>Method & URI:</strong> <code>${log.method} ${escapeHtml(log.uri)}</code></div>
            <div><strong>Loại Tấn Công:</strong> <span class="badge-tag tag-danger">${log.attack_type}</span></div>
            <div><strong>Rule ID:</strong> <code>${log.rule_id}</code> (${escapeHtml(log.rule_msg)})</div>
            <div><strong>User-Agent:</strong> <code>${escapeHtml(log.user_agent || 'N/A')}</code></div>
            <div style="margin-top:12px;"><strong>Raw Payload / Request Body:</strong></div>
            <pre style="background:#090d16; padding:10px; border-radius:6px; overflow-x:auto; margin-top:4px; color:#ef4444;">${escapeHtml(log.raw_payload || log.uri)}</pre>
        </div>
    `;
    document.getElementById('modal-log-details').classList.add('active');
}

async function deleteIPRule(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa quy tắc IP này?')) return;
    try {
        await fetch(`${API_BASE}/ip-rules/${id}`, { method: 'DELETE' });
        loadIPRules();
        loadDashboardStats();
    } catch (err) {
        alert('Lỗi xóa IP rule: ' + err);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
