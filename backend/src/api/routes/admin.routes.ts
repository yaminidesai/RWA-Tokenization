import { Router, Response } from 'express'
import { requireAdmin, AuthRequest } from '../middleware/auth'
import { kycService } from '../../services/kyc.service'
import { custodyService } from '../../services/custody.service'
import { purchaseService } from '../../services/purchase.service'
import { redemptionService } from '../../services/redemption.service'
import { couponService } from '../../services/coupon.service'
import { db } from '../../db/client'

const router = Router()
router.use(requireAdmin)

// ── Dashboard Stats ───────────────────────────────────────────────────────────

router.get('/stats', async (_req: AuthRequest, res: Response) => {
  try {
    const [investors, pending, bonds, holdings] = await Promise.all([
      db.query(`SELECT COUNT(*) FROM investors`),
      db.query(`SELECT COUNT(*) FROM kyc_records WHERE status = 'pending_approval'`),
      db.query(`SELECT COUNT(*) FROM custody_records WHERE is_fully_redeemed = FALSE`),
      db.query(`SELECT COUNT(*) FROM holdings WHERE status = 'active'`),
    ])
    res.json({
      totalInvestors: parseInt(investors.rows[0].count),
      pendingKYC: parseInt(pending.rows[0].count),
      activeBonds: parseInt(bonds.rows[0].count),
      activeHoldings: parseInt(holdings.rows[0].count),
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── KYC Management ────────────────────────────────────────────────────────────

router.get('/kyc/pending', async (_req: AuthRequest, res: Response) => {
  try {
    const records = await kycService.getPendingKYC()
    res.json(records)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/kyc/:investorId/approve', async (req: AuthRequest, res: Response) => {
  try {
    await kycService.approveKYC(req.params.investorId)
    res.json({ status: 'approved' })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/kyc/:investorId/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body
    if (!reason) {
      res.status(400).json({ error: 'reason is required' })
      return
    }
    await kycService.rejectKYC(req.params.investorId, reason)
    res.json({ status: 'rejected' })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Bond (Custody) Management ─────────────────────────────────────────────────

router.get('/bonds', async (_req: AuthRequest, res: Response) => {
  try {
    const bonds = await custodyService.getAllCustodyRecords()
    res.json(bonds)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Valid DAML enum constructors — must match exactly what Types.daml declares
const VALID_ASSET_CLASS   = new Set(['USTreasury', 'GovernmentBond', 'CorporateBond', 'MunicipalBond'])
const VALID_TREASURY_TYPE = new Set(['TBill', 'TNote', 'TBond', 'TIPS', 'FRN'])
const VALID_COUPON_FREQ   = new Set(['Semiannual', 'Annual', 'Quarterly', 'Monthly', 'ZeroCoupon'])

router.post('/bonds', async (req: AuthRequest, res: Response) => {
  try {
    const { assetClass, treasuryType, couponFreq } = req.body
    if (!VALID_ASSET_CLASS.has(assetClass)) {
      res.status(400).json({ error: `Invalid assetClass "${assetClass}". Must be one of: ${[...VALID_ASSET_CLASS].join(', ')}` })
      return
    }
    if (treasuryType != null && !VALID_TREASURY_TYPE.has(treasuryType)) {
      res.status(400).json({ error: `Invalid treasuryType "${treasuryType}". Must be one of: ${[...VALID_TREASURY_TYPE].join(', ')}` })
      return
    }
    if (!VALID_COUPON_FREQ.has(couponFreq)) {
      res.status(400).json({ error: `Invalid couponFreq "${couponFreq}". Must be one of: ${[...VALID_COUPON_FREQ].join(', ')}` })
      return
    }
    const bond = await custodyService.createCustodyRecord(req.body)
    res.status(201).json(bond)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Purchase Management ───────────────────────────────────────────────────────

router.get('/purchases/pending', async (_req: AuthRequest, res: Response) => {
  try {
    const requests = await purchaseService.getAllPendingRequests()
    res.json(requests)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/purchases/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const result = await purchaseService.approvePurchaseRequest(req.params.id)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/purchases/:id/reject', async (req: AuthRequest, res: Response) => {
  try {
    const { reason } = req.body
    if (!reason) {
      res.status(400).json({ error: 'reason is required' })
      return
    }
    await purchaseService.rejectPurchaseRequest(req.params.id, reason)
    res.json({ status: 'rejected' })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Redemption Management ─────────────────────────────────────────────────────

router.get('/redemptions/pending', async (_req: AuthRequest, res: Response) => {
  try {
    const requests = await redemptionService.getAllPendingRedemptions()
    res.json(requests)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/redemptions/:id/approve', async (req: AuthRequest, res: Response) => {
  try {
    const { investorAccountRef } = req.body
    if (!investorAccountRef) {
      res.status(400).json({ error: 'investorAccountRef is required' })
      return
    }
    const result = await redemptionService.approveRedemption(req.params.id, investorAccountRef)
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Coupon Distribution ───────────────────────────────────────────────────────

router.post('/coupons/distribute', async (req: AuthRequest, res: Response) => {
  try {
    const { cusip, couponDate, annualCouponRate } = req.body
    if (!cusip || !couponDate || annualCouponRate === undefined) {
      res.status(400).json({ error: 'cusip, couponDate, annualCouponRate are required' })
      return
    }
    const results = await couponService.distributeCoupon(cusip, couponDate, Number(annualCouponRate))
    res.json({ distributed: results.length, payments: results })
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── All Investors ─────────────────────────────────────────────────────────────

router.get('/investors', async (_req: AuthRequest, res: Response) => {
  try {
    const result = await db.query(
      `SELECT i.*, u.email, k.status AS kyc_status
       FROM investors i
       JOIN users u ON u.id = i.user_id
       LEFT JOIN kyc_records k ON k.investor_id = i.id
       ORDER BY i.created_at DESC`,
    )
    res.json(result.rows)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
