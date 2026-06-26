#!/bin/sh
set -e

# Always import the realm on startup for fresh local profiling runs.
# The --optimized path would skip import if a cached image exists.
echo "[Keycloak] Starting with --import-realm for fresh local deployment..."
exec /opt/keycloak/bin/kc.sh start --import-realm