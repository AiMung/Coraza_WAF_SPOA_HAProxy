---
name: website-protection
description: Quy chuẩn kiến trúc Reverse Proxy Gateway, điều phối VHost HAProxy, bảo vệ website đa mục tiêu (Multi-Site WAF Protection) qua Coraza SPOA với cơ chế 3 trạng thái (Prevention, Detection, Bypass) và công cụ xác thực WAF trực tiếp.
---

# Kỹ Năng Quản Lý & Bảo Vệ Website Đa Mục Tiêu (Website Protection & Reverse Proxy Gateway)

Skill này cung cấp các nguyên tắc kiến trúc, quy chuẩn mã nguồn, cấu hình HAProxy động và quy trình vận hành phân hệ **Bảo Vệ Website (Protected Sites / Virtual Hosts)** cho hệ thống **HAProxy Reverse Proxy Gateway + Coraza SPOA WAF**.

---

## 1. Bản chất Kiến trúc Reverse Proxy Gateway (Mọi request đi qua HAProxy)

### 1.1. Nguyên lý hoạt động
Khi thêm một website vào hệ thống WAF:
1. **Toàn bộ request từ người dùng/mạng ngoài (Client / Attacker)** trỏ DNS (bản ghi A hoặc CNAME) về địa chỉ IP của máy chủ HAProxy (Port 80/443).
2. **HAProxy** đóng vai trò là Reverse Proxy Gateway tập trung:
   - Nhận diện Website đích dựa trên Header `Host: <domain>` (ví dụ: `Host: crm.company.vn`).
   - Chạy bộ lọc Fast-Path IP Access Control (Whitelist/Blacklist).
   - Kiểm tra chế độ bảo vệ WAF của Domain:
     - **⚪ Bypass Mode:** Bỏ qua kiểm tra Coraza SPOE, chuyển tiếp thẳng vào origin.
     - **👁️ Detection Mode (Giám sát):** Gửi payload sang Coraza SPOA WAF để phát hiện mã độc và ghi log cảnh báo, nhưng KHÔNG chặn 403 (chuyển tiếp tới origin kèm header `X-WAF-Mode: Detection-Only`).
     - **🛡️ Prevention Mode (Chặn đứng):** Gửi payload sang Coraza SPOA WAF. Nếu phát hiện vi phạm luật CRS, chặn ngay lập tức với mã HTTP 403 Forbidden (`X-Blocked-By: Coraza-WAF-Shield`).
3. **Upstream Origin Server:** Máy chủ web thật (ví dụ: `http://192.168.1.50:8080` hoặc container `protected-app:80`) được đặt an toàn trong mạng nội bộ LAN / Docker Network, không bao giờ mở cổng trực tiếp ra Internet.

```
[Người dùng / Kẻ tấn công]
       │ (Request: Host: erp.company.com)
       ▼
┌────────────────────────────────────────────────────────────┐
│ HAProxy Reverse Proxy Gateway (Port 80/443)                │
│ • Nhận diện VHost: Host == erp.company.com                 │
│ • Kiểm tra Fast-Path IP Access Control (Blacklist/White)   │
│ • Phân luồng theo WAF Mode (Prevention / Detect / Bypass)  │
│ • Deep Packet Inspection qua Coraza SPOE (Port 9000)       │
└────────────────────────────────────────────────────────────┘
       │                                     │
   [An Toàn / Detection]                   [Tấn công & Prevention]
       │                                     ▼
       ▼                              [Trả HTTP 403 Forbidden]
┌──────────────────────────────────────┐  Header: X-Blocked-By: Coraza-WAF-Shield
│ Máy chủ Web gốc (Origin Server LAN)  │
│ 192.168.1.50:8080 / protected-app:80 │
└──────────────────────────────────────┘
```

---

## 2. Mô hình Dữ liệu (Database Schema)

Bảng SQLite `protected_sites`:
```sql
CREATE TABLE IF NOT EXISTS protected_sites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,                     -- Tên gợi nhớ (e.g., "Web Bán Hàng E-Commerce", "Cổng Dịch Vụ Khách Hàng")
    domain TEXT UNIQUE NOT NULL,            -- Hostname/Domain (e.g., "shop.mycompany.vn", "192.168.246.100")
    upstream_target TEXT NOT NULL,          -- Địa chỉ backend trong mạng LAN (e.g., "192.168.1.80:3000", "protected-app:80")
    port INTEGER DEFAULT 80,               -- Cổng lắng nghe ngoài của Gateway (80 / 443)
    ssl_enabled INTEGER DEFAULT 0,          -- 0: HTTP, 1: HTTPS (TLS Termination tại HAProxy)
    waf_mode TEXT DEFAULT 'prevention',     -- 'prevention' (Chặn 403), 'detection' (Chỉ ghi log), 'bypass' (Tắt WAF)
    status TEXT DEFAULT 'active',           -- 'active', 'disabled'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Quy chuẩn Điều Phối HAProxy & Cấu Hình Động (Dynamic VHost Template)

File cấu hình `/usr/local/etc/haproxy/haproxy.cfg` được tự động sinh (auto-sync) từ SQLite và áp dụng ngay lập tức qua tín hiệu SIGHUP mà không gián đoạn kết nối người dùng (`zero-downtime graceful reload`):

### 3.1. Cú pháp Phân Luồng Tri-State WAF trong HAProxy
```haproxy
frontend default
    bind *:80
    log-format "%ci:%cp [%t] %ft %b/%s %ST %B %{+Q}r %[var(txn.coraza.id)] spoa-error:%[var(txn.coraza.error)] waf-action:%[var(txn.coraza.action)]"

    # 1. IP Access Control Fast-Path
    acl is_whitelisted src -f /usr/local/etc/haproxy/rules/whitelist.ips
    acl is_blacklisted src -f /usr/local/etc/haproxy/rules/blacklist.ips
    http-request deny deny_status 403 hdr "X-Blocked-By" "HAProxy-IP-Blacklist" if is_blacklisted !is_whitelisted

    # 2. Coraza SPOE Engine Setup
    http-request set-var(txn.coraza.app) str(sample_app)
    filter spoe engine coraza config /usr/local/etc/haproxy/spoe-coraza.conf

    # 3. WAF Bypass ACL (lặp lại acl để tạo điều kiện OR)
    acl is_waf_bypass_mode hdr(host) -i trusted.domain.com
    http-request send-spoe-group coraza coraza-req if !is_whitelisted !is_waf_bypass_mode

    # 4. WAF Detection Mode ACL
    acl is_waf_detection_mode hdr(host) -i dev.domain.com

    # 5. Phân xử hành động WAF (Action Handlers)
    # Trong Detection mode: Bơm header cho upstream nhưng KHÔNG chặn 403
    http-request set-header X-WAF-Mode "Detection-Only" if is_waf_detection_mode
    http-request set-header X-WAF-Threat-Detected "True" if is_waf_detection_mode { var(txn.coraza.action) -m str deny }
    
    # Trong Prevention mode: Chặn đứng bằng HTTP 403
    http-request deny deny_status 403 hdr "X-Blocked-By" "Coraza-WAF-Shield" if { var(txn.coraza.action) -m str deny } !is_waf_detection_mode
    http-response deny deny_status 403 hdr "X-Blocked-By" "Coraza-WAF-Shield" if { var(txn.coraza.action) -m str deny } !is_waf_detection_mode

    # 6. Điều hướng Virtual Host (Dynamic Upstream Routing)
    acl host_site_1 hdr(host) -i shop.mycompany.vn
    use_backend backend_site_1 if host_site_1

backend backend_site_1
    mode http
    server origin_1 192.168.1.80:3000 check fall 3 rise 2
```

---

## 4. API Endpoints Phân Hệ Website Protection

| Phương thức | Đường dẫn | Chức năng | Mô tả chi tiết |
|---|---|---|---|
| `GET` | `/api/sites` | Lấy danh sách website | Kèm health status ping, độ trễ và số liệu đe dọa |
| `POST` | `/api/sites` | Thêm website mới | Validate domain trùng lặp, sync HAProxy cfg |
| `PUT` | `/api/sites/:id` | Sửa thông tin website | Cập nhật domain/upstream/waf_mode, reload HAProxy |
| `DELETE` | `/api/sites/:id` | Xóa website | Xóa khỏi DB và gỡ khỏi cấu hình HAProxy |
| `POST` | `/api/sites/:id/toggle` | Đổi WAF Mode | Nhận `{"waf_mode":"prevention"|"detection"|"bypass"}` hoặc luân phiên |
| `POST` | `/api/sites/:id/ping` | Kiểm tra Upstream | Ping kiểm tra tính khả dụng của máy chủ đích LAN |
| `POST` | `/api/sites/:id/test-waf` | Kiểm tra WAF Trực Tiếp | Bắn request chứa XSS probe với `Host: <site.domain>` vào HAProxy, đo mã trạng thái và trả kết quả chẩn đoán |

---

## 5. Quy Chuẩn Giao Diện Doanh Nghiệp (Enterprise SOC UX)

1. **Thanh Thống Kê KPI (4 Metric Strip Cards):**
   - **Tổng Website Bảo Vệ:** Tổng số site đang khai báo trên hệ thống.
   - **Máy Chủ Đích Trực Tuyến:** Tỷ lệ máy chủ origin ping thành công.
   - **Chế Độ Chặn (Prevention):** Số website đang ở trạng thái bảo vệ nghiêm ngặt (chặn đứng 403).
   - **Chế Độ Giám Sát (Detection):** Số website đang ở trạng thái log-only kiểm thử luật.
2. **Bộ Chuyển Đổi Trạng Thái 3 Cấp (Tri-State Segmented Switcher):**
   - Đặt trực tiếp trên từng hàng của bảng dữ liệu:
     - 🛡️ **Chặn** (Emerald Cyan - Prevention)
     - 👁️ **Giám Sát** (Amber Orange - Detection)
     - ⚪ **Tắt** (Muted Slate - Bypass)
   - Nhấn trực tiếp để chuyển chế độ ngay lập tức không cần mở modal phức tạp.
3. **Nút "Test WAF" & Modal Chẩn Đoán Trực Tiếp:**
   - Mỗi website có nút `Kiểm tra WAF`.
   - Khi bấm, hệ thống tự động bắn một request kiểm thử XSS chuẩn OWASP CRS qua Gateway và hiển thị kết quả kiểm chứng:
     - Mã phản hồi HTTP (403 vs 200).
     - Header nhận diện (`X-Blocked-By: Coraza-WAF-Shield`).
     - Độ trễ phản hồi (ms).
     - Kết luận bảo mật trực quan.
4. **Hướng Dẫn Cấu Hình DNS Rõ Ràng (Reverse Proxy Onboarding Banner):**
   - Hiển thị tài liệu tóm tắt cơ chế trỏ bản ghi DNS A/CNAME về IP Gateway.
   - Giải thích rõ cơ chế giấu kín IP máy chủ gốc (Origin Concealment) để quản trị viên dễ dàng áp dụng cho website thật ngoài đời.
