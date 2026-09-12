#!/bin/bash
# Check if required Docker ports are available before startup

set -e

HTTP_PORT=8080
HTTPS_PORT=8083

echo "Checking port availability..."
echo "  HTTP port:  $HTTP_PORT"
echo "  HTTPS port: $HTTPS_PORT"

check_port() {
  local port=$1
  local protocol=$2

  if lsof -i ":$port" > /dev/null 2>&1; then
    echo ""
    echo "❌ ERROR: Port $port ($protocol) is already in use!"
    echo ""
    echo "Active processes on port $port:"
    lsof -i ":$port" || true
    echo ""
    echo "To free the port, run:"
    echo "  lsof -i :$port              # Find process ID"
    echo "  kill -9 <PID>               # Kill the process"
    echo ""
    echo "Or restart the service:"
    echo "  make down                   # Stop Docker container"
    echo "  make up                     # Restart on defined ports"
    echo ""
    return 1
  fi
}

if ! check_port "$HTTP_PORT" "HTTP"; then
  exit 1
fi

if ! check_port "$HTTPS_PORT" "HTTPS"; then
  exit 1
fi

echo "✓ All required ports are available"
echo "  Proceeding with startup..."
