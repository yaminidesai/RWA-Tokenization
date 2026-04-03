import dotenv from 'dotenv'
dotenv.config()

function required(key: string): string {
  const value = process.env[key]
  if (!value) throw new Error(`Missing required environment variable: ${key}`)
  return value
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback
}

export const config = {
  port: parseInt(optional('PORT', '3001')),
  nodeEnv: optional('NODE_ENV', 'development'),

  db: {
    url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/rwa_platform'),
  },

  jwt: {
    secret: optional('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },

  canton: {
    // Base URL of the Canton HTTP JSON API v2 (started with --json-api-port)
    jsonApiUrl: optional('CANTON_JSON_API_URL', 'http://localhost:7575'),

    // Full Canton party IDs (format: DisplayName::1220<hex>)
    // Set these in .env once you have allocated parties via the ledger.
    bankPartyId: optional('BANK_PARTY_ID', 'EscrowBank'),
    regulatorPartyId: optional('REGULATOR_PARTY_ID', 'Regulator'),

    // Canton user ID for the bank (used in v2 submit commands).
    // Created via: participant.parties.allocate("bank-app") in Canton console.
    bankUserId: optional('BANK_USER_ID', 'bank-app'),
  },

  mock: {
    useRealJumio: optional('USE_REAL_JUMIO', 'false') === 'true',
    useRealDtc: optional('USE_REAL_DTC', 'false') === 'true',
    useRealFedwire: optional('USE_REAL_FEDWIRE', 'false') === 'true',
  },
}
