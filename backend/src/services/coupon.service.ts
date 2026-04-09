// Coupon Service — pro-rata coupon distribution to all holders of a Treasury CUSIP.
//
// US Treasury bonds pay interest semiannually (T-Notes, T-Bonds, TIPS) or
// quarterly (FRNs). When DTC receives coupon proceeds from the US Treasury and
// credits them to the bank's participant account, it sends a corporate action
// notification (SWIFT MT564). This service processes that event by:
//   1. Querying all active holdings for the CUSIP from PostgreSQL
//   2. Calculating each investor's pro-rata share: units × face_value × periodicRate
//   3. Sending ACH payments via the Fedwire mock (production: real ACH/Fedwire)
//   4. Exercising TokenizedBond.RecordCouponPayment for each holder on Canton
//      [NONCONSUMING — bond remains active; creates a CouponPaymentRecord side-car]
//   5. Inserting coupon_payment rows into PostgreSQL for investor portal queries
//
// Why nonconsuming matters: RecordCouponPayment does NOT archive the TokenizedBond.
// The bond outlives multiple coupon cycles. Each cycle creates a new, separate
// CouponPaymentRecord contract that the investor can query as their payment receipt.
// This gives the regulator (observer on CouponPaymentRecord) a complete on-chain
// income record that cross-checks the bank's 1099 and EDGAR coupon disclosures.
//
// periodicRate calculation follows US Treasury day-count conventions:
//   Semiannual: annualRate / 2  (30/360 actual for T-Notes)
//   Quarterly:  annualRate / 4  (actual/360 for FRNs)
// In production, accrued interest adjustments for partial periods are required.
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
      const periodicRate  = calculatePeriodicRate(annualCouponRate, holding.coupon_freq)
      const couponAmount  = Number(holding.units) * Number(holding.face_value) * periodicRate

      const payment = await sendACHPayment(
        `ACCT-${holding.investor_id}`,
        couponAmount,
        `Coupon payment CUSIP ${cusip} date ${couponDate}`,
      )

      // Record coupon payment on Canton (non-consuming choice on TokenizedBond)
      let couponContractId = `mock-coupon-${uuidv4()}`
      try {
        const result = await ledger.exercise(
          TEMPLATE_IDS.TokenizedBond,
          holding.canton_contract_id,
          'RecordCouponPayment',
          {
            couponDate,
            couponAmount: { amount: couponAmount.toFixed(8), currency: 'USD' },
            paymentRef:   payment.traceNumber,
          },
          BANK,
        )
        couponContractId = result.contractId ?? couponContractId
      } catch (err) {
        console.warn(`[Coupon] Canton RecordCouponPayment failed for holding ${holding.id}:`, err)
      }

      await db.query(
        `INSERT INTO coupon_payments
           (canton_contract_id, holding_id, investor_id, cusip, coupon_date,
            amount, payment_ref, units_at_payment)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          couponContractId, holding.id, holding.investor_id, cusip, couponDate,
          couponAmount.toFixed(8), payment.traceNumber, holding.units,
        ],
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
