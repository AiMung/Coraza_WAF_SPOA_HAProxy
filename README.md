# ĐỒ ÁN TỐT NGHIỆP: HỆ THỐNG WAF BẢO VỆ ỨNG DỤNG WEB (HAPROXY + CORAZA SPOA + GO + AAWAF UI)

## 📌 1. Giới Thiệu
Hệ thống Tường lửa Ứng dụng Web (Web Application Firewall - WAF) thế hệ mới được xây dựng bằng kiến trúc phân tán hiệu năng cao:
- **HAProxy 2.8+**: Reverse Proxy & Load Balancer tiếp nhận lưu lượng HTTP/HTTPS.
- **Coraza SPOA (Go)**: Stream Processing Offload Agent tích hợp bộ quy tắc phòng thủ tiêu chuẩn quốc tế **OWASP Core Rule Set (CRS v4.9)**.
- **Go Management Backend**: API RESTful & WebSocket real-time phân tích Audit Log, quản lý IP Blacklist/Whitelist và gửi cảnh báo tự động qua **Telegram Bot**.
- **aaWAF / SafeLine Dashboard UI**: Giao diện quản trị hiện đại Dark Mode, biểu đồ trực quan, giám sát sự kiện tấn công theo thời gian thực.

---

## 🚀 2. Cách Chạy Dự Án Bằng Docker

Tại thư mục dự án trên máy ảo Ubuntu (`192.168.246.100`):

```bash
# 1. Build và khởi động toàn bộ hệ thống
docker compose up -d --build

# 2. Kiểm tra trạng thái các container
docker compose ps
```

---

## 🌐 3. Địa Chỉ Truy Cập

| Dịch vụ | Địa chỉ | Chức năng |
| :--- | :--- | :--- |
| **Web Dashboard (aaWAF UI)** | `http://192.168.246.100:8080` | Giám sát Realtime, Cấu hình Telegram, Blacklist IP |
| **Cổng WAF (HAProxy)** | `http://192.168.246.100/` | Web ứng dụng được bảo vệ bởi WAF |

---

## 🧪 4. Kịch Bản Kiểm Thử Tấn Công (Demo)

Chạy script kiểm tra tự động:
```bash
chmod +x test_waf.sh
./test_waf.sh 192.168.246.100
```

Hoặc kiểm tra thủ công:
1. **Truy cập hợp lệ (Clean Traffic)**:
   ```bash
   curl -i http://192.168.246.100/
   # -> HTTP/1.1 200 OK
   ```
2. **Tấn công SQL Injection (SQLi)**:
   ```bash
   curl -i "http://192.168.246.100/?id=1'%20OR%201=1--"
   # -> HTTP/1.1 403 Forbidden
   ```
3. **Tấn công Cross-Site Scripting (XSS)**:
   ```bash
   curl -i "http://192.168.246.100/?q=<script>alert(1)</script>"
   # -> HTTP/1.1 403 Forbidden
   ```
4. **Tấn công Local File Inclusion (LFI)**:
   ```bash
   curl -i "http://192.168.246.100/?file=../../../../etc/passwd"
   # -> HTTP/1.1 403 Forbidden
   ```
5. **Security Scanner (sqlmap User-Agent)**:
   ```bash
   curl -i -A "sqlmap/1.6#stable" http://192.168.246.100/
   # -> HTTP/1.1 403 Forbidden
   ```
