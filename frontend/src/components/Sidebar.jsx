import React from 'react';

export default function Sidebar({ activeTab, setActiveTab, totalBlocked = 0 }) {
  const navItems = [
    { id: 'overview', icon: 'fa-solid fa-house', label: 'Overview' },
    { id: 'website', icon: 'fa-solid fa-globe', label: 'Website' },
    { id: 'logs', icon: 'fa-solid fa-file-shield', label: 'Interception log', badge: totalBlocked },
    { id: 'ip-control', icon: 'fa-solid fa-user-shield', label: 'Black/white list' },
    { id: 'rules', icon: 'fa-solid fa-pen-ruler', label: 'Custom rules' },
    { id: 'bot', icon: 'fa-solid fa-robot', label: 'Recaptcha' },
    { id: 'telegram', icon: 'fa-brands fa-telegram', label: 'Telegram' },
    { id: 'settings', icon: 'fa-solid fa-gear', label: 'Settings' },
  ];

  return (
    <aside className="aawaf-sidebar">
      <div className="sidebar-brand">
        <div className="brand-icon-wrapper">
          <i className="fa-solid fa-shield-halved"></i>
        </div>
        <div>
          <span className="brand-text">aaWAF</span>
          <div className="brand-sub">Go · React · Coraza</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-link ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <i className={item.icon}></i>
            <span>{item.label}</span>
            {item.badge > 0 && item.id === 'logs' ? (
              <span className="nav-badge-pill">{item.badge > 99 ? '99+' : item.badge}</span>
            ) : null}
          </button>
        ))}

        <button className="nav-link logout-link" onClick={() => window.location.reload()}>
          <i className="fa-solid fa-arrow-right-from-bracket"></i>
          <span>Log out</span>
        </button>
      </nav>
    </aside>
  );
}
