FROM golang:alpine AS builder

RUN apk add --no-cache gcc musl-dev git

ENV GOTOOLCHAIN=auto

WORKDIR /app

COPY . .

# Tự động tải đầy đủ thư viện và sinh go.sum
RUN go mod tidy

# Build with CGO for SQLite3 support
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /app/server main.go

# Final Runtime Image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata sqlite-libs docker-cli \
    && mkdir -p /app/data /app/frontend /var/log/coraza

WORKDIR /app
COPY --from=builder /app/server /app/server

ENV DB_PATH=/app/data/waf.db \
    AUDIT_LOG_PATH=/var/log/coraza/audit.log \
    FRONTEND_DIR=/app/frontend \
    PORT=8080

EXPOSE 8080

VOLUME ["/app/data", "/var/log/coraza"]

CMD ["/app/server"]
