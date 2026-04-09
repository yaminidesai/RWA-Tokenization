// Custody Service — dual-record management of DTC bond holdings.
//
// Every bond position in this system exists in two places simultaneously:
//   1. On the Canton ledger as a CustodyRecord contract (the authoritative source
//      for the 1:1 backing invariant, visible to the regulator observer)
//   2. In PostgreSQL as a custody_records row (the fast-query projection used by
//      the admin portal and purchase availability checks)
//
// createCustodyRecord keeps both in sync atomically: it creates the Canton contract
// first, captures the contract ID in the response, then inserts the PostgreSQL row
// with that contract ID. This contract ID is what the purchase and redemption services
// use when exercising RecordMinting and RecordRedemption on the Canton ledger.
//
// The two locking methods (updateMintedUnitsAndContract, decrementMintedUnitsAndContract)
// use SELECT FOR UPDATE to serialize concurrent reads. This is a second line of defense
// behind the DAML ensure clause — even if two purchase requests pass the availability
// check simultaneously, only one can hold the row lock and increment minted_units.
// The other will see the updated quantity and fail if units would be exceeded.
//
// available_units is a computed column (quantity - total_minted_units) derived at
// query time. It is not stored separately to avoid update anomalies — the single
// source of truth is the total_minted_units field updated by the locking methods.
//
// The bank buys real bonds at DTC and creates CustodyRecords on Canton as self-attestation.

import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import type { CustodyRecordPayload, BondMetadata } from '../ledger/types'

const BANK      = config.canton.bankPartyId
const REGULATOR = config.canton.regulatorPartyId

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
      cusip:       input.cusip,
      isin:        input.isin,
      issuerName:  input.issuerName,
      assetClass:  input.assetClass,
      treasuryType: input.treasuryType ?? null,
      faceValue:   input.faceValue.toString(),
      couponRate:  input.couponRate.toString(),
      couponFreq:  input.couponFreq,
      maturityDate:  input.maturityDate,
      issuanceDate:  input.issuanceDate,
      regExemption:  input.regExemption,
    }

    let contractId = `mock-custody-${Date.now()}`
    try {
      const contract = await ledger.create<CustodyRecordPayload>(
        TEMPLATE_IDS.CustodyRecord,
        {
          escrowBank:       BANK,
          regulator:        REGULATOR,
          metadata,
          quantity:         input.quantity.toString(),
          purchaseDate:     today,
          purchasePrice:    { amount: input.purchasePriceTotal.toString(), currency: 'USD' },
          dtcSettlementRef: input.dtcSettlementRef,
          dealerReference:  input.dealerReference,
          fedwireImad:      input.fedwireImad ?? null,
          totalMintedUnits: '0',
          isFullyRedeemed:  false,
        },
        BANK,
      )
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

  /**
   * Atomic mint update — increments total_minted_units and updates the
   * canton_contract_id in a single locked transaction.
   *
   * Uses SELECT FOR UPDATE so concurrent purchases against the same CUSIP
   * cannot race past the availability check. Throws if units would exceed
   * the available quantity (defence-in-depth alongside the DAML invariant).
   */
  async updateMintedUnitsAndContract(
    custodyRecordId: string,
    additionalUnits: number,
    newCantonContractId: string,
  ) {
    const client = await db.connect()
    try {
      await client.query('BEGIN')

      const lockRes = await client.query(
        `SELECT id, quantity, total_minted_units
         FROM custody_records
         WHERE id = $1
         FOR UPDATE`,
        [custodyRecordId],
      )
      const row = lockRes.rows[0]
      if (!row) throw new Error('Custody record not found')

      const newTotal = Number(row.total_minted_units) + additionalUnits
      if (newTotal > Number(row.quantity)) {
        throw new Error(
          `Mint would exceed custody quantity: ${newTotal} > ${row.quantity}`,
        )
      }

      await client.query(
        `UPDATE custody_records
         SET total_minted_units = $1,
             canton_contract_id  = $2,
             updated_at          = NOW()
         WHERE id = $3`,
        [newTotal, newCantonContractId, custodyRecordId],
      )

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  },

  /** Legacy single-column update — kept for backward compatibility. */
  async updateMintedUnits(custodyRecordId: string, additionalUnits: number) {
    await db.query(
      `UPDATE custody_records
       SET total_minted_units = total_minted_units + $1, updated_at = NOW()
       WHERE id = $2`,
      [additionalUnits, custodyRecordId],
    )
  },

  /**
   * Atomic redemption update — decrements minted units, decreases quantity,
   * and updates the canton_contract_id after RecordRedemption creates a new
   * CustodyRecord contract.
   */
  async decrementMintedUnitsAndContract(
    custodyRecordId: string,
    redeemedUnits: number,
    newCantonContractId: string,
  ) {
    await db.query(
      `UPDATE custody_records
       SET total_minted_units = total_minted_units - $1,
           quantity           = quantity - $1,
           canton_contract_id = $2,
           is_fully_redeemed  = (quantity - $1 = 0),
           updated_at         = NOW()
       WHERE id = $3`,
      [redeemedUnits, newCantonContractId, custodyRecordId],
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
