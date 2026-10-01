#!/usr/bin/env bash
# aaWAF Cloudflare Tunnel Launcher
# Exposes the WAF-protected demo site to the Internet with free HTTPS

echo "=========================================================="
echo "  🚀 KÍCH HOẠT CLOUDFLARE TUNNEL CHO WEB DEMO WAF"
echo "  🌐 Đích chuyển tiếp: http://127.0.0.1:80 (HAProxy + Coraza WAF)"
echo "  🔒 Miễn phí 100%, có sẵn chứng chỉ HTTPS toàn cầu"
echo "=========================================================="
echo ""
echo "Đang khởi tạo đường truyền bảo mật tới Cloudflare..."
echo "Khi kết nối hoàn tất, hãy copy link đuôi '.trycloudflare.com' để gửi cho mọi người!"
echo "Nhấn Ctrl+C để dừng chia sẻ."
echo ""

docker run --rm -it --net=host cloudflare/cloudflared:latest tunnel --url http://127.0.0.1:80 --http-host-header 192.168.246.100
