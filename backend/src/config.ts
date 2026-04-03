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
    jsonApiUrl: optional('CANTON_JSON_API_URL', 'http://localhost:7575'),
    bankPartyId: optional('BANK_PARTY_ID', 'EscrowBank'),
  },

  mock: {
    useRealJumio: optional('USE_REAL_JUMIO', 'false') === 'true',
    useRealDtc: optional('USE_REAL_DTC', 'false') === 'true',
    useRealFedwire: optional('USE_REAL_FEDWIRE', 'false') === 'true',
  },
}
