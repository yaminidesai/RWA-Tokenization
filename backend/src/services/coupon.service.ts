// Coupon Service — distributes coupon payments to all investors holding a CUSIP.
// In production, this is triggered by DTC corporate action notifications (MT564).

import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import { sendACHPayment } from '../mock/fedwire'
import { v4 as uuidv4 } from 'uuid'

const BANK = config.canton.bankPartyId

export const couponService = {

  // Called by bank admin when DTC notifies of a coupon payment for a CUSIP
  async distributeCoupon(cusip: string, couponDate: string, annualCouponRate: number) {
    // Find all active holdings for this CUSIP
    const holdingsResult = await db.query(
      `SELECT h.*, i.canton_party_id, i.id AS investor_id, cr.face_value, cr.coupon_freq,
              cr.id AS custody_record_id
       FROM holdings h
       JOIN investors i ON i.id = h.investor_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE h.cusip = $1 AND h.status = 'active'`,
      [cusip],
    )

    const results = []
    for (const holding of holdingsResult.rows) {
      const periodicRate = calculatePeriodicRate(annualCouponRate, holding.coupon_freq)
      const couponAmount = Number(holding.units) * Number(holding.face_value) * periodicRate

      // Send ACH payment to investor (use Fedwire for large amounts in production)
      const payment = await sendACHPayment(
        `ACCT-${holding.investor_id}`,
        couponAmount,
        `Coupon payment CUSIP ${cusip} date ${couponDate}`,
      )

      // Record coupon payment on Canton
      let couponContractId = `mock-coupon-${uuidv4()}`
      try {
        const contract = await ledger.exercise(
          TEMPLATE_IDS.TokenizedBond,
          holding.canton_contract_id,
          'RecordCouponPayment',
          {
            couponDate,
            couponAmount: { amount: couponAmount.toFixed(8), currency: 'USD' },
            paymentRef: payment.traceNumber,
          },
          BANK,
        )
        couponContractId = (contract as { contractId?: string }).contractId ?? couponContractId
      } catch (err) {
        console.warn(`[Coupon] Canton RecordCouponPayment failed for holding ${holding.id}:`, err)
      }

      // Record in database
      await db.query(
        `INSERT INTO coupon_payments
           (canton_contract_id, holding_id, investor_id, cusip, coupon_date,
            amount, payment_ref, units_at_payment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [couponContractId, holding.id, holding.investor_id, cusip, couponDate,
         couponAmount.toFixed(8), payment.traceNumber, holding.units],
      )

      results.push({ investorId: holding.investor_id, amount: couponAmount, paymentRef: payment.traceNumber })
    }

    return results
  },

  async getCouponHistory(investorId: string) {
    const result = await db.query(
      `SELECT cp.*, cr.issuer_name
       FROM coupon_payments cp
       JOIN holdings h ON h.id = cp.holding_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE cp.investor_id = $1
       ORDER BY cp.coupon_date DESC`,
      [investorId],
    )
    return result.rows
  },
}

function calculatePeriodicRate(annualRate: number, frequency: string): number {
  switch (frequency) {
    case 'Semiannual': return annualRate / 2
    case 'Quarterly':  return annualRate / 4
    case 'Monthly':    return annualRate / 12
    case 'Annual':     return annualRate
    default:           return 0
  }
}
