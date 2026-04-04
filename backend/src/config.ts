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

const isProduction = process.env.NODE_ENV === 'production'

export const config = {
  port:    parseInt(optional('PORT', '3001')),
  nodeEnv: optional('NODE_ENV', 'development'),

  db: {
    url: optional('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/rwa_platform'),
  },

  jwt: {
    // Require a real secret in production — never allow the insecure default.
    secret:    isProduction ? required('JWT_SECRET') : optional('JWT_SECRET', 'dev-secret-change-in-production'),
    expiresIn: optional('JWT_EXPIRES_IN', '8h'),
  },

  canton: {
    jsonApiUrl:       optional('CANTON_JSON_API_URL', 'http://localhost:7575'),
    bankPartyId:      optional('BANK_PARTY_ID', 'EscrowBank'),
    regulatorPartyId: optional('REGULATOR_PARTY_ID', 'Regulator'),
    bankUserId:       optional('BANK_USER_ID', 'bank-app'),

    // When true, Canton errors are thrown (no mock-ID fallback).
    // Defaults to true in production. Set STRICT_CANTON=false to override.
    strict: optional('STRICT_CANTON', isProduction ? 'true' : 'false') === 'true',
  },

  mock: {
    useRealJumio:   optional('USE_REAL_JUMIO',   'false') === 'true',
    useRealDtc:     optional('USE_REAL_DTC',     'false') === 'true',
    useRealFedwire: optional('USE_REAL_FEDWIRE', 'false') === 'true',
  },

  cors: {
    // Comma-separated list of allowed origins.
    origins: optional('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000').split(','),
  },
}
