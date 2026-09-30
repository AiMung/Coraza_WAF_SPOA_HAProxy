import React, { useState, useMemo, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import WorldMap from '../components/WorldMap';
import RangeOverview from '../components/RangeOverview';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Overview({ 
  stats, 
  attackPins = [],
  timeFilter: timeFilterProp,
  onTimeFilterChange, 
  onCategoryFilterChange, 
  onSimulateAttack,
  onAddBlacklist,
  onRefresh 
}) {
  const [timeFilterLocal, setTimeFilterLocal] = useState(timeFilterProp || '30days');
  const timeFilter = timeFilterProp || timeFilterLocal;
  const [categoryFilter, setCategoryFilter] = useState('ip_rank');

  useEffect(() => {
    if (timeFilterProp) setTimeFilterLocal(timeFilterProp);
  }, [timeFilterProp]);
  const [selectedLogModal, setSelectedLogModal] = useState(null);
  const [copiedCurl, setCopiedCurl] = useState(false);
  const [simulating, setSimulating] = useState('');

  const handleTimeChange = (nextRange) => {
    setTimeFilterLocal(nextRange);
    if (onTimeFilterChange) {
      onTimeFilterChange(nextRange, categoryFilter);
    }
  };

  const handleCategoryChange = (cat) => {
    setCategoryFilter(cat);
    if (onCategoryFilterChange) {
      onCategoryFilterChange(timeFilter, cat);
    }
  };

  const handleTriggerSimulate = async (type) => {
    setSimulating(type);
    if (onSimulateAttack) {
      await onSimulateAttack(type);
    }
    setSimulating('');
  };

  const sys = stats.system_status || {
    sys: 'N/A',
    run: 'N/A',
    load: 'N/A',
    cpu_cores: 'N/A',
    cpu_percent: 0,
    mem_used_mb: 0,
    mem_total_mb: 0,
    mem_percent: 0,
  };

  const telemetry = stats.telemetry_charts || {
    qps: '0/s',
    resource_time: '0ms',
    transmit_kb: '0 KB',
    receive_kb: '0 KB',
    timestamps: [],
    qps_series: [],
    latency_series: [],
    traffic_series: [],
  };

  // Safe URI decoder
  const safeDecodeURI = (uri = '') => {
    try {
      return decodeURIComponent(uri);
    } catch (e) {
      return uri;
    }
  };

  // 1. Request Trends Line Chart
  const trendHours = (stats.request_trends && stats.request_trends.length > 0)
    ? stats.request_trends.map(t => t.time)
    : [];

  const trendTotals = (stats.request_trends && stats.request_trends.length > 0)
    ? stats.request_trends.map(t => t.total_requests)
    : [];

  const trendChartData = {
    labels: trendHours,
    datasets: [
      {
        label: 'Tổng Request',
        data: trendTotals,
        borderColor: '#10b981',
        backgroundColor: (context) => {
          const ctx = context.chart.ctx;
          const gradient = ctx.createLinearGradient(0, 0, 0, 140);
          gradient.addColorStop(0, 'rgba(16, 185, 129, 0.28)');
          gradient.addColorStop(1, 'rgba(16, 185, 129, 0.00)');
          return gradient;
        },
        fill: true,
        borderWidth: 2.5,
        tension: 0.35,
        pointRadius: 3,
        pointBackgroundColor: '#10b981',
        pointHoverRadius: 6,
      },
    ],
  };

  const trendChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        borderColor: '#334155',
        borderWidth: 1,
        padding: 10,
        displayColors: false,
        callbacks: {
          label: (context) => ` Lưu lượng: ${context.parsed.y.toLocaleString()} requests`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: 'rgba(226, 232, 240, 0.6)', drawBorder: false },
        ticks: { color: '#64748b', font: { size: 10, family: 'Inter' } },
      },
      y: {
        grid: { color: 'rgba(226, 232, 240, 0.6)', drawBorder: false },
        ticks: {
          color: '#64748b',
          font: { size: 9, family: 'Inter' },
          callback: (val) => (val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val),
        },
        beginAtZero: true,
      },
    },
  };

  // Sparkline Chart Options
  const createSparkOptions = (color = '#10b981') => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#cbd5e1',
        padding: 6,
        displayColors: false,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { color: '#94a3b8', font: { size: 9 }, maxTicksLimit: 5 },
      },
      y: {
        grid: { color: 'rgba(241, 245, 249, 0.8)' },
        ticks: { color: '#94a3b8', font: { size: 8 } },
        beginAtZero: true,
      },
    },
  });

  const qpsData = {
    labels: telemetry.timestamps,
    datasets: [
      {
        data: telemetry.qps_series,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.12)',
        fill: true,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };

  const latencyData = {
    labels: telemetry.timestamps,
    datasets: [
      {
        data: telemetry.latency_series,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.12)',
        fill: true,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };

  const trafficData = {
    labels: telemetry.timestamps,
    datasets: [
      {
        data: telemetry.traffic_series,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.14)',
        fill: true,
        borderWidth: 2,
        tension: 0.35,
        pointRadius: 0,
      },
    ],
  };

  const formatNumber = (num) => (num || 0).toLocaleString('en-US');

  const accessMapRank = stats.access_map_rank || [];
  const slowRequests = stats.slow_requests || [];
  const latestNews = stats.latest_news || [];

  const combinedPins = useMemo(() => {
    if (attackPins && attackPins.length > 0) {
      return attackPins;
    }
    return accessMapRank;
  }, [attackPins, accessMapRank]);

  const copyCurlRepro = (log) => {
    const host = window.location.hostname || '192.168.246.100';
    const curlCmd = `curl -i -X GET "http://${host}${log.uri}" -A "${log.user_agent || 'Mozilla/5.0'}"`;
    navigator.clipboard.writeText(curlCmd);
    setCopiedCurl(true);
    setTimeout(() => setCopiedCurl(false), 2000);
  };

  const totalAttacks = stats.malicious_requests_today || stats.total_attacks || 0;
  const requestsToday = stats.requests_today || 0;
  const blockRatio = requestsToday > 0 ? ((totalAttacks / requestsToday) * 100).toFixed(2) : '0.00';

  return (
    <div className="aawaf-dashboard-page">
      {/* 0. COMMAND BAR: Quick Attack Simulator & SOC Engine Status */}
      <div className="soc-command-strip">
        <div className="engine-status-indicators">
          <div className="soc-status-badge green">
            <span className="pulsing-radar-dot"></span>
            <span>CORAZA SPOA: <strong>ACTIVE</strong></span>
          </div>
          <div className="soc-status-badge blue">
            <i className="fa-solid fa-layer-group"></i>
            <span>CRS v4.9: <strong>ENABLED</strong></span>
          </div>
          <div className="soc-status-badge red">
            <i className="fa-solid fa-shield-virus"></i>
            <span>ACTION: <strong>403 BLOCK</strong></span>
          </div>
        </div>

        <div className="soc-simulation-toolbar">
          <span className="sim-label"><i className="fa-solid fa-flask"></i> Mô phỏng tấn công:</span>
          <button
            className={`btn-sim-pill red ${simulating === 'sqli' ? 'loading' : ''}`}
            onClick={() => handleTriggerSimulate('sqli')}
            disabled={!!simulating}
            title="Gửi Payload SQL Injection (?id=1' OR 1=1--)"
          >
            <i className="fa-solid fa-database"></i> SQLi
          </button>
          <button
            className={`btn-sim-pill orange ${simulating === 'xss' ? 'loading' : ''}`}
            onClick={() => handleTriggerSimulate('xss')}
            disabled={!!simulating}
            title="Gửi Payload XSS (<script>alert(1)</script>)"
          >
            <i className="fa-solid fa-code"></i> XSS
          </button>
          <button
            className={`btn-sim-pill pink ${simulating === 'lfi' ? 'loading' : ''}`}
            onClick={() => handleTriggerSimulate('lfi')}
            disabled={!!simulating}
            title="Gửi Payload Path Traversal (/etc/passwd)"
          >
            <i className="fa-solid fa-folder-open"></i> LFI
          </button>
          <button
            className={`btn-sim-pill purple ${simulating === 'scanner' ? 'loading' : ''}`}
            onClick={() => handleTriggerSimulate('scanner')}
            disabled={!!simulating}
            title="Mô phỏng Scanner Nikto/Nmap"
          >
            <i className="fa-solid fa-radar"></i> Scanner
          </button>
          <button className="btn-sim-refresh" onClick={onRefresh} title="Làm mới số liệu">
            <i className="fa-solid fa-arrows-rotate"></i>
          </button>
        </div>
      </div>

      <RangeOverview
        timeFilter={timeFilter}
        onChange={handleTimeChange}
        stats={stats}
      />

      {/* 1. TOP ROW: Requests Today + Request Trends + System Status */}
      <div className="overview-top-row">
        {/* Requests Today & Malicious requests Card */}
        <div className="dashboard-card card-today-stats">
          <div className="stat-item-box">
            <div className="stat-header-label">
              <span className="icon-circle-pill green">
                <i className="fa-solid fa-chart-line"></i>
              </span>
              <span>Lưu lượng hôm nay</span>
            </div>
            <div className="stat-big-num green-gradient-text">{formatNumber(requestsToday)}</div>
            <div className="stat-sub-info">
              <span className="stat-trend-tag green"><i className="fa-solid fa-arrow-up"></i> +14.2%</span>
              <span className="stat-sub-txt">Tổng HTTP requests</span>
            </div>
          </div>

          <div className="stat-divider-line"></div>

          <div className="stat-item-box">
            <div className="stat-header-label">
              <span className="icon-circle-pill red">
                <i className="fa-solid fa-shield-virus"></i>
              </span>
              <span>Đã chặn hôm nay</span>
            </div>
            <div className="stat-big-num red-gradient-text">{formatNumber(totalAttacks)}</div>
            <div className="stat-sub-info">
              <span className="stat-trend-tag red"><i className="fa-solid fa-shield"></i> 100% blocked</span>
              <span className="stat-sub-txt">Tỷ lệ: {blockRatio}%</span>
            </div>
          </div>
        </div>

        {/* Request Trends Line Chart */}
        <div className="dashboard-card card-trend-chart">
          <div className="trends-header-flex">
            <div className="trends-title-wrap">
              <span className="trends-icon-dot green"></span>
              <span className="trends-title">Xu hướng lưu lượng truy cập (Traffic Trends)</span>
            </div>
            <div className="trends-legend-flex">
              <span className="legend-badge green"><span className="legend-dot green"></span> Tổng Request</span>
            </div>
          </div>
          <div style={{ height: '115px', marginTop: '6px' }}>
            <Line data={trendChartData} options={trendChartOptions} />
          </div>
        </div>

        {/* System Status Telemetry Widget */}
        <div className="dashboard-card card-sys-status">
          <div className="sys-card-header">
            <span className="sys-title"><i className="fa-solid fa-server"></i> Hệ điều hành & Phần cứng</span>
            <span className="badge-live-os">Ubuntu 26.04</span>
          </div>

          <div className="sys-status-list">
            <div className="sys-status-row">
              <span className="sys-label"><i className="fa-brands fa-ubuntu"></i> Sys OS</span>
              <span className="sys-val mono-val">{sys.sys}</span>
            </div>
            <div className="sys-status-row">
              <span className="sys-label"><i className="fa-solid fa-clock-rotate-left"></i> Uptime</span>
              <span className="sys-val">{sys.run}</span>
            </div>
            <div className="sys-status-row">
              <span className="sys-label"><i className="fa-solid fa-gauge-high"></i> Load Avg</span>
              <span className="sys-val mono-val">{sys.load}</span>
            </div>
            <div className="sys-status-row">
              <span className="sys-label"><i className="fa-solid fa-microchip"></i> CPU Cores</span>
              <div className="sys-progress-wrap">
                <span className="sys-val">{sys.cpu_cores}</span>
                <div className="sys-bar-bg">
                  <div className="sys-bar-fill green-bar" style={{ width: `${Math.max(sys.cpu_percent, 6)}%` }}></div>
                </div>
              </div>
            </div>
            <div className="sys-status-row">
              <span className="sys-label"><i className="fa-solid fa-memory"></i> RAM Memory</span>
              <div className="sys-progress-wrap">
                <span className="sys-val">{sys.mem_used_mb} / {sys.mem_total_mb} MB ({sys.mem_percent?.toFixed(1)}%)</span>
                <div className="sys-bar-bg">
                  <div className="sys-bar-fill blue-bar" style={{ width: `${sys.mem_percent}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. MIDDLE ROW: Left 3 Telemetry Sparklines + Right Access Map */}
      <div className="overview-middle-row">
        {/* Left 3 Sparklines */}
        <div className="telemetry-spark-stack">
          <div className="spark-card">
            <div className="spark-header">
              <div className="spark-title-left">
                <i className="fa-solid fa-bolt" style={{ color: '#10b981' }}></i>
                <span>QPS Đang xử lý:</span>
                <strong className="spark-highlight green">{telemetry.qps}</strong>
              </div>
              <span className="badge-status green-light">Real-time</span>
            </div>
            <div className="spark-chart-box">
              <Line data={qpsData} options={createSparkOptions('#10b981')} />
            </div>
          </div>

          <div className="spark-card">
            <div className="spark-header">
              <div className="spark-title-left">
                <i className="fa-solid fa-stopwatch" style={{ color: '#3b82f6' }}></i>
                <span>Resource Latency:</span>
                <strong className="spark-highlight blue">{telemetry.resource_time}</strong>
              </div>
              <span className="badge-status blue-light">Độ trễ</span>
            </div>
            <div className="spark-chart-box">
              <Line data={latencyData} options={createSparkOptions('#3b82f6')} />
            </div>
          </div>

          <div className="spark-card">
            <div className="spark-header">
              <div className="spark-title-left">
                <i className="fa-solid fa-network-wired" style={{ color: '#f59e0b' }}></i>
                <span>Băng thông Tx/Rx:</span>
                <strong className="spark-highlight orange">{telemetry.transmit_kb}</strong>
              </div>
              <span className="badge-status gray-light">{telemetry.receive_kb} Rx</span>
            </div>
            <div className="spark-chart-box">
              <Line data={trafficData} options={createSparkOptions('#f59e0b')} />
            </div>
          </div>
        </div>

        {/* Right Access Threat Map & Rank Table */}
        <div className="dashboard-card access-map-card">
          <div className="access-map-top-bar">
            <div className="map-title-wrap">
              <span className="icon-circle-sm green">
                <i className="fa-solid fa-earth-americas"></i>
              </span>
              <span className="map-title">Bản đồ nguồn gốc tấn công & Tọa độ IP (Threat Radar Map)</span>
              <span className="threat-count-pill">{combinedPins.length} Tọa độ</span>
            </div>

            <div className="map-time-tabs">
              <button className={`btn-time-tab ${timeFilter === 'today' ? 'active' : ''}`} onClick={() => handleTimeChange('today')}>Hôm nay</button>
              <button className={`btn-time-tab ${timeFilter === 'yesterday' ? 'active' : ''}`} onClick={() => handleTimeChange('yesterday')}>Hôm qua</button>
              <button className={`btn-time-tab ${timeFilter === '7days' ? 'active' : ''}`} onClick={() => handleTimeChange('7days')}>7 ngày</button>
              <button className={`btn-time-tab ${timeFilter === '30days' ? 'active' : ''}`} onClick={() => handleTimeChange('30days')}>30 ngày</button>
            </div>
          </div>

          <div className="map-filter-subtabs">
            <button className={`btn-sub-filter ${categoryFilter === 'all' ? 'active' : ''}`} onClick={() => handleCategoryChange('all')}>
              <i className="fa-solid fa-globe"></i> Tất cả
            </button>
            <button className={`btn-sub-filter ${categoryFilter === 'attack' ? 'active' : ''}`} onClick={() => handleCategoryChange('attack')}>
              <i className="fa-solid fa-shield-virus"></i> Đã chặn (403)
            </button>
            <button className={`btn-sub-filter ${categoryFilter === 'ip_rank' ? 'active' : ''}`} onClick={() => handleCategoryChange('ip_rank')}>
              <i className="fa-solid fa-ranking-star"></i> Xếp hạng IP
            </button>
          </div>

          <div className="map-and-table-grid">
            {/* Interactive World Map */}
            <div className="map-display-container">
              <WorldMap attackPins={combinedPins} />
            </div>

            {/* Access IP Rank Table */}
            <div className="map-rank-table-wrap">
              <div className="rank-table-head">
                <span>Top IP truy cập / tấn công</span>
                <span className="rank-total-tag">{accessMapRank.length} IPs</span>
              </div>
              <div className="rank-table-scroll">
                <table className="map-rank-table">
                  <thead>
                    <tr>
                      <th>Access IP</th>
                      <th>Requests</th>
                      <th>Vùng</th>
                      <th style={{ textAlign: 'center', width: '38px' }}>Chặn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessMapRank.length === 0 ? (
                      <tr>
                        <td colSpan="4" style={{ textAlign: 'center', padding: '20px', color: '#94a3b8' }}>
                          Chưa có dữ liệu IP
                        </td>
                      </tr>
                    ) : (
                      accessMapRank.map((item, index) => (
                        <tr key={index}>
                          <td>
                            <div className="ip-cell-flex">
                              <span className="ip-flag">{item.flag || '🇻🇳'}</span>
                              <span className="ip-text mono-code">{item.access_ip}</span>
                            </div>
                          </td>
                          <td style={{ fontWeight: 600, color: '#0f172a' }}>{formatNumber(item.requests)}</td>
                          <td>
                            <span className="badge-status gray-light">{item.ip_area || 'Vietnam'}</span>
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              className="btn-icon-sq red"
                              onClick={() => onAddBlacklist && onAddBlacklist(item.access_ip, 'Blocked from Threat Map')}
                              title="Thêm vào Blacklist vĩnh viễn"
                            >
                              <i className="fa-solid fa-ban"></i>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. BOTTOM ROW: Slow Request Table (Left) + Latest News Interceptions Table (Right) */}
      <div className="overview-bottom-row">
        {/* Slow Request Table */}
        <div className="dashboard-card bottom-card">
          <div className="table-header-flex">
            <div className="card-heading-wrap">
              <span className="icon-circle-sm orange"><i className="fa-solid fa-hourglass-half"></i></span>
              <span className="card-heading-txt">Yêu cầu xử lý chậm (Slow Requests)</span>
            </div>
            <span className="badge-pill-counter">{slowRequests.length}</span>
          </div>

          <div className="table-container">
            <table className="aawaf-table-styled">
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Thời gian</th>
                  <th>URI Target</th>
                  <th style={{ width: '85px', textAlign: 'right' }}>Độ trễ</th>
                </tr>
              </thead>
              <tbody>
                {slowRequests.length === 0 ? (
                  <tr>
                    <td colSpan="3" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      <i className="fa-solid fa-circle-check" style={{ color: '#10b981', marginRight: '6px' }}></i>
                      Tất cả yêu cầu phản hồi nhanh &lt; 20ms
                    </td>
                  </tr>
                ) : (
                  slowRequests.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{item.date?.slice(11, 19) || item.date}</td>
                      <td>
                        <div className="uri-cell-wrap mono-code" title={safeDecodeURI(item.uri)}>
                          {safeDecodeURI(item.uri)}
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <span className="badge-status orange-light">{item.access_time}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Latest Interceptions Table */}
        <div className="dashboard-card bottom-card">
          <div className="table-header-flex">
            <div className="card-heading-wrap">
              <span className="icon-circle-sm red"><i className="fa-solid fa-shield-halved"></i></span>
              <span className="card-heading-txt">Sự kiện bảo mật mới nhất (Security Events)</span>
            </div>
            <span className="badge-pill-counter red">{latestNews.length}</span>
          </div>

          <div className="table-container">
            <table className="aawaf-table-styled">
              <thead>
                <tr>
                  <th style={{ width: '90px' }}>Thời gian</th>
                  <th style={{ width: '130px' }}>IP Kẻ tấn công</th>
                  <th>Loại mã độc</th>
                  <th style={{ width: '70px' }}>Trạng thái</th>
                  <th style={{ width: '75px', textAlign: 'center' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {latestNews.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={{ textAlign: 'center', padding: '24px', color: '#94a3b8' }}>
                      Chưa ghi nhận sự kiện tấn công
                    </td>
                  </tr>
                ) : (
                  latestNews.map((news) => (
                    <tr key={news.id}>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{news.access_time?.slice(11, 19) || news.access_time}</td>
                      <td>
                        <span className="mono-code ip-bold-txt">{news.bad_ip}</span>
                      </td>
                      <td>
                        <span className="badge-threat red-threat">{news.attack_type || 'Attack'}</span>
                      </td>
                      <td>
                        <span className="status-blocked-pill">403 Blocked</span>
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div className="action-btns-row">
                          <button 
                            className="btn-icon-sq blue"
                            onClick={() => setSelectedLogModal(news)}
                            title="Xem chi tiết phân tích"
                          >
                            <i className="fa-solid fa-eye"></i>
                          </button>
                          <button 
                            className="btn-icon-sq red"
                            onClick={() => onAddBlacklist && onAddBlacklist(news.bad_ip, `Blocked from Attack Event: ${news.attack_type}`)}
                            title="Chặn IP này"
                          >
                            <i className="fa-solid fa-ban"></i>
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

      {/* Forensic Inspection Modal */}
      {selectedLogModal && (
        <div className="modal-backdrop" onClick={() => setSelectedLogModal(null)}>
          <div className="modal-container-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header-styled">
              <div className="modal-header-left">
                <span className="icon-circle-pill red"><i className="fa-solid fa-fingerprint"></i></span>
                <div>
                  <h3 className="modal-heading-title">
                    Phân tích chi tiết cuộc tấn công #{selectedLogModal.id}
                  </h3>
                  <p className="modal-heading-sub">Coraza WAF Engine Forensics & Telemetry Report</p>
                </div>
              </div>
              <button className="btn-close-modal" onClick={() => setSelectedLogModal(null)}>
                <i className="fa-solid fa-xmark"></i>
              </button>
            </div>

            <div className="modal-body-styled">
              <div className="modal-stat-grid">
                <div className="info-box-stat">
                  <div className="stat-lbl"><i className="fa-solid fa-network-wired"></i> IP Kẻ tấn công</div>
                  <div className="stat-val mono-code red-txt">{selectedLogModal.bad_ip || selectedLogModal.client_ip}</div>
                </div>
                <div className="info-box-stat">
                  <div className="stat-lbl"><i className="fa-solid fa-shield-virus"></i> Loại mã độc</div>
                  <div className="stat-val">{selectedLogModal.attack_type}</div>
                </div>
                <div className="info-box-stat">
                  <div className="stat-lbl"><i className="fa-solid fa-clock"></i> Thời gian phát hiện</div>
                  <div className="stat-val">{selectedLogModal.access_time}</div>
                </div>
                <div className="info-box-stat">
                  <div className="stat-lbl"><i className="fa-solid fa-globe"></i> Domain đích</div>
                  <div className="stat-val mono-code">{selectedLogModal.domain_name || '10.87.ksm123.tk'}</div>
                </div>
              </div>

              <div className="code-block-section">
                <div className="code-block-head">
                  <span><i className="fa-solid fa-link"></i> URI & Payload tấn công</span>
                  <button className="btn-copy-curl" onClick={() => copyCurlRepro(selectedLogModal)}>
                    <i className="fa-solid fa-copy"></i> {copiedCurl ? 'Đã copy cURL!' : 'Copy cURL Replay'}
                  </button>
                </div>
                <pre className="forensic-code-view">
                  {safeDecodeURI(selectedLogModal.uri)}
                </pre>
              </div>

              <div className="modal-footer-actions">
                <button
                  className="btn-danger-action"
                  onClick={() => {
                    if (onAddBlacklist) onAddBlacklist(selectedLogModal.bad_ip, `Blocked from Event #${selectedLogModal.id}`);
                    setSelectedLogModal(null);
                  }}
                >
                  <i className="fa-solid fa-ban"></i> Chặn IP vào Blacklist
                </button>
                <button className="btn-outline-sm" onClick={() => setSelectedLogModal(null)}>Đóng</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
