#!/bin/bash
# RWA Platform — Local Development Startup Script
# Run this once to start everything on your laptop.
# Prerequisites: Node.js 18+, PostgreSQL, DAML SDK 3.4.10, Java 17+

set -e
cd "$(dirname "$0")"

echo ""
echo "═══════════════════════════════════════════════════════"
echo "  RWA Treasury Bond Tokenization Platform — Dev Setup"
echo "═══════════════════════════════════════════════════════"
echo ""

# ── Step 1: Build DAML contracts ─────────────────────────────────────────────
echo "[1/6] Building DAML contracts..."
daml build
echo "      ✓ DAR built: .daml/dist/rwa-tokenization-0.0.1.dar"
echo ""

# ── Step 2: Start Canton sandbox ─────────────────────────────────────────────
echo "[2/6] Starting Canton sandbox (background)..."
daml sandbox &
SANDBOX_PID=$!
echo "      ✓ Canton sandbox starting on port 6865 (PID $SANDBOX_PID)"
sleep 5
echo ""

# ── Step 3: Start DAML HTTP JSON API ─────────────────────────────────────────
echo "[3/6] Starting DAML HTTP JSON API (background)..."
daml json-api \
  --ledger-host localhost \
  --ledger-port 6865 \
  --http-port 7575 &
JSON_API_PID=$!
echo "      ✓ JSON API starting on port 7575 (PID $JSON_API_PID)"
sleep 3
echo ""

# ── Step 4: Set up database ───────────────────────────────────────────────────
echo "[4/6] Setting up PostgreSQL database..."
if [ ! -f backend/.env ]; then
  cp backend/.env.example backend/.env
  echo "      ⚠ Copied backend/.env.example to backend/.env"
  echo "        Edit backend/.env if your PostgreSQL credentials differ from defaults."
fi

# Load env and create database
source backend/.env
DB_NAME=$(echo $DATABASE_URL | sed 's/.*\///')
psql -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "      (database already exists)"
psql "$DATABASE_URL" -f backend/src/db/schema.sql
echo "      ✓ Database schema applied"
echo ""

# ── Step 5: Install dependencies ─────────────────────────────────────────────
echo "[5/6] Installing dependencies..."
(cd backend  && npm install --silent)
(cd frontend && npm install --silent)
echo "      ✓ npm packages installed"
echo ""

# ── Step 6: Start backend + frontend ─────────────────────────────────────────
echo "[6/6] Starting backend and frontend..."
(cd backend  && npm run dev) &
BACKEND_PID=$!
(cd frontend && npm run dev) &
FRONTEND_PID=$!
echo ""

echo "═══════════════════════════════════════════════════════"
echo "  Everything is running!"
echo "═══════════════════════════════════════════════════════"
echo ""
echo "  Investor portal: http://localhost:5173"
echo "  Backend API:     http://localhost:3001"
echo "  Canton ledger:   localhost:6865 (gRPC)"
echo "  JSON API:        http://localhost:7575"
echo ""
echo "  Admin login:  admin@bank.com / Admin1234!"
echo "  (Change the admin password in backend/src/db/schema.sql)"
echo ""
echo "  Press Ctrl+C to stop everything."
echo "═══════════════════════════════════════════════════════"

# Wait and clean up on exit
trap "kill $SANDBOX_PID $JSON_API_PID $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
