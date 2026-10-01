---
name: waf-production-readiness
description: Quy chuẩn kiến trúc, đánh giá mức độ hoàn thiện, đặc tả kỹ thuật (Scope & Spec) và tiêu chuẩn nghiệm thu không lỗi vặt (Zero-Petty-Bug Standard) cho hệ thống Coraza WAF SPOA HAProxy Enterprise Dashboard.
---

# WAF Production Readiness & Zero-Petty-Bug Standard

Bộ quy chuẩn kỹ thuật, phân tích hạn chế và đặc tả phạm vi công việc (Workload Scope & Technical Spec) nhằm kiểm soát chất lượng, nghiệm thu sản phẩm và đảm bảo hệ thống **Coraza WAF + SPOA + HAProxy Enterprise Dashboard** đạt chuẩn vận hành môi trường doanh nghiệp mà không phát sinh lỗi vặt.

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

Mọi module phải tuân thủ nghiêm ngặt 7 tiêu chuẩn sau:

1. **Lưu Trữ Bền Vững Trạng Thái (No Metric Loss on Reload):** Mọi chỉ số lưu lượng Virtual Host phải được lưu vào SQLite (`valid_requests`). Không bao giờ hiển thị gạch ngang `—` khi F5.
2. **Đồng Bộ TTL Đếm Ngược & Xóa Tức Thì (Instant Eviction):** Khi hết hạn (`expires_at <= now`), dòng IP phải biến mất tức thì (0ms latency), không dùng hiệu ứng xoay tròn `fa-spin` trên icon đồng hồ.
3. **Quản Lý Chứng Chỉ SSL Tương Tác Trực Tiếp (Interactive SSL):** Bấm biểu tượng SSL mở modal cấu hình Force HTTPS (301), HSTS và ACME Reissue.
4. **Nút Xuất Dữ Liệu Đồng Bộ Số Lượng Thực (Accurate Export Count):** Nhãn nút bấm luôn hiển thị động `Xuất Excel ({filteredLogs.length})`, xuất đầy đủ bản ghi kèm UTF-8 BOM chuẩn tiếng Việt.
5. **Thử Thách Chống CC Flood Không Được Treo (Zero-Hang Challenge):** Trang `/waf-challenge` tích hợp sẵn hộp kiểm Cloudflare Turnstile tương tác độc lập (1-Click), tự động chuyển hướng và có nút Fast Pass.
6. **Loại Bỏ Preloader Chặn Màn Hình (Instant Tab Switching):** Khi chuyển tab (như Chống CC & Bot), dữ liệu phải nạp ngầm, không chặn màn hình bằng spinner.
7. **Bố Cục Khoa Học Dạng Sub-Tabs (Pill Navigation):** Tách bạch các nhóm chức năng bằng Sub-Tabs dạng Pills kết hợp Thẻ KPI trực quan trên cùng.

---

## 3. Phân Tích 5 Hạn Chế Cần Khắc Phục (Gap Analysis)

Dù hệ thống đã đạt mức hoàn thiện cao, để đạt chuẩn bàn giao Doanh nghiệp 10/10 cần khắc phục 5 điểm sau:

### Hạn Chế 1: Quản Trị Phiên Đăng Nhập (Admin Authentication & Session Guard) [Mức P0]
- **Vấn đề:** Nút "Log out" hiện tại chỉ gọi `window.location.reload()`. Khi đưa Dashboard ra Internet qua Cloudflare Tunnel hoặc IP tĩnh, bất kỳ ai biết port 8080 đều có thể xem và sửa cấu hình WAF.
- **Giải pháp:** Bổ sung cơ chế Xác thực Quản trị viên (Admin Login Dialog / JWT Token hoặc Session Cookie). Khi chưa đăng nhập, chuyển hướng về màn hình Login chuyên nghiệp.

### Hạn Chế 2: Tối Ưu Hóa & Tự Dọn Dẹp Database (SQLite Log Retention & Pruning) [Mức P0]
- **Vấn đề:** Bảng `attack_logs` lưu trữ không giới hạn. Khi số lượng log vượt quá 50,000 - 100,000 bản ghi, dung lượng file SQLite phình to và làm chậm các câu lệnh thống kê.
- **Giải pháp:**
  - Bổ sung cơ chế tự động dọn dẹp (Auto-pruning): Tự động lưu trữ tối đa N bản ghi gần nhất (ví dụ 10,000 log) hoặc xóa log cũ hơn 30 ngày.
  - Bổ sung nút **"Dọn Dẹp / Xóa Nhật Ký An Toàn (Clear Logs)"** trong giao diện có hộp thoại xác nhận mã PIN quản trị.

### Hạn Chế 3: Đồng Bộ Sự Kiện Real-time Đa Trình Duyệt (WebSocket Event Bus) [Mức P1]
- **Vấn đề:** Hiện tại WebSocket chủ yếu phát sự kiện `new_attack` và `ip_rules_updated`. Khi người quản trị thay đổi chế độ WAF của Website hoặc bật/tắt Chống CC ở trình duyệt A, trình duyệt B chưa tự cập nhật ngay mà phải chờ F5.
- **Giải pháp:** Mở rộng WebSocket phát thêm các sự kiện: `sites_updated`, `bot_config_updated`, `settings_updated`.

### Hạn Chế 4: Giám Sát Liveness Socket SPOA & HAProxy Tự Phục Hồi (Auto-Heal Daemon) [Mức P1]
- **Vấn đề:** Giao thức SPOE chạy qua TCP socket `:9000`. Nếu tiến trình Coraza SPOA bị restart hoặc gián đoạn, HAProxy có thể bỏ qua kiểm tra WAF hoặc báo lỗi kết nối.
- **Giải pháp:** Backend chạy một goroutine kiểm tra sức khỏe socket TCP `:9000` định kỳ 5 giây. Nếu mất kết nối, hiển thị Banner cảnh báo đỏ trên Dashboard và tự động kích hoạt tiến trình phục hồi.

### Hạn Chế 5: Tinh Chỉnh Mức Độ Nhạy Của Bộ Luật CRS v4 (Paranoia Level Tuning) [Mức P2]
- **Vấn đề:** Bộ luật OWASP CRS v4 đang chạy ở mức mặc định (Paranoia Level 1). Các doanh nghiệp tài chính hoặc thương mại điện tử cần khả năng tùy chỉnh PL1 đến PL4 và cấu hình ngưỡng Inbound Anomaly Score.
- **Giải pháp:** Bổ sung tùy chọn chọn Paranoia Level (PL1 - PL4) trong trang Custom Rules hoặc Website settings.

---

## 4. Đặc Tả Phạm Vi Công Việc (Workload Scope & WBS)

| Mã CV | Hạng Mục Công Việc | Mức Độ | Trọng Tâm Kỹ Thuật | Thời Gian Dự Kiến |
| :---: | :--- | :---: | :--- | :---: |
| **WBS-1** | **Bảo Vệ Đăng Nhập Quản Trị (Admin Auth Guard)** | **P0** | Xây dựng Modal Login / Session Token bảo vệ cổng `:8080`, hỗ trợ đăng xuất thật | 2 giờ |
| **WBS-2** | **Quản Lý Vòng Đời Log (Log Retention & Pruning)** | **P0** | API xóa/dọn log SQLite theo ngày/số lượng, nút dọn log có confirm | 1.5 giờ |
| **WBS-3** | **Đồng Bộ Đa Thiết Bị (Full WebSocket Events)** | **P1** | Phát sự kiện `sites_updated`, `bot_updated` qua WebSocket cho mọi client | 1 giờ |
| **WBS-4** | **Kiểm Tra Liveness HAProxy & SPOA Socket** | **P1** | Healthcheck TCP :9000, hiển thị icon trạng thái Engine xanh/đỏ trên Header | 1 giờ |
| **WBS-5** | **Tùy Biến CRS Paranoia Level (PL1 - PL4)** | **P2** | Cho phép chọn mức độ nhạy bộ luật OWASP CRS v4 theo từng website | 1.5 giờ |

---

## 5. Quy Trình Kiểm Thử Hoàn Thiện (Acceptance Test Checklist)

```bash
# 1. Chạy toàn bộ 41+ ca kiểm thử tự động của backend
./test_api.sh

# 2. Build kiểm tra tính toàn vẹn của Frontend
cd frontend && npm run build

# 3. Khởi chạy lại container và xác nhận không có crash loop
docker compose up -d --build backend
docker compose ps
```
