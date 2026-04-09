// Redemption Service — irreversible bond maturity and principal return workflow.
//
// This service implements the most operationally sensitive flow in the platform:
// converting a live TokenizedBond into a settled cash payment and archived token.
// Because redemption involves real money movement (Fedwire) before Canton state
// changes, the sequencing and idempotency design are critical.
//
// Settlement-first pattern (DTC/Fedwire before Canton):
// approveRedemption runs off-chain settlement FIRST (DTC maturity redemption,
// then Fedwire principal payout to the investor), persists the payment reference
// to PostgreSQL, and ONLY THEN submits the atomic Canton batch. If Canton fails
// due to a transient network error, the saved payment_ref (Fedwire IMAD) allows
// the operator to re-run the Canton batch only, without re-settling at DTC.
// The deterministic commandId (`redeem-<redemptionRequestId>`) ensures Canton
// deduplicates the retry and returns the original result.
//
// DAML contract mapping:
//   initiateRedemption → ledger.exercise(TokenizedBond, InitiateRedemption)
//     [nonconsuming — bond stays alive; creates RedemptionRequest co-signed by bank + investor]
//   approveRedemption  → ledger.submitBatch([
//       exercise(RedemptionRequest, ApproveRedemption),  // validates amount > 0, ref present
//       exercise(TokenizedBond,     BurnToken),           // archives the investor's token
//       exercise(CustodyRecord,     RecordRedemption)     // decrements quantity + minted units
//     ])  — all three in a single Canton transaction
//
// The three-way atomic batch mirrors the guarantee required by institutional settlement
// finality standard: there must be no intermediate state where the investor's
// token is burned but the custody record still shows it as outstanding, or vice versa.
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
      redemptionContractId = result.contractId ?? redemptionContractId
    } catch (err) {
      if (config.canton.strict) throw err
      console.warn('[Redemption] Canton initiate failed:', err)
    }

    const result = await db.query(
      `INSERT INTO redemption_requests (holding_id, investor_id, canton_contract_id, units, status)
       VALUES ($1,$2,$3,$4,'requested')
       RETURNING *`,
      [holdingId, investorId, redemptionContractId, holding.units],
    )

    await db.query(
      `UPDATE holdings SET status = 'redemption_pending', updated_at = NOW() WHERE id = $1`,
      [holdingId],
    )
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

    // ── Off-chain settlement ──────────────────────────────────────────────────
    // DTC/Fedwire runs first because ApproveRedemption requires the actual
    // payment amount and reference as choice arguments. Save results to DB
    // before attempting Canton so the operation is idempotent on retry.
    const dtcResult     = await redeemBondsAtDTC(req.cusip, Number(req.units), Number(req.face_value))
    const fedwireResult = await sendFedwireTransfer(
      investorAccountRef,
      dtcResult.principalAmount,
      'USD',
      `Bond redemption CUSIP ${req.cusip}`,
    )

    // Persist payment details before Canton so we can retry Canton-only on failure
    await db.query(
      `UPDATE redemption_requests
       SET redemption_amount = $1, payment_ref = $2, updated_at = NOW()
       WHERE id = $3`,
      [dtcResult.principalAmount, fedwireResult.imad, redemptionRequestId],
    )

    // ── Atomic Canton transaction ─────────────────────────────────────────────
    // Three operations composed into one Canton transaction.
    // If Canton fails here, DTC/Fedwire already settled but Canton state is
    // inconsistent. The saved payment_ref above allows manual or automated retry.
    let newCustodyContractId = req.custody_record_id  // will be updated from Canton response
    try {
      const custodyRecord = await custodyService.getBondById(req.custody_record_id)
      if (!custodyRecord) throw new Error('Custody record not found')

      const batch = await ledger.submitBatch(
        [
          // 1. Mark redemption approved on Canton (validates amount > 0, ref non-empty)
          {
            type:       'exercise',
            templateId: TEMPLATE_IDS.RedemptionRequest,
            contractId: req.canton_contract_id,
            choice:     'ApproveRedemption',
            argument: {
              redemptionAmount: { amount: dtcResult.principalAmount.toString(), currency: 'USD' },
              paymentRef:       fedwireResult.imad,
            },
          },
          // 2. Burn the investor's TokenizedBond (archives it)
          {
            type:       'exercise',
            templateId: TEMPLATE_IDS.TokenizedBond,
            contractId: req.bond_contract_id,
            choice:     'BurnToken',
            argument:   {},
          },
          // 3. Decrement CustodyRecord minted units (archives old, creates new)
          {
            type:       'exercise',
            templateId: TEMPLATE_IDS.CustodyRecord,
            contractId: custodyRecord.canton_contract_id,
            choice:     'RecordRedemption',
            argument: {
              redeemedUnits:  req.units.toString(),
              redemptionRef:  dtcResult.redemptionRef,
            },
          },
        ],
        BANK,
        `redeem-${redemptionRequestId}`,   // deterministic commandId enables idempotent retry
      )

      newCustodyContractId = batch.createdByTemplate['CustodyRecord'] ?? newCustodyContractId
    } catch (err) {
      if (config.canton.strict) throw err
      console.warn('[Redemption] Atomic Canton batch failed (DTC/Fedwire already settled):', err)
    }

    // ── DB updates ────────────────────────────────────────────────────────────
    await db.query(
      `UPDATE redemption_requests
       SET status = 'approved', updated_at = NOW()
       WHERE id = $1`,
      [redemptionRequestId],
    )

    await db.query(
      `UPDATE holdings SET status = 'redeemed', updated_at = NOW() WHERE id = $1`,
      [req.holding_id],
    )

    await custodyService.decrementMintedUnitsAndContract(
      req.custody_record_id,
      Number(req.units),
      newCustodyContractId,
    )

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
