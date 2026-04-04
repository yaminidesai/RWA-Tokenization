import express from 'express'
import cors from 'cors'
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
app.use(express.json())

// Audit log every request (must be after json parsing so body is available)
app.use(auditLogger)

// Rate limit on authentication endpoints — prevents brute-force attacks.
// 10 requests per minute per IP is generous for legit users but blocks scrapers.
const authLimiter = rateLimit({
  windowMs:    60 * 1000,   // 1 minute
  max:         10,
  message:     { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders:   false,
})

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.nodeEnv }))

app.use('/api/auth',     authLimiter, authRoutes)
app.use('/api/investor', investorRoutes)
app.use('/api/bonds',    bondsRoutes)
app.use('/api/admin',    adminRoutes)

app.use(errorHandler)
