---
name: ip-access-control
description: Quy chuẩn kiến trúc phòng thủ 2 tầng, đồng bộ cấu hình, đếm ngược TTL, Live IP Inspector và kịch bản demo phân hệ IP Access Control (Blacklist / Whitelist) trên Coraza WAF và HAProxy.
---

# Kỹ Năng Quản Lý Danh Sách IP Truy Cập (IP Access Control Engine)

Skill này cung cấp các nguyên tắc kiến trúc, quy chuẩn mã nguồn, cơ chế đồng bộ hóa thời gian thực (Zero-Downtime Reload) và quy trình vận hành phân hệ **Kiểm Soát Truy Cập IP (Blacklist & Whitelist)** cho hệ thống **HAProxy Reverse Proxy + Coraza SPOA WAF**.

---

## 1. Kiến Trúc Phòng Thủ 2 Tầng (Two-Tier Enforcement Architecture)

Để đảm bảo hiệu năng tối đa và bảo vệ hệ thống trước các cuộc tấn công DoS, Brute-Force và Web Scanners, phân hệ IP Access Control hoạt động theo 2 tầng độc lập:

```
[Client Request]
       │
       ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 1: HAProxy Fast-Path (L4/L7 Reverse Proxy Gate)   │
│ • File Whitelist: /usr/local/etc/haproxy/rules/whitelist.ips │
│ • File Blacklist: /usr/local/etc/haproxy/rules/blacklist.ips │
│ ────────────────────────────────────────────────────── │
│ ➔ IF IP in Whitelist: Cho phép đi thẳng vào Web App,   │
│                       BỎ QUA TOÀN BỘ kiểm tra WAF.     │
│ ➔ IF IP in Blacklist: TỪ CHỐI NGAY LẬP TỨC (HTTP 403), │
│                       Header: X-Blocked-By: HAProxy-IP-Blacklist │
│                       KHÔNG tốn tài nguyên gọi SPOE.   │
└────────────────────────────────────────────────────────┘
       │ (Chỉ gửi traffic của IP bình thường)
       ▼
┌────────────────────────────────────────────────────────┐
│ TẦNG 2: Coraza SPOA WAF Engine (Deep Inspection L7)   │
│ • Luật dự phòng: /etc/coraza-spoa/rules/ip_rules.conf  │
│ • Phân tích URI, Body, Header theo OWASP CRS v4.9      │
│ • Ghi nhận đầy đủ Transaction ID, GeoIP và Audit Log  │
└────────────────────────────────────────────────────────┘
```

---

## 2. Quy Chuẩn Đồng Bộ & Nạp Cấu Hình (Dynamic Reloading)

Khi người dùng Thêm, Xóa hoặc Gia hạn quy tắc IP trên Dashboard:
1. Go Backend cập nhật bảng SQLite `ip_rules`.
2. Hàm `services.SyncIPRulesToFile()` ghi nội dung cập nhật ra các file:
   - `/usr/local/etc/haproxy/rules/blacklist.ips`
   - `/usr/local/etc/haproxy/rules/whitelist.ips`
   - `/etc/coraza-spoa/rules/ip_rules.conf`
3. Backend tự động gửi tín hiệu `SIGHUP` tới container HAProxy (`docker kill --signal=HUP haproxy`).
4. HAProxy thực hiện **Graceful Reload** trong mili-giây:
   - Công nhân mới (Worker mới) nạp ngay bảng IP mới vào RAM.
   - Các kết nối người dùng hiện tại không bị gián đoạn.

---

## 3. Cơ Chế Đếm Ngược & Tự Động Gỡ Cấm (TTL Countdown & Auto-Unban)

- **Các mốc thời hạn được hỗ trợ:** `15m` (khuyên dùng để tránh False Positive), `30m`, `1h`, `6h`, `24h` / `1d`, `7d`, và `permanent` (cấm vĩnh viễn - `expires_at = NULL`).
- **Daemon tự động gỡ cấm (`StartIPRulesExpirationDaemon`):**
  - Chạy nền trong Go Backend với chu kỳ quét mỗi **5 giây**.
  - Tự động xóa các bản ghi có `expires_at <= CURRENT_TIMESTAMP`.
  - Tự động đồng bộ lại file rules và reload HAProxy để phục hồi quyền truy cập tức thì cho người dùng.

---

## 4. Công Cụ Chẩn Đoán Quyền Truy Cập IP (Live IP Access Inspector)

Trên trang giao diện `BlackWhiteList.jsx`:
- Tích hợp thanh chẩn đoán IP thời gian thực:
  - Nhập bất kỳ IP nào -> Bấm **"Kiểm Tra Quyền"**.
  - Hiển thị tức thì kết luận:
    - 🟢 `ĐƯỢC PHÉP TRUY CẬP (WHITELIST BYPASS)`
    - 🔴 `BỊ CHẶN ĐỨNG (FAST-PATH 403 FORBIDDEN)` kèm đồng hồ đếm ngược thời gian cấm còn lại.
    - 🔵 `LƯU LƯỢNG TIÊU CHUẨN (CORAZA DEEP INSPECTION)`
  - Cung cấp nút thao tác nhanh: Chặn 15 phút, Thêm vào Whitelist, hoặc Gỡ cấm ngay lập tức.

---

## 5. Kịch Bản Demo Chuẩn (Quick Demonstration Script)

1. **Test tấn công chưa Whitelist:**
   ```bash
   curl -i "http://127.0.0.1:80/?search=<script>alert('WAF_XSS')</script>"
   # Kết quả: 403 Forbidden (X-Blocked-By: Coraza-WAF-Shield)
   ```
2. **Thêm IP vào Whitelist qua Dashboard:**
   - Chạy lại lệnh trên:
   ```bash
   curl -i "http://127.0.0.1:80/?search=<script>alert('WAF_XSS')</script>"
   # Kết quả: 200 OK (Bypass WAF thành công!)
   ```
3. **Thêm IP vào Blacklist qua Dashboard (15 phút):**
   - Gửi yêu cầu HTTP sạch thông thường:
   ```bash
   curl -i "http://127.0.0.1:80/?page=home"
   # Kết quả: 403 Forbidden (X-Blocked-By: HAProxy-IP-Blacklist)
   ```
4. **Quan sát đồng hồ đếm ngược và kiểm tra IP bằng Live Inspector.**
