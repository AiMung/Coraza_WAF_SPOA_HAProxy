import React from 'react';
import { wafApi } from '../api/client';

export default function Header({ title, stats, wsConnected, onRefresh }) {
  const count = stats?.total_attacks ?? 0;

  const handleFix = async () => {
    try {
      const data = await wafApi.systemFix();
      alert(data.message || 'Engine healthy.');
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const handleReboot = async () => {
    try {
      const data = await wafApi.systemReboot();
      alert(data.message || 'Cluster refreshed.');
      if (onRefresh) onRefresh();
    } catch (e) {
      alert(String(e.message || e));
    }
  };

  const toggleFullScreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  return (
    <header className="aawaf-header-bar">
      <div className="header-title-left">
        <span className="hdr-title-txt">{title || 'Overview'}</span>
        <span className="hdr-count-badge">{count}</span>
        <span className={`hdr-ws-pill ${wsConnected ? 'on' : 'off'}`}>
          <span className="hdr-ws-dot"></span>
          {wsConnected ? 'WebSocket live' : 'WS reconnecting'}
        </span>
        <i className="fa-solid fa-expand hdr-icon-btn" title="Toggle Fullscreen" onClick={toggleFullScreen}></i>
      </div>
      <div className="header-actions-right">
        <button className="btn-link-action" onClick={handleFix}>Fix</button>
        <button className="btn-link-action" onClick={handleReboot}>Reboot</button>
      </div>
    </header>
  );
}
