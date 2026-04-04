import { Router, Response } from 'express'
import { z } from 'zod'
import { requireInvestor, AuthRequest } from '../middleware/auth'

const purchaseSchema = z.object({
  cusip:              z.string().min(9).max(9),
  requestedUnits:     z.number().positive(),
  maxPurchasePrice:   z.number().positive(),
  investorAccountRef: z.string().min(1),
})

const transferSchema = z.object({
  toEmail: z.string().email(),
})

const splitTransferSchema = z.object({
  toEmail:       z.string().email(),
  transferUnits: z.number().positive(),
})
import { kycService } from '../../services/kyc.service'
import { purchaseService } from '../../services/purchase.service'
import { transferService } from '../../services/transfer.service'
import { redemptionService } from '../../services/redemption.service'
import { couponService } from '../../services/coupon.service'

const router = Router()
router.use(requireInvestor)

// ── KYC ──────────────────────────────────────────────────────────────────────

router.get('/kyc', async (req: AuthRequest, res: Response) => {
  try {
    const status = await kycService.getKYCStatus(req.user!.investorId!)
    res.json(status)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── Holdings ──────────────────────────────────────────────────────────────────

router.get('/holdings', async (req: AuthRequest, res: Response) => {
  try {
    const holdings = await transferService.getHoldingsByInvestor(req.user!.investorId!)
    res.json(holdings)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// ── Purchase Requests ─────────────────────────────────────────────────────────

router.get('/purchases', async (req: AuthRequest, res: Response) => {
  try {
    const purchases = await purchaseService.getPurchaseRequestsByInvestor(req.user!.investorId!)
    res.json(purchases)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/purchases', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = purchaseSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map(e => e.message).join('; ') })
      return
    }
    const { cusip, requestedUnits, maxPurchasePrice, investorAccountRef } = parsed.data
    const request = await purchaseService.submitPurchaseRequest(
      req.user!.investorId!,
      cusip,
      requestedUnits,
      maxPurchasePrice,
      investorAccountRef,
    )
    res.status(201).json(request)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Transfers ─────────────────────────────────────────────────────────────────

router.post('/holdings/:holdingId/transfer', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = transferSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: 'toEmail must be a valid email address' })
      return
    }
    const { toEmail } = parsed.data
    const result = await transferService.transferHolding(
      req.params.holdingId,
      req.user!.investorId!,
      toEmail,
    )
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

router.post('/holdings/:holdingId/split-transfer', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = splitTransferSchema.safeParse(req.body)
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues.map(e => e.message).join('; ') })
      return
    }
    const { toEmail, transferUnits } = parsed.data
    const result = await transferService.splitTransfer(
      req.params.holdingId,
      req.user!.investorId!,
      toEmail,
      transferUnits,
    )
    res.json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Redemptions ───────────────────────────────────────────────────────────────

router.get('/redemptions', async (req: AuthRequest, res: Response) => {
  try {
    const redemptions = await redemptionService.getRedemptionsByInvestor(req.user!.investorId!)
    res.json(redemptions)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

router.post('/holdings/:holdingId/redeem', async (req: AuthRequest, res: Response) => {
  try {
    const result = await redemptionService.initiateRedemption(
      req.params.holdingId,
      req.user!.investorId!,
    )
    res.status(201).json(result)
  } catch (err) {
    res.status(400).json({ error: (err as Error).message })
  }
})

// ── Coupon History ────────────────────────────────────────────────────────────

router.get('/coupons', async (req: AuthRequest, res: Response) => {
  try {
    const coupons = await couponService.getCouponHistory(req.user!.investorId!)
    res.json(coupons)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

export default router
