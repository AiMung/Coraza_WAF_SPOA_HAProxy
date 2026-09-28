FROM golang:1.22-alpine AS builder

RUN apk add --no-cache gcc musl-dev git

WORKDIR /app

COPY go.mod ./
# Download modules
RUN go mod tidy || true

COPY . .

# Build with CGO for SQLite3 support
RUN CGO_ENABLED=1 GOOS=linux go build -ldflags="-s -w" -o /app/server main.go

# Final Runtime Image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata sqlite-libs

WORKDIR /app
COPY --from=builder /app/server /app/server
COPY ../frontend /app/frontend

ENV DB_PATH=/app/data/waf.db \
    AUDIT_LOG_PATH=/var/log/coraza/audit.log \
    FRONTEND_DIR=/app/frontend \
    PORT=8080

EXPOSE 8080

VOLUME ["/app/data", "/var/log/coraza"]

CMD ["/app/server"]
