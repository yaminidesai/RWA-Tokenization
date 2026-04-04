import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { z } from 'zod'
import { db } from '../../db/client'
import { config } from '../../config'
import { kycService } from '../../services/kyc.service'

const registerSchema = z.object({
  email:        z.string().email(),
  password:     z.string().min(8, 'Password must be at least 8 characters'),
  fullName:     z.string().min(2).max(100),
  jurisdiction: z.string().length(2, 'jurisdiction must be ISO 3166-1 alpha-2 (2 chars)').toUpperCase(),
})

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
})

const router = Router()

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parsed = registerSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map(e => e.message).join('; ') })
      return
    }
    const { email, password, fullName, jurisdiction } = parsed.data

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email])
    if (existing.rows[0]) {
      res.status(409).json({ error: 'Email already registered' })
      return
    }

    const passwordHash = await bcrypt.hash(password, 12)

    // Create user
    const userResult = await db.query(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, 'investor') RETURNING id, email, role`,
      [email.toLowerCase(), passwordHash],
    )
    const user = userResult.rows[0]

    // Create investor profile
    const investorResult = await db.query(
      `INSERT INTO investors (user_id, full_name, jurisdiction) VALUES ($1, $2, $3) RETURNING id`,
      [user.id, fullName, jurisdiction],
    )
    const investorId = investorResult.rows[0].id

    // Create initial KYC record
    await db.query(
      `INSERT INTO kyc_records (investor_id, status) VALUES ($1, 'registered')`,
      [investorId],
    )

    // Start KYC process in background
    kycService.initiateKYC(investorId).catch((err) => console.error('[Auth] KYC initiation error:', err))

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, investorId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
    )

    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role, investorId } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Registration failed'
    res.status(500).json({ error: message })
  }
})

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'email and password are required' })
      return
    }
    const { email, password } = parsed.data

    const result = await db.query(
      `SELECT u.*, i.id AS investor_id
       FROM users u
       LEFT JOIN investors i ON i.user_id = u.id
       WHERE u.email = $1`,
      [email.toLowerCase()],
    )
    const user = result.rows[0]
    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' })
      return
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, investorId: user.investor_id },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions,
    )

    res.json({ token, user: { id: user.id, email: user.email, role: user.role, investorId: user.investor_id } })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Login failed'
    res.status(500).json({ error: message })
  }
})

export default router
