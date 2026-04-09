// Express application — security middleware, rate limiting, and route registration.
//
// Middleware ordering matters:
//   1. CORS — must be first to handle preflight OPTIONS before any auth checks
//   2. cookieParser — required before auth middleware reads req.cookies.token
//   3. express.json() — body must be parsed before auditLogger reads req.body
//   4. auditLogger — logs every request with user context, method, path, status
//   5. Route-specific rate limiters
//   6. Routes (each router applies its own requireAuth/requireAdmin guard)
//   7. errorHandler — catches any unhandled errors and returns structured JSON
//
// Rate limiting strategy:
//   authLimiter (10/min)     — auth endpoints: prevents credential brute-force
//   purchaseLimiter (30/min) — investor purchase: prevents inventory exhaustion spam
//   adminLimiter (60/min)    — admin endpoints: generous for ops workflows, blocks scripts
//
// All rate limits are per-IP. In a production deployment behind a load balancer,
// set trust proxy: true and rate-limit by X-Forwarded-For.
import express from 'express'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import rateLimit from 'express-rate-limit'
import { config } from '../config'
import authRoutes from './routes/auth.routes'
import investorRoutes from './routes/investor.routes'
import bondsRoutes from './routes/bonds.routes'
import adminRoutes from './routes/admin.routes'
import { errorHandler } from './middleware/error'
import { auditLogger } from './middleware/audit'

export const app = express()

// ── Security middleware ───────────────────────────────────────────────────────

app.use(cors({ origin: config.cors.origins, credentials: true }))
app.use(cookieParser())
app.use(express.json())

// Audit log every request (must be after json parsing so body is available)
app.use(auditLogger)

// Rate limiters — see header comment above for strategy
const authLimiter = rateLimit({
  windowMs:    60 * 1000,   // 1 minute window
  max:         10,
  message:     { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
})

const purchaseLimiter = rateLimit({
  windowMs:    60 * 1000,
  max:         30,          // 30 purchase attempts per minute per IP
  message:     { error: 'Too many purchase requests, please slow down' },
  standardHeaders: true,
  legacyHeaders:   false,
})

const adminLimiter = rateLimit({
  windowMs:    60 * 1000,
  max:         60,          // generous for ops workflows; blocks scripted abuse
  message:     { error: 'Too many admin requests' },
  standardHeaders: true,
  legacyHeaders:   false,
})

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.nodeEnv }))

app.use('/api/auth',     authLimiter,     authRoutes)
app.use('/api/investor', purchaseLimiter, investorRoutes)
app.use('/api/bonds',    bondsRoutes)
app.use('/api/admin',    adminLimiter,    adminRoutes)

app.use(errorHandler)
