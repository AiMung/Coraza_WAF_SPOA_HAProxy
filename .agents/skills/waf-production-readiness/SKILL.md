---
name: waf-production-readiness
description: Quy chuẩn kiến trúc, đánh giá mức độ hoàn thiện, đặc tả kỹ thuật (Scope & Spec) và tiêu chuẩn nghiệm thu không lỗi vặt (Zero-Petty-Bug Standard) cho hệ thống Coraza WAF SPOA HAProxy Enterprise Dashboard.
---

# WAF Production Readiness & Zero-Petty-Bug Standard

Bộ quy chuẩn kỹ thuật và phạm vi phát triển (Scope & Spec) nhằm kiểm soát chất lượng, nghiệm thu sản phẩm và đảm bảo hệ thống **Coraza WAF + SPOA + HAProxy Enterprise Dashboard** đạt chuẩn vận hành môi trường doanh nghiệp mà không phát sinh lỗi vặt.

---

## 1. Tổng Quan Kiến Trúc & Hiện Trạng Dự Án

Hệ thống được thiết kế theo mô hình **Phòng thủ đa tầng (Defense-in-Depth)** kết hợp Reverse Proxy Gateway, Web Application Firewall Engine và Trung tâm giám sát SOC thời gian thực:

```
[ Internet / Khách hàng / Kẻ tấn công ]
                   │
                   ▼ (Port 80 / 443 / 8443)
┌─────────────────────────────────────────────────────────────┐
│ HAProxy Enterprise Gateway (L4 / L7 Fast-Path)              │
│ - Stick-Table L4 IP Tracking & Rate Limiting                │
│ - Instant Blacklist Fast-Path Rejection (0ms, 403 Forbidden) │
│ - Virtual Host Routing (Multi-Site Target Allocation)       │
│ - SSL Termination & HTTPS / HSTS Strict Policy             │
└──────────────┬──────────────────────────────────────────────┘
               │ SPOE Protocol (TCP :9000)
               ▼
┌─────────────────────────────────────────────────────────────┐
│ Coraza SPOA WAF Engine (OWASP CRS v4.x In-Line Inspection)  │
│ - SQLi, XSS, RCE, LFI/RFI, Scanner Detection (403 block)    │
│ - Per-Site Mode: Prevention (Block) | Detection | Bypass    │
│ - JSON Audit Forensics Streaming to Syslog / Backend Socket │
└──────────────┬──────────────────────────────────────────────┘
               │
               ▼ Forwarding traffic
┌─────────────────────────────────────────────────────────────┐
│ Backend Origin Web Servers (Upstream Targets)               │
│ - protected-app:80, DVWA:80, Custom Business APIs           │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Tiêu Chuẩn "Không Lỗi Vặt" (Zero-Petty-Bug Criteria)

Trong các hệ thống giám sát an ninh doanh nghiệp, các lỗi giao diện hoặc mất dữ liệu khi F5/reload tạo cảm giác sản phẩm chưa hoàn thiện. Mọi module phải tuân thủ nghiêm ngặt 6 tiêu chuẩn sau:

### Tiêu Chuẩn 1: Lưu Trữ Bền Vững Trạng Thái (No Metric Loss on Reload)
- **Vấn đề:** HAProxy stats counters lưu trên RAM, khi khởi động lại hoặc F5 trang nếu chỉ đọc runtime counters thì số liệu `Lưu Lượng` (Valid Requests) bị nhảy về rỗng (`—`).
- **Quy chuẩn:**
  - Mọi chỉ số lưu lượng theo Virtual Host phải được cập nhật bền vững vào cơ sở dữ liệu SQLite (`protected_sites.valid_requests`, `protected_sites.total_requests`).
  - Giao diện `WebsiteList.jsx` phải đọc fallback từ DB: `Number(site.valid_requests || 0).toLocaleString()`. Không bao giờ hiển thị gạch ngang `—`.

### Tiêu Chuẩn 2: Đồng Bộ TTL Đếm Ngược & Tự Động Xóa Tức Thì (Instant Eviction)
- **Vấn đề:** Khi IP hết hạn cấm (đếm ngược về `0s`), nếu UI vẫn giữ hàng đó và chỉ hiện "Đang gỡ..." hoặc cần reload trang mới biến mất thì người dùng đánh giá hệ thống bị đơ.
- **Quy chuẩn:**
  - Logic hiển thị `useMemo` phải lọc bỏ tức thì các quy tắc có `expires_at <= Date.now()`.
  - Không sử dụng hiệu ứng quay vòng tròn (`fa-spin`) trên các icon đồng hồ cát (`fa-hourglass`) hoặc đồng hồ bấm giờ (`fa-stopwatch`). Chỉ dùng icon đồng hồ tĩnh (`fa-regular fa-clock`) với màu sắc cảnh báo theo thời lượng còn lại.
  - Client tự động gọi API `DELETE /api/ip-rules/:id` ngầm để dọn dẹp cơ sở dữ liệu và file đồng bộ HAProxy/Coraza.

### Tiêu Chuẩn 3: Quản Lý Chứng Chỉ SSL Tương Tác Trực Tiếp (Interactive SSL)
- **Vấn đề:** Cột SSL chỉ hiển thị icon ổ khóa xanh/xám tĩnh mà không có chức năng cấu hình.
- **Quy chuẩn:**
  - Mọi Virtual Host phải có modal cấu hình SSL chuyên nghiệp (`SslCertificateModal`):
    - Trạng thái chứng chỉ (Valid, Expired, Auto-Renew).
    - Nhà cấp phát (Let's Encrypt / aaWAF Enterprise CA).
    - Cấu hình bắt buộc chuyển hướng HTTPS (`301 Redirect`).
    - Cấu hình HTTP Strict Transport Security (`HSTS`, `max-age=31536000`).
    - Nút kích hoạt cấp phát lại chứng chỉ (ACME SSL Reissue).

### Tiêu Chuẩn 4: Tính Năng Xuất Dữ Liệu Đồng Bộ Số Lượng Thực (Accurate Export Count)
- **Vấn đề:** Nút hiển thị cố định "Xuất Excel (500)" trong khi tổng số bản ghi thực tế là 872+ hoặc bị giới hạn phân trang.
- **Quy chuẩn:**
  - Nhãn nút bấm phải luôn hiển thị số lượng theo bộ lọc thực tế: `Xuất Excel ({filteredLogs.length})`.
  - Dữ liệu xuất phải chứa toàn bộ các trường: Timestamp, Client IP, Quốc gia, Method, URI, Host đích, Mã luật CRS, Mô tả, Mức độ nghiêm trọng.
  - Phải chèn mã UTF-8 BOM (`\uFEFF`) để Microsoft Excel hiển thị tiếng Việt có dấu chuẩn xác 100%.

### Tiêu Chuẩn 5: Bố Cục Khoa Học - Tránh Rối Mắt (Sub-Tab Ergonomics)
- **Vấn đề:** Giao diện đặt quá nhiều form cấu hình song song (như Telegram & Gmail cạnh nhau) làm hẹp không gian nhập liệu và gây rối mắt.
- **Quy chuẩn:**
  - Phân tách thành các Sub-Tab dạng Pills (`Kênh Telegram Bot` | `Báo Cáo Gmail`) tương tự phân hệ `Blacklist / Whitelist`.
  - Phần đầu trang luôn có dải **Thẻ Chỉ Số KPI (Metrics Strip)** tóm tắt nhanh trạng thái: Trạng thái Bot, Kênh nhận tin, Trạng thái Gmail SMTP, Số lệnh SOC khả dụng.
  - Trang Settings chia thành 4 phân hệ rõ ràng: **Phân Quyền & Bảo Vệ Admin**, **Rate Limiting & Chống Brute-Force**, **Xác Thực Đăng Nhập**, **Sức Khỏe Hệ Thống & Sao Lưu**.

### Tiêu Chuẩn 6: Loại Bỏ Các Thành Phần Dư Thừa (Lean Architecture)
- **Quy chuẩn:**
  - Loại bỏ hoàn toàn các trang/module không mang lại giá trị vận hành thực tế (ví dụ: `SOC Command` / `map`).
  - Menu bên trái (Sidebar) chỉ tập trung vào các chức năng cốt lõi:
    1. Tổng Quan An Ninh (Overview)
    2. Website Được Bảo Vệ (Virtual Hosts)
    3. Kiểm Soát Truy Cập IP (Blacklist / Whitelist)
    4. Nhật Ký Chặn & Pháp Y (Interception Logs)
    5. Cảnh Báo An Ninh (Telegram & Gmail)
    6. Cấu Hình Hệ Thống (Settings)

---

## 3. Quy Trình Kiểm Thử Hoàn Thiện (Acceptance Test Checklist)

Trước khi bàn giao hoặc đưa vào vận hành, thực hiện kiểm thử tự động và thủ công:

```bash
# 1. Chạy toàn bộ 41+ ca kiểm thử tự động của backend
./test_api.sh

# 2. Build kiểm tra tính toàn vẹn của Frontend
cd frontend && npm run build

# 3. Khởi chạy lại container và xác nhận không có crash loop
docker compose up -d --build backend
docker compose ps
```

---

## 4. Danh Mục Tài Liệu Tham Khảo
- [ip-access-control/SKILL.md](file:///home/nguyenaimung/waf-project/.agents/skills/ip-access-control/SKILL.md): Cơ chế 2 tầng HAProxy & Coraza.
- [website-protection/SKILL.md](file:///home/nguyenaimung/waf-project/.agents/skills/website-protection/SKILL.md): Quản lý VHost và 3 chế độ WAF.
