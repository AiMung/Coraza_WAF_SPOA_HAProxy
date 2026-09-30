import React, { useState } from 'react';

export default function RecaptchaBot() {
  const [ccEnabled, setCcEnabled] = useState(true);
  const [scannerBlock, setScannerBlock] = useState(true);

  return (
    <div className="tab-panel active">
      <div className="panel-card max-w-750">
        <div className="panel-head">
          <h4><i className="fa-solid fa-robot"></i> CC Defense & Bot Verification (Recaptcha)</h4>
        </div>
        <div className="settings-form-row">
          <div className="settings-label">CC Attack Defense:</div>
          <div className="settings-input">
            <label className="switch-green">
              <input
                type="checkbox"
                checked={ccEnabled}
                onChange={(e) => setCcEnabled(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>
          <div className="settings-desc">
            Automatically challenge/block when single IP exceeds 100 req/sec
          </div>
        </div>

        <div className="settings-form-row">
          <div className="settings-label">Block Scanners (sqlmap/nikto):</div>
          <div className="settings-input">
            <label className="switch-green">
              <input
                type="checkbox"
                checked={scannerBlock}
                onChange={(e) => setScannerBlock(e.target.checked)}
              />
              <span className="slider round"></span>
            </label>
          </div>
          <div className="settings-desc">
            Instant 403 Forbidden for automated security probes & malicious bots
          </div>
        </div>
      </div>
    </div>
  );
}
