// KYC Service — investor identity verification and Canton party onboarding.
//
// This service bridges three systems: the PostgreSQL investor database,
// the Canton ledger (for on-ledger KYCInvitation and InvestorKYC contracts),
// and the off-chain identity verification providers (Jumio, OFAC API).
//
// Why allocate a Canton party for every investor?
// Canton's privacy model requires that every party who appears as an observer
// or controller in a DAML contract must be a real allocated Canton party with
// a cryptographic key. A string "investor@email.com" is not a Canton party.
// allocateParty() calls the Canton Admin API to generate a Party ID (e.g.
// "Investor-AliceSmith::122059...") that is used in all subsequent DAML contracts.
//
// On-ledger vs. off-chain state:
// PostgreSQL is the source of truth for the admin portal (fast queries, no Canton
// API round-trips). The Canton ledger is the source of truth for authorization
// (which party can exercise which choice). Both are kept in sync: Canton events
// are projected into PostgreSQL, and all Canton interactions are reflected back.
//
// Compliance flow:
//   1. Investor registers → Canton party allocated → KYCInvitation created on ledger
//   2. Jumio identity check + OFAC sanctions screening run asynchronously
//   3. If cleared: InvestorKYC contract created on ledger (status = KYCPending)
//   4. Bank admin reviews Jumio/OFAC references in the admin portal and approves
//   5. approveKYC exercises InvestorKYC.ApproveKYC → status = KYCApproved on ledger
//   After step 5, the investor can submit purchase requests and receive transfers.
//
// Regulatory note: the kycProviderRef stored in InvestorKYC links the on-ledger
// compliance record to the off-chain Jumio record where the primary evidence
// (ID documents, liveness check, OFAC match results) is retained.
//
// Flow:
//   1. Investor registers → KYC record created with status 'registered'
//   2. Bank creates KYCInvitation on Canton (bank + regulator see it)
//   3. System auto-accepts on behalf of investor (triggers off-chain verification)
//   4. Jumio/OFAC mock runs
//   5. If passed: bank creates InvestorKYC on Canton, status → 'pending_approval'
//   6. Bank admin approves: status → 'approved'

import { db } from '../db/client'
import { ledger, TEMPLATE_IDS } from '../ledger/client'
import { config } from '../config'
import { runKYCVerification, runOFACScreening } from '../mock/jumio'
import type { InvestorKYCPayload } from '../ledger/types'

const BANK      = config.canton.bankPartyId
const REGULATOR = config.canton.regulatorPartyId

export const kycService = {

  // Called when investor registers. Creates the KYC record and triggers verification.
  async initiateKYC(investorId: string): Promise<void> {
    const investor = await db.query(
      `SELECT i.*, u.email FROM investors i JOIN users u ON u.id = i.user_id WHERE i.id = $1`,
      [investorId],
    )
    if (!investor.rows[0]) throw new Error('Investor not found')

    const inv = investor.rows[0]

    // Allocate a Canton party for this investor if not already done
    if (!inv.canton_party_id) {
      const partyId = await ledger.allocateParty(`Investor-${inv.full_name.replace(/\s+/g, '')}`)
      await db.query(`UPDATE investors SET canton_party_id = $1 WHERE id = $2`, [partyId, investorId])
      inv.canton_party_id = partyId
    }

    // Create KYCInvitation on Canton (bank signs, regulator observes)
    const today = new Date().toISOString().slice(0, 10)
    let invitationContractId: string | null = null
    try {
      const invitation = await ledger.create(
        TEMPLATE_IDS.KYCInvitation,
        {
          investor:    inv.canton_party_id,
          escrowBank:  BANK,
          regulator:   REGULATOR,
          invitedDate: today,
        },
        BANK,
      )
      invitationContractId = invitation.contractId

      // Auto-accept on behalf of investor (they authorized this at registration)
      await ledger.exercise(
        TEMPLATE_IDS.KYCInvitation,
        invitation.contractId,
        'AcceptKYCInvitation',
        {},
        inv.canton_party_id,
      )
    } catch (err) {
      console.warn('[KYC] Canton unavailable, continuing with off-chain KYC only:', err)
    }

    await db.query(
      `UPDATE kyc_records SET status = 'accepted', invitation_contract_id = $1, updated_at = NOW()
       WHERE investor_id = $2`,
      [invitationContractId, investorId],
    )

    // Run off-chain identity verification asynchronously
    this.runOffChainVerification(investorId, inv).catch((err) =>
      console.error('[KYC] Off-chain verification error:', err),
    )
  },

  async runOffChainVerification(investorId: string, inv: Record<string, string>): Promise<void> {
    const [jumioResult, ofacResult] = await Promise.all([
      runKYCVerification(inv.full_name, inv.jurisdiction),
      runOFACScreening(inv.full_name),
    ])

    if (!jumioResult.identityVerified || !ofacResult.cleared) {
      await db.query(
        `UPDATE kyc_records
         SET status = 'rejected', rejection_reason = $1, jumio_reference = $2, updated_at = NOW()
         WHERE investor_id = $3`,
        [
          jumioResult.rejectionReason ?? 'Sanctions screening failed',
          jumioResult.reference,
          investorId,
        ],
      )
      return
    }

    const today      = new Date().toISOString().slice(0, 10)
    const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // Create InvestorKYC on Canton (bank is signatory, investor + regulator are observers)
    let kycContractId: string | null = null
    try {
      const investorRow = await db.query(
        `SELECT canton_party_id FROM investors WHERE id = $1`,
        [investorId],
      )
      const partyId = investorRow.rows[0]?.canton_party_id

      if (partyId) {
        const kycContract = await ledger.create<InvestorKYCPayload>(
          TEMPLATE_IDS.InvestorKYC,
          {
            investor:          partyId,
            escrowBank:        BANK,
            regulator:         REGULATOR,
            fullName:          inv.full_name,
            jurisdiction:      inv.jurisdiction,
            accreditation:     inv.accreditation_level ?? 'Accredited',
            isAccredited:      true,
            amlCleared:        true,
            sanctionsCleared:  true,
            status:            'KYCPending',
            approvalDate:      today,
            expiryDate,
            kycProviderRef:    jumioResult.reference,
            lastScreeningDate: today,
          },
          BANK,
        )
        kycContractId = kycContract.contractId
      }
    } catch (err) {
      console.warn('[KYC] Canton unavailable, KYC contract not created:', err)
    }

    await db.query(
      `UPDATE kyc_records
       SET status = 'pending_approval',
           kyc_contract_id = $1,
           jumio_reference = $2,
           ofac_reference = $3,
           approval_date = $4,
           expiry_date = $5,
           last_screening_date = $4,
           kyc_provider_ref = $2,
           updated_at = NOW()
       WHERE investor_id = $6`,
      [kycContractId, jumioResult.reference, ofacResult.reference, today, expiryDate, investorId],
    )
  },

  // Bank admin approves a KYC record
  async approveKYC(investorId: string): Promise<void> {
    const result = await db.query(
      `SELECT k.*, i.canton_party_id FROM kyc_records k
       JOIN investors i ON i.id = k.investor_id
       WHERE k.investor_id = $1`,
      [investorId],
    )
    const kyc = result.rows[0]
    if (!kyc) throw new Error('KYC record not found')
    if (kyc.status !== 'pending_approval') throw new Error(`Cannot approve KYC with status: ${kyc.status}`)

    if (kyc.kyc_contract_id) {
      try {
        await ledger.exercise(TEMPLATE_IDS.InvestorKYC, kyc.kyc_contract_id, 'ApproveKYC', {}, BANK)
      } catch (err) {
        console.warn('[KYC] Canton approve failed, continuing:', err)
      }
    }

    await db.query(
      `UPDATE kyc_records SET status = 'approved', updated_at = NOW() WHERE investor_id = $1`,
      [investorId],
    )
  },

  // Bank admin rejects a KYC record
  async rejectKYC(investorId: string, reason: string): Promise<void> {
    await db.query(
      `UPDATE kyc_records
       SET status = 'rejected', rejection_reason = $1, updated_at = NOW()
       WHERE investor_id = $2`,
      [reason, investorId],
    )
  },

  // Get KYC status for an investor
  async getKYCStatus(investorId: string) {
    const result = await db.query(
      `SELECT k.*, i.full_name FROM kyc_records k
       JOIN investors i ON i.id = k.investor_id
       WHERE k.investor_id = $1`,
      [investorId],
    )
    return result.rows[0] ?? null
  },

  // Get all pending KYC records (for bank admin dashboard)
  async getPendingKYC() {
    const result = await db.query(
      `SELECT k.*, i.full_name, i.jurisdiction, i.accreditation_level, u.email
       FROM kyc_records k
       JOIN investors i ON i.id = k.investor_id
       JOIN users u ON u.id = i.user_id
       WHERE k.status = 'pending_approval'
       ORDER BY k.updated_at ASC`,
    )
    return result.rows
  },
}
