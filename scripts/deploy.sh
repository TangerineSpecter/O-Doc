#!/bin/bash

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PROJECT_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)

export ODOC_DEPLOY_DIR="$PROJECT_ROOT/deploy"

exec bash "$PROJECT_ROOT/manager.sh" "$@"
