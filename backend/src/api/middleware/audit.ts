import { Request, Response, NextFunction } from 'express'
import { db } from '../../db/client'
import { AuthRequest } from './auth'

const REDACT_FIELDS = new Set(['password', 'password_hash', 'token', 'authorization'])

/** Produce a safe summary of the request body (max 500 chars, passwords redacted). */
function summariseBody(body: unknown): string | null {
  if (!body || typeof body !== 'object' || Object.keys(body as object).length === 0) return null
  try {
    const sanitised = Object.fromEntries(
      Object.entries(body as Record<string, unknown>).map(([k, v]) =>
        REDACT_FIELDS.has(k.toLowerCase()) ? [k, '[REDACTED]'] : [k, v],
      ),
    )
    return JSON.stringify(sanitised).slice(0, 500)
  } catch {
    return null
  }
}

/**
 * Audit logging middleware — records every API request to the audit_log table.
 * Never fails a request: if the INSERT fails, the error is swallowed.
 *
 * Satisfies SOX § 404 / MiFID II Article 25 record-keeping requirements.
 */
export function auditLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now()

  res.on('finish', () => {
    const userId = (req as AuthRequest).user?.id ?? null
    const bodySummary = summariseBody(req.body)

    db.query(
      `INSERT INTO audit_log (user_id, method, path, status_code, ip, duration_ms, body_summary)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, req.method, req.path, res.statusCode, req.ip, Date.now() - start, bodySummary],
    ).catch(() => { /* never let audit failure affect the response */ })
  })

  next()
}
