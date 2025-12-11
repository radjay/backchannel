#!/bin/bash
# Load shared environment variables for all services

ENV_FILE="/home/matrix-ai/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  . "$ENV_FILE"
  set +a
else
  echo "⚠️  Env file not found at $ENV_FILE"
fi

