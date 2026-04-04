import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { config } from '../../config'

export interface AuthRequest extends Request {
  user?: { id: string; email: string; role: string; investorId?: string }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  // Accept token from Authorization header (API clients) OR httpOnly cookie (browser)
  let token: string | undefined
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    token = header.slice(7)
  } else if ((req as any).cookies?.token) {
    token = (req as any).cookies.token
  }

  if (!token) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' })
    return
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      algorithms: ['HS256'],
    }) as AuthRequest['user']
    req.user = decoded
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' })
      return
    }
    next()
  })
}

export function requireInvestor(req: AuthRequest, res: Response, next: NextFunction) {
  requireAuth(req, res, () => {
    if (req.user?.role !== 'investor') {
      res.status(403).json({ error: 'Investor access required' })
      return
    }
    next()
  })
}
