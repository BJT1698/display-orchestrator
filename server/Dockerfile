# ==============================================================================
# Build Stage: Compile Static Go Binary
# ==============================================================================
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Install build dependencies for CGO/SQLite if needed
RUN apk add --no-cache git ca-certificates

COPY go.mod ./
RUN go mod download

COPY . .

# Build statically linked binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server-bin ./cmd/server

# ==============================================================================
# Production Runtime Stage
# ==============================================================================
FROM alpine:3.20

WORKDIR /app

RUN apk add --no-cache ca-certificates tzdata curl

ENV PORT=8080
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV MEDIA_DIR=/media
ENV WEB_DIR=/app/web

RUN mkdir -p /data /media /app/web

COPY --from=builder /app/server-bin /app/server-bin
COPY web/ /app/web/

EXPOSE 8080

VOLUME ["/data", "/media"]

HEALTHCHECK --interval=20s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/api/health || exit 1

ENTRYPOINT ["/app/server-bin"]
