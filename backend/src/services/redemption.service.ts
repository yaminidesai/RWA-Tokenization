import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import { custodyService } from './custody.service'
import { redeemBondsAtDTC } from '../mock/dtc'
import { sendFedwireTransfer } from '../mock/fedwire'
import { v4 as uuidv4 } from 'uuid'

const BANK = config.canton.bankPartyId

export const redemptionService = {

  async initiateRedemption(holdingId: string, investorId: string) {
    const holdingResult = await db.query(
      `SELECT h.*, i.canton_party_id, cr.face_value, cr.maturity_date, cr.cusip
       FROM holdings h
       JOIN investors i ON i.id = h.investor_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE h.id = $1 AND h.investor_id = $2 AND h.status = 'active'`,
      [holdingId, investorId],
    )
    const holding = holdingResult.rows[0]
    if (!holding) throw new Error('Holding not found')

    let redemptionContractId = `mock-redemption-${uuidv4()}`

    try {
      const result = await ledger.exercise(
        TEMPLATE_IDS.TokenizedBond,
        holding.canton_contract_id,
        'InitiateRedemption',
        {},
        holding.canton_party_id,
      )
      redemptionContractId = (result as { contractId?: string }).contractId ?? redemptionContractId
    } catch (err) {
      console.warn('[Redemption] Canton initiate failed:', err)
    }

    const result = await db.query(
      `INSERT INTO redemption_requests (holding_id, investor_id, canton_contract_id, units, status)
       VALUES ($1,$2,$3,$4,'requested')
       RETURNING *`,
      [holdingId, investorId, redemptionContractId, holding.units],
    )

    await db.query(`UPDATE holdings SET status = 'redemption_pending', updated_at = NOW() WHERE id = $1`, [holdingId])
    return result.rows[0]
  },

  async approveRedemption(redemptionRequestId: string, investorAccountRef: string) {
    const reqResult = await db.query(
      `SELECT rr.*, h.canton_contract_id AS bond_contract_id,
              h.custody_record_id, cr.face_value, cr.cusip,
              i.canton_party_id
       FROM redemption_requests rr
       JOIN holdings h ON h.id = rr.holding_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       JOIN investors i ON i.id = rr.investor_id
       WHERE rr.id = $1`,
      [redemptionRequestId],
    )
    const req = reqResult.rows[0]
    if (!req) throw new Error('Redemption request not found')
    if (req.status !== 'requested') throw new Error(`Cannot approve redemption with status: ${req.status}`)

    // Process DTC redemption and Fedwire payment
    const dtcResult = await redeemBondsAtDTC(req.cusip, Number(req.units), Number(req.face_value))
    const fedwireResult = await sendFedwireTransfer(
      investorAccountRef,
      dtcResult.principalAmount,
      'USD',
      `Bond redemption CUSIP ${req.cusip}`,
    )

    // Approve on Canton + burn token + update custody
    try {
      await ledger.exercise(
        TEMPLATE_IDS.RedemptionRequest,
        req.canton_contract_id,
        'ApproveRedemption',
        {
          redemptionAmount: { amount: dtcResult.principalAmount.toString(), currency: 'USD' },
          paymentRef: fedwireResult.imad,
        },
        BANK,
      )
      await ledger.exercise(TEMPLATE_IDS.TokenizedBond, req.bond_contract_id, 'BurnToken', {}, BANK)
      await ledger.exercise(
        TEMPLATE_IDS.CustodyRecord,
        req.custody_record_id,
        'RecordRedemption',
        { redeemedUnits: req.units.toString(), redemptionRef: dtcResult.redemptionRef },
        BANK,
      )
    } catch (err) {
      console.warn('[Redemption] Canton operations failed:', err)
    }

    await db.query(
      `UPDATE redemption_requests
       SET status = 'approved', redemption_amount = $1, payment_ref = $2, updated_at = NOW()
       WHERE id = $3`,
      [dtcResult.principalAmount, fedwireResult.imad, redemptionRequestId],
    )

    await db.query(`UPDATE holdings SET status = 'redeemed', updated_at = NOW() WHERE id = $1`, [req.holding_id])
    await custodyService.decrementMintedUnits(req.custody_record_id, Number(req.units))

    return { redemptionAmount: dtcResult.principalAmount, paymentRef: fedwireResult.imad }
  },

  async getRedemptionsByInvestor(investorId: string) {
    const result = await db.query(
      `SELECT rr.*, h.cusip, cr.issuer_name, cr.face_value
       FROM redemption_requests rr
       JOIN holdings h ON h.id = rr.holding_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE rr.investor_id = $1
       ORDER BY rr.created_at DESC`,
      [investorId],
    )
    return result.rows
  },

  async getAllPendingRedemptions() {
    const result = await db.query(
      `SELECT rr.*, i.full_name, u.email, h.cusip, cr.issuer_name
       FROM redemption_requests rr
       JOIN investors i ON i.id = rr.investor_id
       JOIN users u ON u.id = i.user_id
       JOIN holdings h ON h.id = rr.holding_id
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE rr.status = 'requested'
       ORDER BY rr.created_at ASC`,
    )
    return result.rows
  },
}
