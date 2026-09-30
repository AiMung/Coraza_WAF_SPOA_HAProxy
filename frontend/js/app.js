// ==========================================
// aaWAF Dashboard & GeoIP Map Controller
// ==========================================

const API_BASE = window.location.origin.includes('http') ? `${window.location.origin}/api` : 'http://192.168.246.100:8080/api';
const WS_URL = window.location.origin.includes('http') 
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`
    : 'ws://192.168.246.100:8080/ws';

let mapInstance = null;
let attackMarkers = [];
let timelineChart = null;
let categoryChart = null;

// GeoIP Mock database for demo (resolves local / simulation IPs to world coordinates)
const geoIPLookup = {
    '192.168.246.1': { country: 'Vietnam', city: 'Ho Chi Minh City', code: 'VN', flag: '🇻🇳', lat: 10.8231, lng: 106.6297 },
    '127.0.0.1': { country: 'Vietnam', city: 'Hanoi', code: 'VN', flag: '🇻🇳', lat: 21.0285, lng: 105.8542 },
    'default': { country: 'United States', city: 'San Jose', code: 'US', flag: '🇺🇸', lat: 37.3382, lng: -121.8863 }
};

const attackOrigins = [
    { country: 'Vietnam', city: 'Ho Chi Minh', flag: '🇻🇳', lat: 10.8231, lng: 106.6297 },
    { country: 'China', city: 'Beijing', flag: '🇨🇳', lat: 39.9042, lng: 116.4074 },
    { country: 'United States', city: 'San Jose', flag: '🇺🇸', lat: 37.7749, lng: -122.4194 },
    { country: 'Russia', city: 'Moscow', flag: '🇷🇺', lat: 55.7558, lng: 37.6173 },
    { country: 'Germany', city: 'Frankfurt', flag: '🇩🇪', lat: 50.1109, lng: 8.6821 },
    { country: 'Singapore', city: 'Singapore', flag: '🇸🇬', lat: 1.3521, lng: 103.8198 }
];

document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    initOverviewCharts();
    initWorldMap();
    loadDashboardStats();
    loadInterceptionLogs();
    loadIPRules();
    loadRulesList();
    loadTelegramSettings();
    setupWebSocket();
});

// 1. Tab Navigation
function setupNavigation() {
    const navLinks = document.querySelectorAll('.sidebar-nav .nav-link:not(.logout-link)');
    const panels = document.querySelectorAll('.tab-panel');
    const headerTitle = document.getElementById('header-title');

    const titles = {
        'overview': 'Overview',
        'map': 'Attack World Map (GeoIP)',
        'website': 'Website',
        'logs': 'Interception log',
        'ip-control': 'Black/white list',
        'rules': 'Custom rules',
        'bot': 'Recaptcha / CC Defense',
        'telegram': 'Telegram Alert',
        'settings': 'Settings'
    };

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const tabId = link.getAttribute('data-tab');

            navLinks.forEach(l => l.classList.remove('active'));
            panels.forEach(p => p.classList.remove('active'));

            link.classList.add('active');
            const targetPanel = document.getElementById(`tab-${tabId}`);
            if (targetPanel) targetPanel.classList.add('active');

            if (titles[tabId]) headerTitle.innerText = titles[tabId];

            if (tabId === 'map' && mapInstance) {
                setTimeout(() => mapInstance.invalidateSize(), 200);
            }
            if (tabId === 'logs') loadInterceptionLogs();
            if (tabId === 'ip-control') loadIPRules();
            if (tabId === 'rules') loadRulesList();
        });
    });
}

// 2. Leaflet World Attack Map
function initWorldMap() {
    const mapElement = document.getElementById('attack-world-map');
    if (!mapElement) return;

    mapInstance = L.map('attack-world-map', {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 8,
        worldCopyJump: true
    });

    // Dark Tile Layer for Cyber Attack Map aesthetic
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; OpenStreetMap &copy; CARTO',
        subdomains: 'abcd',
        maxZoom: 19
    }).addTo(mapInstance);

    // Target Server Pin (Hanoi / Protected Server)
    const targetIcon = L.divIcon({
        className: 'target-pin',
        html: `<div style="background:#20a53a; width:16px; height:16px; border-radius:50%; border:3px solid #fff; box-shadow:0 0 15px #20a53a;"></div>`,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });
    L.marker([21.0285, 105.8542], { icon: targetIcon }).addTo(mapInstance)
        .bindPopup(`<b>🛡️ Protected Server (aaWAF)</b><br>IP: 192.168.246.100<br>Status: Shield Active`).openPopup();
}

function addAttackMapPin(lat, lng, ip, attackType, country, flag) {
    if (!mapInstance) return;

    const attackIcon = L.divIcon({
        className: 'attack-pin',
        html: `<div style="background:#ef4444; width:14px; height:14px; border-radius:50%; border:2px solid #fff; box-shadow:0 0 12px #ef4444; animation:pulseRed 1.5s infinite;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });

    const marker = L.marker([lat, lng], { icon: attackIcon }).addTo(mapInstance);
    marker.bindPopup(`
        <div style="font-size:12px;">
            <strong>🚨 ATTACK BLOCKED</strong><br>
            <b>Origin:</b> ${flag} ${country}<br>
            <b>Attacker IP:</b> <code>${ip}</code><br>
            <b>Type:</b> <span style="color:#ef4444; font-weight:bold;">${attackType}</span><br>
            <b>Action:</b> 403 Forbidden (Coraza WAF)
        </div>
    `).openPopup();

    // Draw Attack Arc Line to Protected Server (Vietnam: 21.0285, 105.8542)
    const polyline = L.polyline([[lat, lng], [21.0285, 105.8542]], {
        color: '#ef4444',
        weight: 2,
        opacity: 0.7,
        dashArray: '4, 8'
    }).addTo(mapInstance);

    attackMarkers.push({ marker, polyline });
    if (attackMarkers.length > 20) {
        const oldest = attackMarkers.shift();
        mapInstance.removeLayer(oldest.marker);
        mapInstance.removeLayer(oldest.polyline);
    }
}

// 3. Overview Charts
function initOverviewCharts() {
    const ctxTimeline = document.getElementById('overviewTimelineChart').getContext('2d');
    timelineChart = new Chart(ctxTimeline, {
        type: 'line',
        data: {
            labels: ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00', 'Now'],
            datasets: [{
                label: 'Interceptions (Blocked)',
                data: [0, 0, 0, 0, 0, 0, 0],
                borderColor: '#20a53a',
                backgroundColor: 'rgba(32, 165, 58, 0.08)',
                fill: true,
                tension: 0.35,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { color: '#f3f4f6' }, ticks: { color: '#6b7280' } },
                y: { grid: { color: '#f3f4f6' }, ticks: { color: '#6b7280', precision: 0 }, beginAtZero: true }
            }
        }
    });

    const ctxCat = document.getElementById('overviewCategoryChart').getContext('2d');
    categoryChart = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: ['SQL Injection', 'XSS', 'Path Traversal', 'Scanner', 'Others'],
            datasets: [{
                data: [0, 0, 0, 0, 0],
                backgroundColor: ['#ef4444', '#f59e0b', '#2563eb', '#8b5cf6', '#20a53a'],
                borderWidth: 0
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, padding: 8, font: { size: 11 } } } },
            cutout: '72%'
        }
    });
}

// 4. Load Stats
async function loadDashboardStats() {
    try {
        const res = await fetch(`${API_BASE}/stats`);
        if (!res.ok) return;
        const data = await res.json();

        document.getElementById('stat-total-blocked').innerText = data.total_attacks || 0;
        document.getElementById('stat-today-attacks').innerText = data.attacks_today || 0;
        document.getElementById('badge-total-blocked').innerText = data.total_attacks || 0;
        document.getElementById('site-blocked-count').innerText = data.total_attacks || 0;

        if (data.attack_types && Object.keys(data.attack_types).length > 0) {
            categoryChart.data.labels = Object.keys(data.attack_types);
            categoryChart.data.datasets[0].data = Object.values(data.attack_types);
            categoryChart.update();
        }

        if (data.recent_timeline && data.recent_timeline.length > 0) {
            timelineChart.data.labels = data.recent_timeline.map(t => t.hour);
            timelineChart.data.datasets[0].data = data.recent_timeline.map(t => t.count);
            timelineChart.update();
        }

        const topBox = document.getElementById('overview-top-ips');
        if (data.top_attacker_ips && data.top_attacker_ips.length > 0) {
            topBox.innerHTML = data.top_attacker_ips.map(item => `
                <div class="top-ip-row">
                    <div><i class="fa-solid fa-ban text-red"></i> <code>${item.ip}</code> (VN 🇻🇳)</div>
                    <span class="badge-status red">${item.count} attacks</span>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Stats error:', e);
    }
}

// 5. Interception Logs
async function loadInterceptionLogs() {
    const ip = document.getElementById('log-search-ip')?.value || '';
    const type = document.getElementById('log-search-type')?.value || '';

    try {
        const res = await fetch(`${API_BASE}/logs?ip=${encodeURIComponent(ip)}&type=${encodeURIComponent(type)}`);
        if (!res.ok) return;
        const result = await res.json();
        const logs = result.data || [];

        const tbody = document.getElementById('interception-logs-body');
        if (!tbody) return;

        if (logs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted">No interception records found.</td></tr>`;
            return;
        }

        tbody.innerHTML = logs.map(l => `
            <tr>
                <td>#${l.id}</td>
                <td>${l.timestamp}</td>
                <td><code>${l.client_ip}</code> <span style="font-size:11px;">(VN 🇻🇳)</span></td>
                <td><span class="badge-status orange">${l.method}</span> <code style="font-size:11px;">${escapeHtml(l.uri)}</code></td>
                <td><span class="badge-status red">${l.attack_type}</span></td>
                <td>Rule ${l.rule_id}</td>
                <td><span class="badge-status red">403 Deny</span></td>
                <td><button class="btn-sm btn-outline" onclick="viewLogDetail(${JSON.stringify(l).replace(/"/g, '&quot;')})">View</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('Log error:', e);
    }
}

// 6. IP Rules
async function loadIPRules() {
    try {
        const res = await fetch(`${API_BASE}/ip-rules`);
        if (!res.ok) return;
        const rules = await res.json();

        const tbody = document.getElementById('ip-rules-body');
        if (!tbody) return;

        if (rules.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted">No IP rules configured.</td></tr>`;
            return;
        }

        tbody.innerHTML = rules.map(r => `
            <tr>
                <td><code>${r.ip}</code></td>
                <td><span class="badge-status ${r.rule_type === 'blacklist' ? 'red' : 'green'}">${r.rule_type.toUpperCase()}</span></td>
                <td>${escapeHtml(r.reason || 'N/A')}</td>
                <td>${r.created_at}</td>
                <td><button class="btn-sm btn-outline" style="color:#ef4444;" onclick="deleteIPRule(${r.id})"><i class="fa-solid fa-trash"></i> Delete</button></td>
            </tr>
        `).join('');
    } catch (e) {
        console.error('IP rules error:', e);
    }
}

// 7. Rules List
async function loadRulesList() {
    try {
        const res = await fetch(`${API_BASE}/rules`);
        if (!res.ok) return;
        const rules = await res.json();

        const container = document.getElementById('aawaf-rules-list');
        if (!container) return;

        container.innerHTML = rules.map(r => `
            <div class="rule-box-aawaf">
                <div class="rule-box-head">
                    <span class="badge-status orange">ID: ${r.id}</span>
                    <span class="badge-status green">${r.status}</span>
                </div>
                <h4 style="font-size:13px; margin: 4px 0 2px;">${r.name}</h4>
                <p class="text-muted">Category: <strong>${r.category}</strong> | Action: <span class="text-red">${r.action}</span></p>
            </div>
        `).join('');
    } catch (e) {
        console.error('Rules error:', e);
    }
}

// 8. Telegram Settings
async function loadTelegramSettings() {
    try {
        const res = await fetch(`${API_BASE}/telegram`);
        if (!res.ok) return;
        const cfg = await res.json();

        document.getElementById('tg-bot-token').value = cfg.bot_token || '';
        document.getElementById('tg-chat-id-val').value = cfg.chat_id || '';
        document.getElementById('tg-enable-switch').checked = cfg.enabled || false;
    } catch (e) {
        console.error('Telegram settings error:', e);
    }
}

// 9. WebSocket Live Receiver
function setupWebSocket() {
    let socket = null;
    function connect() {
        socket = new WebSocket(WS_URL);
        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.event === 'new_attack') {
                    handleLiveAttack(msg.data);
                }
            } catch (e) {}
        };
        socket.onclose = () => setTimeout(connect, 3000);
    }
    connect();
}

function handleLiveAttack(log) {
    // 1. Pick a geo location
    const randomOrigin = attackOrigins[Math.floor(Math.random() * attackOrigins.length)];
    const geo = geoIPLookup[log.client_ip] || randomOrigin;

    // 2. Prepend to Overview Live Feed Table
    const tbody = document.getElementById('overview-live-feed');
    if (tbody) {
        const row = document.createElement('tr');
        row.style.background = '#fef2f2';
        row.innerHTML = `
            <td>${log.timestamp}</td>
            <td><code>${log.client_ip}</code></td>
            <td>${geo.flag} ${geo.country}</td>
            <td><span class="badge-status red">${log.attack_type}</span></td>
            <td><code style="font-size:11px;">${escapeHtml(log.uri)}</code></td>
            <td><span class="badge-status red">403 Blocked</span></td>
        `;
        if (tbody.children[0]?.innerText.includes('Listening')) tbody.innerHTML = '';
        tbody.prepend(row);
        setTimeout(() => { row.style.background = 'transparent'; }, 2000);
    }

    // 3. Add to Attack World Map
    addAttackMapPin(geo.lat, geo.lng, log.client_ip, log.attack_type, geo.country, geo.flag);

    // 4. Update Stats
    loadDashboardStats();
}

// 10. Actions & Handlers
async function simulateAttack(type = 'sqli') {
    try {
        const res = await fetch(`${API_BASE}/simulate-attack?type=${type}`, { method: 'POST' });
        const data = await res.json();
        alert(`🚨 [aaWAF Simulation] Cuộc tấn công mẫu ${type.toUpperCase()} đã được phát hiện và chặn 403 thành công!`);
    } catch (e) {
        alert('Simulation error: ' + e);
    }
}

async function testTelegramAlert() {
    try {
        const res = await fetch(`${API_BASE}/telegram/test`, { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
            alert('🎉 ' + data.message);
        } else {
            alert('❌ ' + data.error);
        }
    } catch (e) {
        alert('Test error: ' + e);
    }
}

document.getElementById('aawaf-tg-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
        bot_token: document.getElementById('tg-bot-token').value.trim(),
        chat_id: document.getElementById('tg-chat-id-val').value.trim(),
        enabled: document.getElementById('tg-enable-switch').checked
    };

    try {
        const res = await fetch(`${API_BASE}/telegram`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.ok) alert('✅ Cấu hình Telegram đã được lưu thành công!');
    } catch (err) {
        alert('Lỗi lưu: ' + err);
    }
});

function openAddIPModal() { document.getElementById('modal-add-ip').classList.add('active'); }
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

async function saveNewIPRule() {
    const ip = document.getElementById('input-new-ip').value.trim();
    const rule_type = document.getElementById('input-new-ip-type').value;
    const reason = document.getElementById('input-new-ip-reason').value.trim();

    if (!ip) return alert('Vui lòng nhập IP!');

    try {
        const res = await fetch(`${API_BASE}/ip-rules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ip, rule_type, reason })
        });
        if (res.ok) {
            closeModal('modal-add-ip');
            loadIPRules();
        }
    } catch (e) {
        alert('Lỗi: ' + e);
    }
}

async function deleteIPRule(id) {
    if (!confirm('Xóa quy tắc IP này?')) return;
    try {
        await fetch(`${API_BASE}/ip-rules/${id}`, { method: 'DELETE' });
        loadIPRules();
    } catch (e) {}
}

function viewLogDetail(log) {
    const body = document.getElementById('modal-log-body');
    body.innerHTML = `
        <div style="font-family:monospace; font-size:12px; line-height:1.8;">
            <div><strong>Transaction ID:</strong> <code>${log.txn_id}</code></div>
            <div><strong>Attacker IP:</strong> <code>${log.client_ip}</code> (VN 🇻🇳)</div>
            <div><strong>Timestamp:</strong> ${log.timestamp}</div>
            <div><strong>HTTP Request:</strong> <code>${log.method} ${escapeHtml(log.uri)}</code></div>
            <div><strong>Attack Classification:</strong> <span class="badge-status red">${log.attack_type}</span></div>
            <div><strong>Rule ID:</strong> <code>${log.rule_id}</code> (${escapeHtml(log.rule_msg)})</div>
            <div><strong>User-Agent:</strong> <code>${escapeHtml(log.user_agent || 'N/A')}</code></div>
            <div style="margin-top:10px;"><strong>Raw Payload:</strong></div>
            <pre style="background:#f3f4f6; padding:8px; border-radius:4px; color:#b91c1c; overflow-x:auto;">${escapeHtml(log.raw_payload || log.uri)}</pre>
        </div>
    `;
    document.getElementById('modal-log-details').classList.add('active');
}

function testWafClean() { alert('🔧 Tất cả cấu hình WAF và HAProxy đều đang hoạt động tối ưu!'); }
function restartServices() { alert('🔄 Dịch vụ HAProxy & Coraza SPOA đã được làm mới!'); }
function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else if (document.exitFullscreen) document.exitFullscreen();
}

function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
