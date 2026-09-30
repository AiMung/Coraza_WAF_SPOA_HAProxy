---
name: ip-access-control
description: Quy chuẩn kiến trúc, đồng bộ cấu hình và vận hành phân hệ IP Access Control (Blacklist, Whitelist, Countdown TTL & Auto-Enforcement) trên Coraza WAF và HAProxy.
---

# Kỹ năng Quản lý Danh sách IP Truy cập (IP Access Control Engine)

Skill này đặc tả toàn bộ kiến trúc kỹ thuật, quy trình đồng bộ hóa thực tế (không dùng mock data) và cơ chế đếm ngược thời hạn cấm (Countdown TTL) cho hệ thống **Coraza SPOA + HAProxy Reverse Proxy**.

---

## 1. Kiến trúc Phòng thủ 2 Tầng (Two-Tier Enforcement Architecture)

Để đảm bảo hiệu năng tối đa và bảo vệ hệ thống trước các cuộc tấn công DoS / Brute Force / Web Scanners, phân hệ IP Access Control phải hoạt động theo 2 tầng:

```
[Client Request]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 1: HAProxy Fast-Path (L4/L7 Reverse Proxy Gate)   │
│ • Kiểm tra: /usr/local/etc/haproxy/rules/blacklist.ips │
│ • Kiểm tra: /usr/local/etc/haproxy/rules/whitelist.ips │
│ ────────────────────────────────────────────────────── │
│ ➔ IF IP in Whitelist: Cho phép đi thẳng vào Web App,   │
│                       BỎ QUA TOÀN BỘ kiểm tra WAF.     │
│ ➔ IF IP in Blacklist: TỪ CHỐI NGAY LẬP TỨC (HTTP 403), │
│                       KHÔNG tốn tài nguyên gọi SPOE.   │
└────────────────────────────────────────────────────────┘
       │ (Chỉ gửi traffic của IP bình thường)
       ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 2: Coraza SPOA WAF Engine (Deep Inspection L7)   │
│ • Luật: /etc/coraza-spoa/rules/ip_rules.conf          │
│ • SecRule REMOTE_ADDR "@ipMatchFromFile ..."          │
│ • Ghi nhận đầy đủ Transaction ID, GeoIP và Audit Log  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Mô hình Dữ liệu & Cơ chế Đếm ngược (TTL Countdown Engine)

### 2.1. Cấu trúc bảng SQLite `ip_rules`:
```sql
CREATE TABLE IF NOT EXISTS ip_rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ip TEXT UNIQUE NOT NULL,
    rule_type TEXT NOT NULL,           -- 'blacklist' hoặc 'whitelist'
    reason TEXT,                       -- Lý do vi phạm hoặc nguồn gốc
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME                -- NULL = Vĩnh viễn (Permanent); Có giá trị = Hết hạn cấm
);
```

### 2.2. Quy tắc thời hạn (Duration Presets):
- `15m` (15 phút): Khuyên dùng cho trường hợp nghi vấn để tránh chặn nhầm (False Positive).
- `30m` (30 phút), `1h` (1 giờ), `6h` (6 giờ), `24h` / `1d` (1 ngày), `7d` (7 ngày).
- `permanent` / `perm` (NULL): Chặn vĩnh viễn đối với các botnet, scanner cố tình phá hoại.

### 2.3. Daemon Tự động Gỡ cấm (Auto-Expiration Daemon):
- Chạy nền trong Go Backend (`services.StartIPRulesExpirationDaemon()`).
- Tần suất quét: Mỗi **5 giây**.
- Logic:
  1. Quét các IP có `rule_type = 'blacklist'` và `expires_at <= CURRENT_TIMESTAMP`.
  2. Xóa khỏi cơ sở dữ liệu `ip_rules`.
  3. Tự động gọi `services.SyncIPRulesToFile()` để làm sạch file `blacklist.ips` của HAProxy & Coraza.
  4. Bắn thông báo mở cấm tự động vào Telegram Group.

---

## 3. Quy chuẩn Giao diện Người dùng (UI/UX Standards)

Trang `BlackWhiteList.jsx` phải tuân thủ nghiêm ngặt các quy chuẩn sau:

1. **Phân tách 2 Tab rõ ràng**:
   - **Tab 1: ⛔ Blacklist (Danh Sách Cấm)**: Hiển thị toàn bộ IP bị chặn, có kèm bộ đếm ngược thời gian (Live Countdown).
   - **Tab 2: ⚪ Whitelist (Danh Sách Tin Cậy)**: Hiển thị các IP được miễn trừ kiểm tra WAF.
2. **Thanh tìm kiếm thời gian thực (Live Search Bar)**:
   - Cho phép tìm nhanh theo: Địa chỉ IP, dải Subnet CIDR, hoặc từ khóa trong cột Lý do / Nguồn gốc.
3. **Đồng hồ đếm ngược trực quan (Live Countdown)**:
   - Dùng `setInterval` 1 giây để cập nhật thời gian còn lại: `⏳ Còn 14m 32s`.
   - Nếu là cấm vĩnh viễn: Hiển thị icon khóa vàng `🔒 Vĩnh viễn (Permanent)`.
   - Nếu vừa hết hạn: Hiển thị `Hết hạn (Đang tự động gỡ)`.
4. **Modal Thêm Quy Tắc Chuẩn SOC**:
   - Hỗ trợ chọn thời hạn trực tiếp qua dropdown.
   - Kiểm tra định dạng IP / CIDR hợp lệ trước khi gửi lên API.
