// Custody Service — manages the bank's on-chain attestation of DTC bond holdings.
// The bank buys real bonds at DTC and creates CustodyRecords on Canton as self-attestation.

import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import type { CustodyRecordPayload, BondMetadata } from '../ledger/types'

const BANK = config.canton.bankPartyId

export interface CreateCustodyInput {
  cusip: string
  isin: string
  issuerName: string
  assetClass: string
  treasuryType?: string
  faceValue: number
  couponRate: number
  couponFreq: string
  maturityDate: string
  issuanceDate: string
  regExemption: string
  quantity: number
  purchasePriceTotal: number
  dtcSettlementRef: string
  dealerReference: string
  fedwireImad?: string
}

export const custodyService = {

  async createCustodyRecord(input: CreateCustodyInput) {
    const today = new Date().toISOString().slice(0, 10)

    const metadata: BondMetadata = {
      cusip: input.cusip,
      isin: input.isin,
      issuerName: input.issuerName,
      assetClass: input.assetClass,
      treasuryType: input.treasuryType ?? null,
      faceValue: input.faceValue.toString(),
      couponRate: input.couponRate.toString(),
      couponFreq: input.couponFreq,
      maturityDate: input.maturityDate,
      issuanceDate: input.issuanceDate,
      regExemption: input.regExemption,
    }

    let contractId = `mock-custody-${Date.now()}`
    try {
      const payload: Record<string, unknown> = {
        escrowBank: BANK,
        metadata,
        quantity: input.quantity.toString(),
        purchaseDate: today,
        purchasePrice: { amount: input.purchasePriceTotal.toString(), currency: 'USD' },
        dtcSettlementRef: input.dtcSettlementRef,
        dealerReference: input.dealerReference,
        fedwireImad: input.fedwireImad ?? null,
        totalMintedUnits: '0',
        isFullyRedeemed: false,
      }
      const contract = await ledger.create<CustodyRecordPayload>(TEMPLATE_IDS.CustodyRecord, payload, BANK)
      contractId = contract.contractId
    } catch (err) {
      console.warn('[Custody] Canton unavailable, using mock contract ID:', err)
    }

    const result = await db.query(
      `INSERT INTO custody_records
         (canton_contract_id, cusip, isin, issuer_name, asset_class, treasury_type,
          face_value, coupon_rate, coupon_freq, maturity_date, issuance_date, reg_exemption,
          quantity, total_minted_units, purchase_date, dtc_settlement_ref, dealer_reference)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16)
       RETURNING *`,
      [
        contractId, input.cusip, input.isin, input.issuerName,
        input.assetClass, input.treasuryType ?? null,
        input.faceValue, input.couponRate, input.couponFreq,
        input.maturityDate, input.issuanceDate, input.regExemption,
        input.quantity, today, input.dtcSettlementRef, input.dealerReference,
      ],
    )
    return result.rows[0]
  },

  async listAvailableBonds() {
    const result = await db.query(
      `SELECT *, (quantity - total_minted_units) AS available_units
       FROM custody_records
       WHERE is_fully_redeemed = FALSE
         AND (quantity - total_minted_units) > 0
       ORDER BY maturity_date ASC`,
    )
    return result.rows
  },

  async getBondByCusip(cusip: string) {
    const result = await db.query(
      `SELECT *, (quantity - total_minted_units) AS available_units
       FROM custody_records WHERE cusip = $1 AND is_fully_redeemed = FALSE`,
      [cusip],
    )
    return result.rows[0] ?? null
  },

  async getBondById(id: string) {
    const result = await db.query(
      `SELECT *, (quantity - total_minted_units) AS available_units
       FROM custody_records WHERE id = $1`,
      [id],
    )
    return result.rows[0] ?? null
  },

  async updateMintedUnits(custodyRecordId: string, additionalUnits: number) {
    await db.query(
      `UPDATE custody_records
       SET total_minted_units = total_minted_units + $1, updated_at = NOW()
       WHERE id = $2`,
      [additionalUnits, custodyRecordId],
    )
  },

  async decrementMintedUnits(custodyRecordId: string, redeemedUnits: number) {
    await db.query(
      `UPDATE custody_records
       SET total_minted_units = total_minted_units - $1,
           quantity = quantity - $1,
           is_fully_redeemed = (quantity - $1 = 0),
           updated_at = NOW()
       WHERE id = $2`,
      [redeemedUnits, custodyRecordId],
    )
  },

  async getAllCustodyRecords() {
    const result = await db.query(
      `SELECT *, (quantity - total_minted_units) AS available_units
       FROM custody_records ORDER BY created_at DESC`,
    )
    return result.rows
  },
}
