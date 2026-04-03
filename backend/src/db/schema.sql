-- RWA Treasury Bond Tokenization Platform — Database Schema
-- Run once: psql $DATABASE_URL -f src/db/schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users (investors + bank admins) ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('investor', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Investor Profiles ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS investors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canton_party_id     TEXT UNIQUE,          -- assigned after KYC approval
  full_name           TEXT NOT NULL,
  jurisdiction        TEXT NOT NULL,         -- ISO 3166-1 alpha-2
  accreditation_level TEXT NOT NULL DEFAULT 'Accredited',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── KYC Records ──────────────────────────────────────────────────────────────
-- Status flow:
--   registered → invited → accepted → pending_approval → approved
--                                                       → rejected
--                                                       → revoked

CREATE TABLE IF NOT EXISTS kyc_records (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id                 UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
  status                      TEXT NOT NULL DEFAULT 'registered',
  invitation_contract_id      TEXT,          -- Canton KYCInvitation contract ID
  kyc_contract_id             TEXT UNIQUE,   -- Canton InvestorKYC contract ID
  jumio_reference             TEXT,          -- mock/real Jumio workflow ID
  ofac_reference              TEXT,
  approval_date               DATE,
  expiry_date                 DATE,
  last_screening_date         DATE,
  rejection_reason            TEXT,
  kyc_provider_ref            TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Available Bonds (Custody Records) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custody_records (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canton_contract_id  TEXT UNIQUE NOT NULL,
  cusip               TEXT NOT NULL,
  isin                TEXT NOT NULL,
  issuer_name         TEXT NOT NULL,
  asset_class         TEXT NOT NULL,
  treasury_type       TEXT,
  face_value          NUMERIC(20,8) NOT NULL,
  coupon_rate         NUMERIC(10,8) NOT NULL,
  coupon_freq         TEXT NOT NULL,
  maturity_date       DATE NOT NULL,
  issuance_date       DATE NOT NULL,
  reg_exemption       TEXT NOT NULL,
  quantity            NUMERIC(20,8) NOT NULL,
  total_minted_units  NUMERIC(20,8) NOT NULL DEFAULT 0,
  purchase_date       DATE NOT NULL,
  dtc_settlement_ref  TEXT NOT NULL,
  dealer_reference    TEXT NOT NULL,
  is_fully_redeemed   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Token Holdings ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS holdings (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canton_contract_id  TEXT UNIQUE NOT NULL,
  investor_id         UUID NOT NULL REFERENCES investors(id),
  custody_record_id   UUID NOT NULL REFERENCES custody_records(id),
  cusip               TEXT NOT NULL,
  units               NUMERIC(20,8) NOT NULL,
  mint_date           DATE NOT NULL,
  dtc_settlement_ref  TEXT NOT NULL,
  transfer_history    JSONB NOT NULL DEFAULT '[]',
  status              TEXT NOT NULL DEFAULT 'active',   -- active | redeemed | transferred
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Purchase Requests ─────────────────────────────────────────────────────────
-- Status: pending → approved → minted
--                 → rejected
--                 → cancelled

CREATE TABLE IF NOT EXISTS purchase_requests (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investor_id                   UUID NOT NULL REFERENCES investors(id),
  custody_record_id             UUID REFERENCES custody_records(id),
  escrow_contract_id            TEXT UNIQUE,   -- Canton EscrowRequest ID
  approved_purchase_contract_id TEXT UNIQUE,   -- Canton ApprovedPurchase ID
  cusip                         TEXT NOT NULL,
  requested_units               NUMERIC(20,8) NOT NULL,
  max_purchase_price            NUMERIC(20,8) NOT NULL,
  currency                      TEXT NOT NULL DEFAULT 'USD',
  status                        TEXT NOT NULL DEFAULT 'pending',
  rejection_reason              TEXT,
  actual_price                  NUMERIC(20,8),
  dtc_settlement_ref            TEXT,
  investor_account_ref          TEXT NOT NULL,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Transfer Records ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS transfers (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_holding_id     UUID NOT NULL REFERENCES holdings(id),
  from_investor_id      UUID NOT NULL REFERENCES investors(id),
  to_investor_id        UUID NOT NULL REFERENCES investors(id),
  units                 NUMERIC(20,8) NOT NULL,
  transfer_ref          TEXT NOT NULL,
  is_split              BOOLEAN NOT NULL DEFAULT FALSE,
  new_holding_id        UUID REFERENCES holdings(id),
  remainder_holding_id  UUID REFERENCES holdings(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Redemption Requests ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS redemption_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id          UUID NOT NULL REFERENCES holdings(id),
  investor_id         UUID NOT NULL REFERENCES investors(id),
  canton_contract_id  TEXT UNIQUE,
  units               NUMERIC(20,8) NOT NULL,
  status              TEXT NOT NULL DEFAULT 'requested',   -- requested | approved | rejected
  redemption_amount   NUMERIC(20,8),
  currency            TEXT NOT NULL DEFAULT 'USD',
  payment_ref         TEXT,
  rejection_reason    TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Coupon Payments ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS coupon_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canton_contract_id  TEXT UNIQUE,
  holding_id          UUID NOT NULL REFERENCES holdings(id),
  investor_id         UUID NOT NULL REFERENCES investors(id),
  cusip               TEXT NOT NULL,
  coupon_date         DATE NOT NULL,
  amount              NUMERIC(20,8) NOT NULL,
  currency            TEXT NOT NULL DEFAULT 'USD',
  payment_ref         TEXT NOT NULL,
  units_at_payment    NUMERIC(20,8) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Ledger Event Cursor ───────────────────────────────────────────────────────
-- Tracks the last processed ledger offset for event streaming

CREATE TABLE IF NOT EXISTS ledger_cursor (
  id         INTEGER PRIMARY KEY DEFAULT 1,
  offset_val TEXT NOT NULL DEFAULT 'begin',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ledger_cursor (id, offset_val)
VALUES (1, 'begin')
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Bank Admin User ─────────────────────────────────────────────────────
-- Default admin password: Admin1234! (change immediately in production)
-- Hash generated with bcrypt rounds=12

INSERT INTO users (email, password_hash, role)
VALUES (
  'admin@bank.com',
  '$2a$12$jjWxHN6kL/HpUlO0Awn.COaYfaNyZyR098jJXwLHhmIBeUEFvvFnq',
  'admin'
)
ON CONFLICT (email) DO NOTHING;
