// auth middleware — JWT verification for investor, admin, and shared routes.
//
// Token delivery: supports both Authorization: Bearer <token> (API clients,
// testing) and httpOnly cookie named "token" (browser SPA). The cookie path
// avoids storing the JWT in localStorage, which is vulnerable to XSS; httpOnly
// cookies are not accessible to JavaScript at all.
//
// Algorithm: HS256 with the server's JWT_SECRET. The algorithms list is pinned
// to ['HS256'] to prevent algorithm-confusion attacks (e.g., RS256/none bypass).
// jwt.verify() automatically validates the exp claim — expired tokens return 401.
//
// Role-based guards:
//   requireAuth    — any authenticated user (used on /api/bonds public listing)
//   requireInvestor — role === 'investor' (all /api/investor/* routes)
//   requireAdmin   — role === 'admin' (all /api/admin/* routes)
// These are applied at the router level in app.ts, not per-endpoint, so adding
// a new route to an existing router automatically inherits the correct guard.
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
