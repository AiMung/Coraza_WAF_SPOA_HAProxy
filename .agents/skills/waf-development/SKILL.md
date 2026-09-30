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

## 2. Quy chuẩn thiết kế giao diện (Enterprise Light Theme Design Tokens)
Để đảm bảo giao diện đạt đẳng cấp chuyên nghiệp, sáng sủa và chuẩn mực hệ thống SaaS:
- **Tone màu chủ đạo**: Nền trang Slate nhạt dịu mắt (`#f8fafc`), khối thẻ nội dung nền Trắng tinh khiết (`#ffffff`), đường kẻ phân tách mảnh (`#e2e8f0` và `#f1f5f9`).
- **Sidebar**: Dark Navy (`#0f172a`) tạo điểm tựa tương phản kinh điển như GitHub, Stripe, Shopify.
- **Màu trạng thái (Severity & Status Pills - Pastel & Deep Text)**:
  - Đỏ Critical (`#fee2e2` nền, `#b91c1c` chữ): SQL Injection, RCE, Chặn 403 Forbidden.
  - Cam High (`#ffedd5` nền, `#c2410c` chữ): Cross-Site Scripting (XSS).
  - Hồng Traversal (`#fdf2f8` nền, `#be185d` chữ): Path Traversal (LFI/RFI).
  - Tím Scanner (`#f3e8ff` nền, `#7e22ce` chữ): Nikto, Sqlmap, Nmap.
  - Xanh Emerald (`#dcfce7` nền, `#15803d` chữ): WAF Active / Safe / Whitelist.
  - Xanh Dương Info (`#eff6ff` nền, `#1d4ed8` chữ): Phase, Port, System metrics.
- **Tiêu chuẩn bản đồ**: Sử dụng tile layer OpenStreetMap hoặc Esri Street miễn phí 100%, không sử dụng các nguồn yêu cầu API Key có watermark.

## 3. Quy trình phát triển từng trang (Page-by-Page Workflow)

### A. Trang Tổng quan (Overview)
- **Bố cục Hàng Đầu 3 Card Ngang Hàng (Top 3-Card Row Standard):**
  - Card 1: `Requests today` (Tổng HTTP) song song `Malicious requests` (Đã chặn WAF) với icon mắt tròn và đường phân cách thanh mảnh.
  - Card 2: `Xu hướng lưu lượng & Tấn công WAF` với biểu đồ Dual-Line (Đường Xanh `#10b981` tổng traffic và Đường Đỏ `#ef4444` đã chặn).
  - Card 3: `Hệ điều hành & Phần cứng` (`Sys`, `Run`, `Load`, thanh tiến trình `CPU` và `RAM`).
- **Hàng Telemetry Sparklines Ngang Hàng (3 Equal-Width Cards):**
  - Gồm 3 card: `QPS Đang xử lý`, `Resource Latency`, `Băng thông Tx/Rx` có độ rộng bằng nhau (`repeat(3, 1fr)`), trải đều toàn bộ chiều ngang bằng với khối Bản đồ Radar bên dưới.
- **Bản đồ Radar & Top Attackers:** Chiếm trọn 100% chiều ngang hàng, phân bổ 72% cho bản đồ nhiệt và 28% cho bảng xếp hạng IP truy cập.
- **Đồng bộ hóa Múi giờ (Timezone Synchronization):** Mọi container Docker và log hệ thống đều được cấu hình múi giờ `Asia/Ho_Chi_Minh` (GMT+7); Frontend dùng `formatLocalTime` để hiển thị đúng giờ thực tế của người dùng.
- **Tính Xác Thực Telemetry (100% Real System Data):**
  - CPU, RAM, Uptime, LoadAvg: Đọc trực tiếp từ `/proc/uptime`, `/proc/loadavg`, `/proc/meminfo`.
  - Băng thông Tx/Rx: Đọc trực tiếp từ file nhân Linux `/proc/net/dev`.
  - Resource Latency: Tính từ `AVG(latency_ms)` healthcheck thực tế các website được bảo vệ.
  - QPS Đang xử lý: Tính toán từ lưu lượng HTTP thực qua HAProxy và Coraza.
  - Tuyệt đối không dùng Mockdata nhân số lượng ảo (`* 120`).
- **Quy chuẩn Enterprise:** Không đặt thanh mô phỏng tấn công thử nghiệm trên Dashboard chính để đảm bảo sự nghiêm túc và đẳng cấp của giao diện SOC an ninh thông tin.

### B. Bản đồ Tấn công (Attack Map / Threat Radar)
- Sử dụng Leaflet với Dark Tile layer (ArcGIS Dark Canvas / CartoDB Dark Matter).
- Tọa độ trung tâm: Node phòng thủ WAF tại Việt Nam (`[10.8231, 106.6297]`).
- Vẽ đường cong quỹ đạo tấn công (Curved Trajectory Arcs) với hiệu ứng nét đứt chuyển động hướng về Việt Nam.
- Bộ lọc theo thời gian và chủng loại mã độc (SQLi, XSS, Scanner, LFI).

### C. Nhật ký chặn (Interception Forensics) & Quản lý Sự cố
- **Tiêu chuẩn Giao diện Enterprise SOC:**
  - Tiêu đề trang chuẩn mực: `Nhật Ký Chặn & Điều Tra Sự Cố (Interception Forensics)`.
  - Loại bỏ các nút dừng/tiếp tục cập nhật dư thừa; hiển thị huy hiệu `Live Stream WAF` với hiệu ứng chấm xanh pulsing biểu thị kết nối WebSocket thời gian thực đang hoạt động liên tục.
  - 4 thẻ KPI tóm tắt sự cố thiết kế tối giản, sạch sẽ (nền trắng `#ffffff`, viền mảnh `#e2e8f0`, chữ số đậm 24px, nhãn trạng thái tinh tế góc phải), tuyệt đối không dùng các khối hộp vuông màu sặc sỡ.
- **Bảng dữ liệu Log Table (Hero Component):**
  - Cột thời gian (Timestamp) bắt buộc hiển thị đầy đủ Ngày + Giờ (`YYYY-MM-DD HH:mm:ss`) kèm thời gian tương đối (`vừa xong`, `5p trước`).
  - Cột mục tiêu (URI) giới hạn chiều rộng tối đa (`max-width: 150px - 180px`) tránh tràn bảng, dùng font monospace thanh lịch và hiển thị toàn bộ URI khi rê chuột (tooltip).
  - Icon hành động sử dụng FontAwesome Free chuẩn: `fa-eye` (khám nghiệm), `fa-shield-halved` (chặn IP đa thời hạn), `fa-circle-check` (Whitelist), `fa-terminal` (sao chép cURL).
- **Cơ chế Sao chép Bất Bại (Resilient Copy Helper):**
  - Trong môi trường mạng nội bộ hoặc HTTP (`http://192.168.246.x`), `navigator.clipboard` bị trình duyệt vô hiệu hóa. Bắt buộc cài đặt hàm fallback sử dụng phần tử ẩn `<textarea>` + `document.execCommand('copy')` để các nút Sao chép IP và Sao chép cURL luôn hoạt động 100%.
- **Xuất Báo Cáo Chuyên Nghiệp (Excel CSV & JSON):**
  - Nút xuất hiển thị trực tiếp số lượng bản ghi tương ứng với bộ lọc hiện tại: `Xuất Excel (${count})` và `Xuất JSON`.
  - Tệp CSV phải được chèn tiền tố **UTF-8 BOM (`\uFEFF`)** trước khi tạo Blob để Microsoft Excel trên Windows/Mac hiển thị đúng font chữ tiếng Việt có dấu, không bị lỗi encoding.
- **Quy chuẩn Biểu đồ (Charts Standard):**
  - *Donut Chart*: Bắt buộc dùng `borderColor: '#ffffff'` và `borderWidth: 3` để phân tách múi mượt mà, không dùng viền đen trong Light theme. Chú thích dạng chấm tròn (`pointStyle: 'circle'`).
  - *Bar Chart (Tần suất chặn theo giờ)*: Gom nhóm động theo các giờ thực tế từ dữ liệu hệ thống (Rolling hours), đỉnh cột bo góc tròn mềm mại (`borderRadius: 6`).
  - *Dual-Line Trend Chart (Overview)*: Thể hiện đồng thời 2 đường đối chiếu: **Tổng lưu lượng** (Xanh ngọc `#10b981`) và **Lưu lượng bị chặn** (Đỏ hồng `#ef4444`) từ dữ liệu thực tế SQLite + HAProxy, không dùng mock multiplier.
- Chi tiết log (Modal View) chia 4 tab:
  1. *Overview*: Tóm tắt mã vi phạm, GeoIP, thời gian, kết quả kèm nút sao chép IP nhanh.
  2. *Payload*: Đoạn mã độc thực tế được trích xuất từ URI/Body.
  3. *Client Fingerprint*: Trình duyệt, Hệ điều hành và chuỗi User-Agent đầy đủ.
  4. *cURL*: Lệnh cURL sẵn sàng tái hiện sự cố vi phạm.

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
