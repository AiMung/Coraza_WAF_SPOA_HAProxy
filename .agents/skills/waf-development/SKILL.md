---
name: waf-development
description: Hướng dẫn phát triển, chuẩn hóa giao diện và nâng cấp tính năng cho hệ thống Coraza SPOA WAF Dashboard
---

# Kỹ năng phát triển và vận hành hệ thống Coraza WAF Dashboard

Skill này cung cấp các nguyên tắc kiến trúc, quy chuẩn mã nguồn và quy trình hoàn thiện các phân hệ của Coraza SPOA WAF Dashboard (Frontend React + Backend Go + HAProxy + Coraza Engine).

## 1. Kiến trúc tổng thể (System Architecture)
- **Engine WAF**: Coraza SPOA v3 + OWASP Core Rule Set (CRS) v4.x.
- **Reverse Proxy**: HAProxy 2.8+ stream SPOE filter sang Coraza container qua TCP socket.
- **Backend API**: Go (Gin Gonic) xử lý:
  - SQLite database: lưu trữ `attack_logs`, `ip_rules`, `custom_rules`, `settings`, `sites`.
  - Log Watcher: theo dõi luồng audit log JSON (`coraza-audit.log`) theo thời gian thực (real-time stream parsing).
  - WebSocket Hub: đẩy event `new_attack` và `system_metrics` xuống client tức thì.
  - GeoIP Resolver: tự động map IP của attacker sang Quốc gia, Cờ, Tọa độ Lat/Lng và ISP.
  - Telegram Alert Service: gửi thông báo cảnh báo tức thời với format thẻ HTML chuyên nghiệp.
- **Frontend**: React + Vite + Leaflet Radar Map + Chart.js + Cyber SOC Dark Design System.

## 2. Quy chuẩn thiết kế giao diện (Cyber SOC UI/UX Design Tokens)
Để đảm bảo giao diện đạt đẳng cấp SOC chuyên nghiệp:
- **Tone màu chủ đạo**: Nền tối Deep Slate (`#0b0f19`, `#0f172a`, `#1e293b`), đường viền Glassmorphism (`rgba(255,255,255,0.06)` hoặc `rgba(16,185,129,0.15)`).
- **Màu trạng thái (Severity Level)**:
  - Đỏ Critical (`#ef4444` / `#f87171`): SQL Injection, Remote Code Execution (RCE).
  - Cam High (`#f97316`): Cross-Site Scripting (XSS).
  - Hồng Traversal (`#ec4899`): Path Traversal (LFI/RFI).
  - Tím Scanner (`#a855f7`): Nikto, Sqlmap, Nmap.
  - Xanh Emerald (`#10b981`): WAF Running / Safe / Normal.
- **Hiệu ứng trực quan**: Radar pulse rings, Glowing markers, Animated SVG/Canvas trajectories, Glassmorphic cards, Mono-code display.

## 3. Quy trình phát triển từng trang (Page-by-Page Workflow)

### A. Trang Tổng quan (Overview)
- Kết nối số liệu thật từ SQLite & Kernel Host: CPU, RAM, Uptime, QPS thực tế.
- Bản đồ Radar thu nhỏ hiển thị các điểm IP tấn công thực tế từ GeoIP, không dùng mock cứng.
- Danh sách sự kiện chặn mới nhất với nút bấm Xem chi tiết (Modal Payload Inspector) và nút Chặn IP (Blacklist nhanh).
- Nút Test / Mô phỏng tấn công gửi trực tiếp qua Backend/HAProxy để tạo live traffic.

### B. Bản đồ Tấn công (Attack Map / Threat Radar)
- Sử dụng Leaflet với Dark Tile layer (ArcGIS Dark Canvas / CartoDB Dark Matter).
- Tọa độ trung tâm: Node phòng thủ WAF tại Việt Nam (`[10.8231, 106.6297]`).
- Vẽ đường cong quỹ đạo tấn công (Curved Trajectory Arcs) với hiệu ứng nét đứt chuyển động hướng về Việt Nam.
- Bộ lọc theo thời gian và chủng loại mã độc (SQLi, XSS, Scanner, LFI).

### C. Nhật ký chặn (Interception Logs)
- Tìm kiếm tức thì theo: IP, URI, Rule ID, Loại tấn công, Phương thức HTTP.
- Bộ lọc phân trang linh hoạt (10, 25, 50, 100 bản ghi).
- Chi tiết log (Modal View) chia 4 tab:
  1. *Overview*: Tóm tắt mã vi phạm, GeoIP, thời gian, kết quả.
  2. *Headers*: Toàn bộ Request Headers từ client.
  3. *Payload*: Đoạn mã độc thực tế được trích xuất từ URI/Body.
  4. *Rule Details*: CRS Rule Message, Tag danh mục OWASP.
- Tích hợp nút **Sao chép lệnh cURL** để tái hiện tấn công và nút **Thêm vào Blacklist**.
- Chức năng **Xuất báo cáo (Export CSV / JSON)**.

### D. Cảnh báo Telegram (Telegram Alert System)
- Kiểm tra kết nối và gửi tin nhắn thử nghiệm (Test Connection).
- Mẫu thông báo phong phú gồm Emoji, Loại tấn công, IP, Vị trí địa lý, URI, Rule ID và nút hành động.
- Cơ chế chống nghẽn tin nhắn (Rate Limiting / Debounce) tránh bị spam khi có đợt tấn công dồn dập.

### E. Quản lý Danh sách IP & Luật tùy chỉnh (IP Rules & Custom Rules)
- Thêm/sửa/xóa Whitelist/Blacklist theo IP đơn lẻ hoặc dải CIDR.
- Tạo Custom Rule theo định nghĩa Coraza/SecRule (ví dụ: chặn User-Agent nghi ngờ, chặn URL nhạy cảm).
- Tự động nạp lại cấu hình hoặc hot-reload vào WAF.

## 4. Kiểm thử và Xác minh (Validation)
Mỗi khi triển khai tính năng mới:
1. Chạy `./test_waf.sh` hoặc script mô phỏng để sinh log tấn công.
2. Kiểm tra log được lưu vào SQLite và GeoIP phân giải chính xác.
3. Kiểm tra thông báo Telegram được gửi đến Chat ID chỉ định.
4. Kiểm tra giao diện Dashboard hiển thị mượt mà không lỗi console.
