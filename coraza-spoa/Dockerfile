FROM golang:alpine AS builder

RUN apk add --no-cache git make gcc musl-dev

WORKDIR /src
# Clone official coraza-spoa
RUN git clone --depth 1 https://github.com/corazawaf/coraza-spoa.git . \
    && go mod download \
    && CGO_ENABLED=0 go build -ldflags="-s -w" -o /coraza-spoa .

# Download OWASP Core Rule Set (CRS)
WORKDIR /crs
RUN git clone --depth 1 --branch v4.9.0 https://github.com/coreruleset/coreruleset.git /opt/coreruleset \
    && cp /opt/coreruleset/crs-setup.conf.example /opt/coreruleset/crs-setup.conf

# Final Runtime Image
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata \
    && mkdir -p /etc/coraza-spoa/rules /var/log/coraza /tmp

COPY --from=builder /coraza-spoa /usr/local/bin/coraza-spoa
COPY --from=builder /opt/coreruleset /etc/coraza-spoa/coreruleset

COPY config.yaml /etc/coraza-spoa/config.yaml
COPY coraza.conf /etc/coraza-spoa/coraza.conf
COPY rules/ /etc/coraza-spoa/rules/

EXPOSE 9000

VOLUME ["/var/log/coraza"]

ENTRYPOINT ["/usr/local/bin/coraza-spoa"]
CMD ["-config", "/etc/coraza-spoa/config.yaml"]
