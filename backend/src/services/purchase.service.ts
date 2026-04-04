// Purchase Service — handles the full bond purchase and token minting workflow.
//
// Flow:
//   1. Investor submits purchase request → EscrowRequest created on Canton
//   2. Bank verifies KYC and approves → ApprovedPurchase on Canton
//   3. DTC mock purchases the real bond
//   4. After DTC settlement: ConfirmCustodyAndMint + RecordMinting + TokenizedBond (separate submits)
//   5. Investor sees their TokenizedBond holding

import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import { custodyService } from './custody.service'
import { purchaseBondsAtDTC } from '../mock/dtc'
import type { EscrowRequestPayload, TokenizedBondPayload } from '../ledger/types'
import { v4 as uuidv4 } from 'uuid'

const BANK      = config.canton.bankPartyId
const REGULATOR = config.canton.regulatorPartyId

export const purchaseService = {

  async submitPurchaseRequest(
    investorId: string,
    cusip: string,
    requestedUnits: number,
    maxPurchasePrice: number,
    investorAccountRef: string,
  ) {
    const kyc = await db.query(
      `SELECT status FROM kyc_records WHERE investor_id = $1`,
      [investorId],
    )
    if (kyc.rows[0]?.status !== 'approved') {
      throw new Error('KYC must be approved before purchasing bonds')
    }

    const custody = await custodyService.getBondByCusip(cusip)
    if (!custody) throw new Error(`No available bonds for CUSIP ${cusip}`)
    if (custody.available_units < requestedUnits) {
      throw new Error(`Only ${custody.available_units} units available, requested ${requestedUnits}`)
    }

    const investor = await db.query(`SELECT * FROM investors WHERE id = $1`, [investorId])
    const inv      = investor.rows[0]

    const today = new Date().toISOString().slice(0, 10)
    let escrowContractId = `mock-escrow-${uuidv4()}`

    try {
      const metadata = buildMetadata(custody)
      const escrow = await ledger.create<EscrowRequestPayload>(
        TEMPLATE_IDS.EscrowRequest,
        {
          investor:          inv.canton_party_id,
          escrowBank:        BANK,
          regulator:         REGULATOR,
          metadata,
          requestedUnits:    requestedUnits.toString(),
          maxPurchasePrice:  { amount: (maxPurchasePrice * requestedUnits).toString(), currency: 'USD' },
          requestDate:       today,
          investorAccountRef,
          notes: '',
        },
        [BANK, inv.canton_party_id],
      )
      escrowContractId = escrow.contractId
    } catch (err) {
      console.warn('[Purchase] Canton unavailable, using mock contract ID:', err)
    }

    const result = await db.query(
      `INSERT INTO purchase_requests
         (investor_id, custody_record_id, escrow_contract_id, cusip,
          requested_units, max_purchase_price, investor_account_ref, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'pending')
       RETURNING *`,
      [investorId, custody.id, escrowContractId, cusip, requestedUnits, maxPurchasePrice, investorAccountRef],
    )
    return result.rows[0]
  },

  // Bank admin approves a purchase request and triggers DTC bond purchase
  async approvePurchaseRequest(purchaseRequestId: string) {
    const reqResult = await db.query(
      `SELECT pr.*, i.canton_party_id, i.id AS investor_id
       FROM purchase_requests pr
       JOIN investors i ON i.id = pr.investor_id
       WHERE pr.id = $1`,
      [purchaseRequestId],
    )
    const req = reqResult.rows[0]
    if (!req) throw new Error('Purchase request not found')
    if (req.status !== 'pending') throw new Error(`Cannot approve request with status: ${req.status}`)

    const custody = await custodyService.getBondById(req.custody_record_id)
    if (!custody) throw new Error('Custody record not found')

    let approvedContractId = `mock-approved-${uuidv4()}`

    try {
      const result = await ledger.exercise(
        TEMPLATE_IDS.EscrowRequest,
        req.escrow_contract_id,
        'ApproveRequest',
        {},
        BANK,
      )
      approvedContractId = result.contractId ?? approvedContractId
    } catch (err) {
      console.warn('[Purchase] Canton approve failed:', err)
    }

    await db.query(
      `UPDATE purchase_requests
       SET status = 'approved', approved_purchase_contract_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [approvedContractId, purchaseRequestId],
    )

    // Trigger DTC purchase asynchronously
    this.executeDTCPurchaseAndMint(purchaseRequestId, req, custody, approvedContractId).catch((err) =>
      console.error('[Purchase] DTC purchase error:', err),
    )

    return { status: 'approved', approvedContractId }
  },

  async executeDTCPurchaseAndMint(
    purchaseRequestId: string,
    req: Record<string, unknown>,
    custody: Record<string, unknown>,
    approvedContractId: string,
  ) {
    const dtcResult = await purchaseBondsAtDTC(
      req.cusip as string,
      Number(req.requested_units),
      Number(req.max_purchase_price),
    )

    // Step 1: ConfirmCustodyAndMint on Canton (archives ApprovedPurchase)
    try {
      await ledger.exercise(
        TEMPLATE_IDS.ApprovedPurchase,
        approvedContractId,
        'ConfirmCustodyAndMint',
        {
          dtcSettlementRef: dtcResult.settlementRef,
          actualPrice: {
            amount:   (dtcResult.settledPrice * Number(req.requested_units)).toString(),
            currency: 'USD',
          },
        },
        BANK,
      )
    } catch (err) {
      console.warn('[Purchase] ConfirmCustodyAndMint failed:', err)
    }

    // Step 2: RecordMinting on CustodyRecord
    try {
      await ledger.exercise(
        TEMPLATE_IDS.CustodyRecord,
        custody.canton_contract_id as string,
        'RecordMinting',
        { mintedUnits: req.requested_units?.toString() },
        BANK,
      )
    } catch (err) {
      console.warn('[Purchase] RecordMinting failed:', err)
    }

    const today = new Date().toISOString().slice(0, 10)
    const investorResult = await db.query(
      `SELECT canton_party_id FROM investors WHERE id = $1`,
      [req.investor_id],
    )
    const investorPartyId = investorResult.rows[0]?.canton_party_id

    // Step 3: Create TokenizedBond
    let bondContractId = `mock-bond-${uuidv4()}`
    try {
      if (investorPartyId) {
        const bond = await ledger.create<TokenizedBondPayload>(
          TEMPLATE_IDS.TokenizedBond,
          {
            escrowBank:       BANK,
            currentOwner:     investorPartyId,
            regulator:        REGULATOR,
            metadata:         buildMetadata(custody),
            units:            req.requested_units?.toString(),
            mintDate:         today,
            custodyCusip:     req.cusip,
            dtcSettlementRef: dtcResult.settlementRef,
            transferHistory:  [],
          },
          BANK,
        )
        bondContractId = bond.contractId
      }
    } catch (err) {
      console.warn('[Purchase] TokenizedBond creation failed:', err)
    }

    await custodyService.updateMintedUnits(custody.id as string, Number(req.requested_units))

    await db.query(
      `INSERT INTO holdings
         (canton_contract_id, investor_id, custody_record_id, cusip, units, mint_date, dtc_settlement_ref)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        bondContractId, req.investor_id, req.custody_record_id,
        req.cusip, req.requested_units, today, dtcResult.settlementRef,
      ],
    )

    await db.query(
      `UPDATE purchase_requests
       SET status = 'minted', actual_price = $1, dtc_settlement_ref = $2, updated_at = NOW()
       WHERE id = $3`,
      [dtcResult.settledPrice, dtcResult.settlementRef, purchaseRequestId],
    )
  },

  async rejectPurchaseRequest(purchaseRequestId: string, reason: string) {
    const reqResult = await db.query(
      `SELECT * FROM purchase_requests WHERE id = $1`,
      [purchaseRequestId],
    )
    const req = reqResult.rows[0]
    if (!req) throw new Error('Purchase request not found')

    try {
      await ledger.exercise(
        TEMPLATE_IDS.EscrowRequest,
        req.escrow_contract_id,
        'RejectRequest',
        { rejectionReason: reason },
        BANK,
      )
    } catch (err) {
      console.warn('[Purchase] Canton reject failed:', err)
    }

    await db.query(
      `UPDATE purchase_requests
       SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, purchaseRequestId],
    )
  },

  async getPurchaseRequestsByInvestor(investorId: string) {
    const result = await db.query(
      `SELECT pr.*, cr.issuer_name, cr.coupon_rate, cr.maturity_date
       FROM purchase_requests pr
       LEFT JOIN custody_records cr ON cr.id = pr.custody_record_id
       WHERE pr.investor_id = $1
       ORDER BY pr.created_at DESC`,
      [investorId],
    )
    return result.rows
  },

  async getAllPendingRequests() {
    const result = await db.query(
      `SELECT pr.*, i.full_name, u.email, cr.issuer_name
       FROM purchase_requests pr
       JOIN investors i ON i.id = pr.investor_id
       JOIN users u ON u.id = i.user_id
       LEFT JOIN custody_records cr ON cr.id = pr.custody_record_id
       WHERE pr.status = 'pending'
       ORDER BY pr.created_at ASC`,
    )
    return result.rows
  },
}

/** Normalise a Date | string value from PostgreSQL to "YYYY-MM-DD" for DAML. */
function toDateString(v: unknown): string {
  if (!v) return ''
  const s = v instanceof Date ? v.toISOString() : String(v)
  return s.slice(0, 10)
}

function buildMetadata(custody: Record<string, unknown>) {
  return {
    cusip:        custody.cusip,
    isin:         custody.isin,
    issuerName:   custody.issuer_name,
    assetClass:   custody.asset_class,
    treasuryType: custody.treasury_type ?? null,
    faceValue:    custody.face_value?.toString(),
    couponRate:   custody.coupon_rate?.toString(),
    couponFreq:   custody.coupon_freq,
    maturityDate: toDateString(custody.maturity_date),
    issuanceDate: toDateString(custody.issuance_date),
    regExemption: custody.reg_exemption,
  }
}
