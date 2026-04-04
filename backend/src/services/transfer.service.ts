import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import { v4 as uuidv4 } from 'uuid'

const BANK = config.canton.bankPartyId

export const transferService = {

  // Full transfer of a holding to another investor
  async transferHolding(holdingId: string, fromInvestorId: string, toEmail: string) {
    const holdingResult = await db.query(
      `SELECT h.*, i.canton_party_id AS owner_party_id
       FROM holdings h JOIN investors i ON i.id = h.investor_id
       WHERE h.id = $1 AND h.investor_id = $2 AND h.status = 'active'`,
      [holdingId, fromInvestorId],
    )
    const holding = holdingResult.rows[0]
    if (!holding) throw new Error('Holding not found or already transferred')

    const toInvestorResult = await db.query(
      `SELECT i.* FROM investors i JOIN users u ON u.id = i.user_id WHERE u.email = $1`,
      [toEmail],
    )
    const toInvestor = toInvestorResult.rows[0]
    if (!toInvestor) throw new Error(`No investor found with email: ${toEmail}`)
    if (toInvestor.id === fromInvestorId) throw new Error('Cannot transfer to yourself')

    const toKyc = await db.query(
      `SELECT status, expiry_date FROM kyc_records WHERE investor_id = $1`,
      [toInvestor.id],
    )
    if (toKyc.rows[0]?.status !== 'approved') {
      throw new Error('Recipient must have approved KYC to receive bonds')
    }
    if (toKyc.rows[0]?.expiry_date && new Date(toKyc.rows[0].expiry_date) < new Date()) {
      throw new Error('Recipient KYC has expired')
    }

    const transferRef = `TRANSFER-${uuidv4().slice(0, 8).toUpperCase()}`
    let newContractId = `mock-bond-${uuidv4()}`

    try {
      const result = await ledger.exercise(
        TEMPLATE_IDS.TokenizedBond,
        holding.canton_contract_id,
        'TransferOwnership',
        { newOwner: toInvestor.canton_party_id, transferRef },
        [BANK, holding.owner_party_id],
      )
      newContractId = result.contractId ?? newContractId
    } catch (err) {
      if (config.canton.strict) throw err
      console.warn('[Transfer] Canton transfer failed:', err)
    }

    await db.query(
      `UPDATE holdings SET status = 'transferred', updated_at = NOW() WHERE id = $1`,
      [holdingId],
    )

    const newHoldingResult = await db.query(
      `INSERT INTO holdings
         (canton_contract_id, investor_id, custody_record_id, cusip, units,
          mint_date, dtc_settlement_ref, transfer_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING *`,
      [
        newContractId, toInvestor.id, holding.custody_record_id,
        holding.cusip, holding.units, holding.mint_date,
        holding.dtc_settlement_ref,
        JSON.stringify([...(holding.transfer_history ?? []), transferRef]),
      ],
    )

    await db.query(
      `INSERT INTO transfers
         (source_holding_id, from_investor_id, to_investor_id, units, transfer_ref, new_holding_id)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [holdingId, fromInvestorId, toInvestor.id, holding.units, transferRef, newHoldingResult.rows[0].id],
    )

    return newHoldingResult.rows[0]
  },

  // Split transfer: send part of a holding to another investor
  async splitTransfer(
    holdingId: string,
    fromInvestorId: string,
    toEmail: string,
    transferUnits: number,
  ) {
    const holdingResult = await db.query(
      `SELECT h.*, i.canton_party_id AS owner_party_id
       FROM holdings h JOIN investors i ON i.id = h.investor_id
       WHERE h.id = $1 AND h.investor_id = $2 AND h.status = 'active'`,
      [holdingId, fromInvestorId],
    )
    const holding = holdingResult.rows[0]
    if (!holding) throw new Error('Holding not found or already transferred')
    if (transferUnits >= Number(holding.units)) {
      throw new Error('Transfer units must be less than total. Use full transfer instead.')
    }
    if (transferUnits <= 0) throw new Error('Transfer units must be positive')

    const toInvestorResult = await db.query(
      `SELECT i.* FROM investors i JOIN users u ON u.id = i.user_id WHERE u.email = $1`,
      [toEmail],
    )
    const toInvestor = toInvestorResult.rows[0]
    if (!toInvestor) throw new Error(`No investor found with email: ${toEmail}`)

    const toKyc = await db.query(
      `SELECT status, expiry_date FROM kyc_records WHERE investor_id = $1`,
      [toInvestor.id],
    )
    if (toKyc.rows[0]?.status !== 'approved') {
      throw new Error('Recipient must have approved KYC to receive bonds')
    }
    if (toKyc.rows[0]?.expiry_date && new Date(toKyc.rows[0].expiry_date) < new Date()) {
      throw new Error('Recipient KYC has expired')
    }

    const transferRef     = `SPLIT-${uuidv4().slice(0, 8).toUpperCase()}`
    let remainderContractId  = `mock-bond-${uuidv4()}`
    let transferredContractId = `mock-bond-${uuidv4()}`

    try {
      const result = await ledger.exercise(
        TEMPLATE_IDS.TokenizedBond,
        holding.canton_contract_id,
        'SplitTransfer',
        {
          newOwner:      toInvestor.canton_party_id,
          transferUnits: transferUnits.toString(),
          transferRef,
        },
        [BANK, holding.owner_party_id],
      )
      // SplitTransfer returns (ContractId TokenizedBond, ContractId TokenizedBond)
      // Both created contracts appear as CreatedEvents in the transaction
      if (result.contractIds && result.contractIds.length >= 2) {
        ;[remainderContractId, transferredContractId] = result.contractIds
      } else if (result.contractId) {
        transferredContractId = result.contractId
      }
    } catch (err) {
      if (config.canton.strict) throw err
      console.warn('[Transfer] Canton split failed:', err)
    }

    await db.query(
      `UPDATE holdings SET status = 'transferred', updated_at = NOW() WHERE id = $1`,
      [holdingId],
    )

    const remainderUnits = Number(holding.units) - transferUnits

    const remainderResult = await db.query(
      `INSERT INTO holdings
         (canton_contract_id, investor_id, custody_record_id, cusip, units,
          mint_date, dtc_settlement_ref, transfer_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        remainderContractId, fromInvestorId, holding.custody_record_id,
        holding.cusip, remainderUnits, holding.mint_date,
        holding.dtc_settlement_ref, JSON.stringify(holding.transfer_history ?? []),
      ],
    )

    const transferredResult = await db.query(
      `INSERT INTO holdings
         (canton_contract_id, investor_id, custody_record_id, cusip, units,
          mint_date, dtc_settlement_ref, transfer_history)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        transferredContractId, toInvestor.id, holding.custody_record_id,
        holding.cusip, transferUnits, holding.mint_date,
        holding.dtc_settlement_ref,
        JSON.stringify([...(holding.transfer_history ?? []), transferRef]),
      ],
    )

    await db.query(
      `INSERT INTO transfers
         (source_holding_id, from_investor_id, to_investor_id, units, transfer_ref,
          is_split, new_holding_id, remainder_holding_id)
       VALUES ($1,$2,$3,$4,$5,true,$6,$7)`,
      [
        holdingId, fromInvestorId, toInvestor.id, transferUnits, transferRef,
        transferredResult.rows[0].id, remainderResult.rows[0].id,
      ],
    )

    return { remainder: remainderResult.rows[0], transferred: transferredResult.rows[0] }
  },

  async getHoldingsByInvestor(investorId: string) {
    const result = await db.query(
      `SELECT h.*, cr.issuer_name, cr.coupon_rate, cr.maturity_date, cr.face_value, cr.coupon_freq
       FROM holdings h
       JOIN custody_records cr ON cr.id = h.custody_record_id
       WHERE h.investor_id = $1 AND h.status = 'active'
       ORDER BY h.created_at DESC`,
      [investorId],
    )
    return result.rows
  },
}
