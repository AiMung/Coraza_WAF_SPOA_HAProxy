import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            margin: '24px auto',
            maxWidth: '680px',
            background: '#ffffff',
            border: '1px solid #fecaca',
            borderRadius: '12px',
            padding: '24px',
            boxShadow: '0 4px 12px rgba(220, 38, 38, 0.08)',
            textAlign: 'center',
            fontFamily: 'Inter, sans-serif',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: '#fee2e2',
              color: '#dc2626',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
              fontSize: '22px',
            }}
          >
            <i className="fa-solid fa-triangle-exclamation"></i>
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: '18px', fontWeight: 800, color: '#0f172a' }}>
            Đã xảy ra lỗi khi hiển thị phân hệ này
          </h3>
          <p style={{ margin: '0 0 16px', fontSize: '13px', color: '#64748b' }}>
            Hệ thống đã cách ly lỗi để bảo vệ phiên làm việc của bạn.
          </p>
          <pre
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: '6px',
              padding: '12px',
              textAlign: 'left',
              fontSize: '12px',
              color: '#dc2626',
              fontFamily: 'monospace',
              overflowX: 'auto',
              maxHeight: '140px',
              marginBottom: '20px',
            }}
          >
            {this.state.error?.toString()}
          </pre>
          <button
            type="button"
            onClick={this.handleReset}
            style={{
              padding: '8px 20px',
              borderRadius: '8px',
              border: 'none',
              background: '#10b981',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <i className="fa-solid fa-rotate"></i> Tải lại phân hệ
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
