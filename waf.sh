#!/usr/bin/env bash
# aaWAF Control Center — menu khởi động & vận hành hệ thống
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

HOST_IP="${WAF_HOST_IP:-}"
if [[ -z "$HOST_IP" ]]; then
  HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
  HOST_IP="${HOST_IP:-127.0.0.1}"
fi

need_cmd() {
  command -v "$1" >/dev/null 2>&1
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

banner() {
  clear
  echo -e "${CYAN}"
  cat <<'EOF'
    ╔══════════════════════════════════════════════════════════╗
    ║          aaWAF  ·  Coraza SPOA + HAProxy + Go            ║
    ║          React Dashboard  ·  SOC Command Center          ║
    ╚══════════════════════════════════════════════════════════╝
EOF
  echo -e "${NC}"
  echo -e "  ${DIM}Thư mục:${NC} ${ROOT}"
  echo -e "  ${DIM}Host IP:${NC} ${BOLD}${HOST_IP}${NC}"
  echo
}

press_enter() {
  echo
  read -r -p "Nhấn Enter để quay lại menu..." _
}

build_frontend() {
  echo -e "${CYAN}▶ Build giao diện React (Vite)...${NC}"
  if need_cmd npm; then
    (cd "$ROOT/frontend" && npm install && npm run build)
  else
    echo -e "${YELLOW}Không có Node/npm trên máy — dùng Docker Node 20 để build.${NC}"
    docker run --rm -v "$ROOT/frontend:/app" -w /app node:20-alpine sh -c "npm install && npm run build"
  fi
  echo -e "${GREEN}✓ Frontend đã build vào frontend/dist${NC}"
}

start_stack() {
  echo -e "${CYAN}▶ Build React UI rồi khởi động toàn bộ cụm Docker...${NC}"
  build_frontend
  compose up -d --build
  echo
  compose ps
  echo
  echo -e "${GREEN}✓ Hệ thống đã khởi động.${NC}"
  echo -e "  Dashboard  : ${BOLD}http://${HOST_IP}:8080${NC}"
  echo -e "  Ứng dụng WAF: ${BOLD}http://${HOST_IP}/${NC}"
}

stop_stack() {
  echo -e "${YELLOW}▶ Dừng toàn bộ container...${NC}"
  compose down
  echo -e "${GREEN}✓ Đã dừng.${NC}"
}

restart_stack() {
  echo -e "${CYAN}▶ Khởi động lại cụm...${NC}"
  compose restart
  compose ps
  echo -e "${GREEN}✓ Đã restart.${NC}"
}

show_status() {
  echo -e "${CYAN}▶ Trạng thái Docker:${NC}"
  compose ps
  echo
  echo -e "${CYAN}▶ Health API:${NC}"
  if curl -sf "http://127.0.0.1:8080/api/stats?range=today" >/dev/null; then
    echo -e "  ${GREEN}Backend API : OK (port 8080)${NC}"
  else
    echo -e "  ${RED}Backend API : chưa sẵn sàng${NC}"
  fi
  CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1/" || true)"
  echo -e "  HAProxy     : HTTP ${CODE:-n/a} (port 80)"
}

show_logs() {
  echo
  echo "  1) Backend (Go API)"
  echo "  2) Coraza SPOA"
  echo "  3) HAProxy"
  echo "  4) Tất cả (theo dõi)"
  read -r -p "Chọn [1-4]: " choice
  case "$choice" in
    1) compose logs -f --tail=80 backend ;;
    2) compose logs -f --tail=80 coraza-spoa ;;
    3) compose logs -f --tail=80 haproxy ;;
    *) compose logs -f --tail=40 ;;
  esac
}

run_tests() {
  chmod +x "$ROOT/test_waf.sh" 2>/dev/null || true
  "$ROOT/test_waf.sh" "${HOST_IP}"
}

dev_frontend() {
  echo -e "${CYAN}▶ Chế độ phát triển React (Vite :5173, proxy /api → :8080)${NC}"
  echo -e "${DIM}Backend Docker nên đang chạy. Ctrl+C để thoát Vite.${NC}"
  (cd "$ROOT/frontend" && npm install && npm run dev -- --host 0.0.0.0)
}

rebuild_all() {
  echo -e "${CYAN}▶ Rebuild sạch (không xóa volume dữ liệu SQLite)...${NC}"
  build_frontend
  compose up -d --build --force-recreate
  compose ps
}

while true; do
  banner
  echo -e "  ${BOLD}1)${NC}  Khởi động hệ thống (build React + Docker)"
  echo -e "  ${BOLD}2)${NC}  Dừng hệ thống"
  echo -e "  ${BOLD}3)${NC}  Khởi động lại"
  echo -e "  ${BOLD}4)${NC}  Trạng thái / kiểm tra health"
  echo -e "  ${BOLD}5)${NC}  Xem log realtime"
  echo -e "  ${BOLD}6)${NC}  Chỉ build frontend React"
  echo -e "  ${BOLD}7)${NC}  Rebuild toàn bộ stack"
  echo -e "  ${BOLD}8)${NC}  Chạy kịch bản kiểm thử WAF (SQLi/XSS/LFI)"
  echo -e "  ${BOLD}9)${NC}  Dev UI React (Vite, không build Docker)"
  echo -e "  ${BOLD}0)${NC}  Thoát"
  echo
  read -r -p "  Chọn thao tác: " op
  echo
  case "$op" in
    1) start_stack; press_enter ;;
    2) stop_stack; press_enter ;;
    3) restart_stack; press_enter ;;
    4) show_status; press_enter ;;
    5) show_logs || true; press_enter ;;
    6) build_frontend; press_enter ;;
    7) rebuild_all; press_enter ;;
    8) run_tests; press_enter ;;
    9) dev_frontend ;;
    0) echo "Tạm biệt."; exit 0 ;;
    *) echo -e "${RED}Lựa chọn không hợp lệ.${NC}"; sleep 1 ;;
  esac
done
