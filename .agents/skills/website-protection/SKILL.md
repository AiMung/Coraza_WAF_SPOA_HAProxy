---
name: website-protection
description: Quy chuẩn kiến trúc Reverse Proxy Gateway, điều phối VHost HAProxy và bảo vệ website đa mục tiêu (Multi-Site WAF Protection) qua Coraza SPOA.
---

# Kỹ Năng Quản Lý & Bảo Vệ Website Đa Mục Tiêu (Website Protection & Reverse Proxy Gateway)

Skill này cung cấp các nguyên tắc kiến trúc, quy chuẩn mã nguồn và quy trình vận hành phân hệ **Bảo Vệ Website (Protected Sites / Virtual Hosts)** cho hệ thống **HAProxy Reverse Proxy + Coraza SPOA WAF**.

---

## 1. Bản chất Kiến trúc Reverse Proxy Gateway (Mọi request đi qua HAProxy)

### 1.1. Nguyên lý hoạt động
Khi thêm một website vào hệ thống:
1. **Toàn bộ request từ người dùng/mạng ngoài** sẽ trỏ DNS hoặc kết nối đến địa chỉ IP của HAProxy (Port 80/443).
2. **HAProxy** đóng vai trò là Reverse Proxy Gateway tập trung:
   - Nhận diện Website đích dựa trên Header `Host: <domain>` hoặc URL path.
   - Chạy bộ lọc IP Access Control (Whitelist/Blacklist).
   - Gửi payload sang **Coraza SPOA Engine** để phát hiện mã độc (SQLi, XSS, RCE, Bot, v.v.).
3. **Nếu an toàn**: HAProxy chuyển tiếp (proxy_pass) request vào máy chủ web nội bộ thật (**Upstream Origin Server**, ví dụ: `http://192.168.1.50:8080` hoặc container `protected-app:80`).
4. **Máy chủ Web thật (Origin)** được giấu kín hoàn toàn trong mạng LAN / DMZ, không bao giờ lộ trực tiếp IP ra ngoài Internet.

```
[Client / Attacker]
       │ (Request: Host: erp.company.com)
       ▼
┌────────────────────────────────────────────────────────────┐
│ HAProxy Reverse Proxy Gateway (Port 80/443)                │
│ • Nhận diện VHost: Host == erp.company.com                 │
│ • Kiểm tra Fast-Path IP Access Control                     │
│ • Gửi sang Coraza SPOA WAF để kiểm tra L7 Deep Inspection  │
└────────────────────────────────────────────────────────────┘
       │                                     │
  [An Toàn]                                [Có Mã Độc]
       │                                     ▼
       ▼                              [Trả HTTP 403 Forbidden]
┌──────────────────────────────────────┐
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
    name TEXT NOT NULL,                     -- Tên gợi nhớ (e.g., "ERP Nội Bộ", "Web Bán Hàng")
    domain TEXT UNIQUE NOT NULL,            -- Hostname/Domain (e.g., "erp.company.com", "192.168.246.100")
    upstream_target TEXT NOT NULL,          -- Địa chỉ backend trong mạng (e.g., "protected-app:80", "192.168.1.50:8080")
    port INTEGER DEFAULT 80,               -- Cổng lắng nghe ngoài (80 / 443)
    ssl_enabled INTEGER DEFAULT 0,          -- 0: HTTP, 1: HTTPS
    waf_mode TEXT DEFAULT 'prevention',     -- 'prevention' (Chặn 403), 'detection' (Chỉ ghi log), 'bypass' (Tắt WAF)
    status TEXT DEFAULT 'active',           -- 'active', 'disabled'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 3. Quy chuẩn Điều phối Định tuyến HAProxy (VHost Routing Mechanism)

Hỗ trợ điều phối động dựa trên HAProxy Map hoặc `use_backend` rules:
```haproxy
frontend default
    bind *:80
    
    # 1. Trích xuất Host header
    acl is_site_demo hdr(host) -i 192.168.246.100 localhost
    acl is_site_custom hdr(host) -i custom-domain.local

    # 2. Điều phối theo từng backend tương ứng
    use_backend backend_demo if is_site_demo
    use_backend backend_custom if is_site_custom
    default_backend protected-app-backend
```

---

## 4. Quy chuẩn Giao diện SOC (UI/UX Standards)

1. **Thống kê tổng quan (Top Metric Strip)**:
   - Tổng website đang bảo vệ.
   - Số website đang chạy ổn định (Health UP).
   - Số website bật chế độ WAF Active Prevention.
   - Tổng lượt request & lượt chặn 403 của các site.
2. **Bảng Danh Sách Trực Quan (Icon-First Table)**:
   - **Tên & Tên miền**: Icon toàn cầu `fa-globe`, kèm link ngoài `fa-arrow-up-right-from-square`.
   - **Upstream Target**: Icon server `fa-server`, hiển thị IP/Container đích và cổng LAN.
   - **Chế độ WAF (WAF Mode)**:
     - 🛡️ `Active Prevention` (Màu xanh ngọc - Chặn đứng tấn công).
     - 👁️ `Detection Only` (Màu vàng cam - Chỉ cảnh báo).
     - ⚪ `Bypass` (Màu xám - Tạm thời không lọc).
   - **Trạng thái Sống/Chết (Health Ping)**: Chấm xanh phát sáng `🟢 UP` hoặc `🔴 DOWN`.
   - **SSL/TLS**: Icon khóa xanh `fa-lock` (HTTPS) hoặc khóa mở `fa-lock-open` (HTTP).
   - **Hành động**: Nút Bật/Tắt WAF nhanh, Nút Chỉnh sửa, Nút Xóa, Nút Mở trang web.
3. **Modal Thêm / Chỉnh Sửa Website**:
   - Tên website, Tên miền (Domain / Host), Upstream Target (Địa chỉ IP:Cổng nội bộ), Chế độ WAF.
   - Kiểm tra trùng lặp domain và định dạng upstream hợp lệ.
