import React from 'react';

const RANGES = [
  {
    id: 'today',
    label: 'Hôm nay',
    hint: 'Realtime SOC',
    icon: 'fa-bolt',
    accent: 'emerald',
  },
  {
    id: 'yesterday',
    label: 'Hôm qua',
    hint: 'So sánh 24h',
    icon: 'fa-clock-rotate-left',
    accent: 'sky',
  },
  {
    id: '7days',
    label: '7 ngày',
    hint: 'Xu hướng tuần',
    icon: 'fa-calendar-week',
    accent: 'violet',
  },
  {
    id: '30days',
    label: '30 ngày',
    hint: 'Toàn cảnh tháng',
    icon: 'fa-chart-area',
    accent: 'amber',
  },
];

function fmt(n) {
  return (n || 0).toLocaleString('en-US');
}

export default function RangeOverview({
  timeFilter,
  onChange,
  stats,
}) {
  const requests = stats.requests_today ?? stats.total_requests ?? 0;
  const blocked = stats.malicious_requests_today ?? stats.total_attacks ?? 0;
  const ratio = ((blocked / Math.max(requests, 1)) * 100).toFixed(2);
  const uniqueIps = (stats.access_map_rank || []).length;
  const blockedIps = stats.blocked_ips ?? 0;

  const kpis = [
    { label: 'Requests (range)', value: fmt(requests), tone: 'green' },
    { label: 'Đã chặn', value: fmt(blocked), tone: 'red' },
    { label: 'Tỷ lệ intercept', value: `${ratio}%`, tone: 'blue' },
    { label: 'IP blacklist', value: fmt(blockedIps || uniqueIps), tone: 'slate' },
  ];

  return (
    <section className="range-overview">
      <div className="range-overview-head">
        <div>
          <p className="range-kicker">Range Overview</p>
          <h2 className="range-title">Telemetry theo khoảng thời gian</h2>
          <p className="range-sub">
            Số liệu Coraza + SQLite được cắt theo mốc bạn chọn — bản đồ, xu hướng và Interception log
            đồng bộ cùng một range.
          </p>
        </div>
        <div className="range-live-chip">
          <span className="pulsing-radar-dot"></span>
          Live feed · OWASP CRS v4.9
        </div>
      </div>

      <div className="range-period-grid">
        {RANGES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`range-period-card accent-${item.accent} ${timeFilter === item.id ? 'active' : ''}`}
            onClick={() => onChange(item.id)}
          >
            <span className="range-period-icon">
              <i className={`fa-solid ${item.icon}`}></i>
            </span>
            <span className="range-period-meta">
              <strong>{item.label}</strong>
              <em>{item.hint}</em>
            </span>
            {timeFilter === item.id && <span className="range-period-check"><i className="fa-solid fa-check"></i></span>}
          </button>
        ))}
      </div>

      <div className="range-kpi-strip">
        {kpis.map((kpi) => (
          <div key={kpi.label} className={`range-kpi tone-${kpi.tone}`}>
            <span>{kpi.label}</span>
            <strong>{kpi.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
