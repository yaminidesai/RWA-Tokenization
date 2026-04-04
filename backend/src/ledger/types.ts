/**
 * TypeScript types for DAML contract payloads and Canton v2 API response shapes.
 *
 * ## DAML LF JSON encoding rules (Canton v2 HTTP JSON API)
 *   - Party   → string  (full party ID, e.g. "EscrowBank::1220...")
 *   - Text    → string
 *   - Numeric → string  (e.g. "100.0")
 *   - Bool    → boolean
 *   - Date    → string  (ISO format "YYYY-MM-DD")
 *   - Optional None → null
 *   - Optional Some(x) → x  (the value itself, unwrapped)
 *   - List    → array
 *   - Record  → object  { fieldName: value }
 *   - Enum    → string  (constructor name, e.g. "KYCPending")
 */

// ── Shared DAML types ─────────────────────────────────────────────────────────

export interface MonetaryAmount {
  amount: string       // Numeric as string ("100.0")
  currency: string     // ISO 4217 ("USD")
}

export interface BondMetadata {
  cusip: string
  isin: string
  issuerName: string
  assetClass: string
  treasuryType: string | null    // Optional Some → string, None → null
  faceValue: string              // Numeric as string
  couponRate: string             // Numeric as string
  couponFreq: string             // "Semiannual" | "Quarterly" | "Annual" | "Monthly"
  maturityDate: string           // ISO date "YYYY-MM-DD"
  issuanceDate: string           // ISO date "YYYY-MM-DD"
  regExemption: string
}

// ── Canton v2 API response shapes ────────────────────────────────────────────

/**
 * Represents a single active contract on the ledger.
 * Returned by ledger.create() and ledger.query().
 */
export interface LedgerContract<T> {
  templateId: string   // Full template ID with package
  contractId: string   // Canton contract ID (unique ledger reference)
  payload: T           // DAML LF JSON payload (the contract's fields)
}

/**
 * Result of exercising a DAML choice.
 * For consuming choices, contractId is the newly created contract (if any).
 * For split choices (SplitTransfer), contractIds contains both new contracts.
 */
export interface LedgerExerciseResult {
  contractId?: string     // First created contract (for consuming→creating choices)
  contractIds?: string[]  // All created contracts (for split operations)
  exerciseResult?: unknown
}

/**
 * A single command in a batch submit — either a create or an exercise.
 * Used with ledger.submitBatch() to compose multiple DAML operations into
 * one atomic Canton transaction.
 */
export type BatchCommand =
  | {
      type: 'create'
      templateId: string
      payload: Record<string, unknown>
    }
  | {
      type: 'exercise'
      templateId: string
      contractId: string
      choice: string
      argument: Record<string, unknown>
    }

/**
 * Result of an atomic batch submit.
 * createdByTemplate maps the last segment of the template ID (e.g. "TokenizedBond")
 * to the contract ID of the first contract created with that template name.
 * This is deterministic because DAML processes commands in order.
 */
export interface BatchResult {
  allCreatedIds: string[]
  createdByTemplate: Record<string, string>
}

// ── DAML Contract Payload Types ───────────────────────────────────────────────
// These mirror the DAML template field types exactly.
// All parties are full party IDs; all Numeric fields are strings.

export interface KYCInvitationPayload {
  investor: string
  escrowBank: string
  regulator: string
  invitedDate: string
}

export interface InvestorKYCPayload {
  investor: string
  escrowBank: string
  regulator: string
  fullName: string
  jurisdiction: string
  accreditation: string
  isAccredited: boolean
  amlCleared: boolean
  sanctionsCleared: boolean
  status: string           // "KYCPending" | "KYCApproved"
  approvalDate: string
  expiryDate: string
  kycProviderRef: string
  lastScreeningDate: string
}

export interface CustodyRecordPayload {
  escrowBank: string
  regulator: string
  metadata: BondMetadata
  quantity: string
  purchaseDate: string
  purchasePrice: MonetaryAmount
  dtcSettlementRef: string
  dealerReference: string
  fedwireImad: string | null
  totalMintedUnits: string
  isFullyRedeemed: boolean
}

export interface EscrowRequestPayload {
  investor: string
  escrowBank: string
  regulator: string
  metadata: BondMetadata
  requestedUnits: string
  maxPurchasePrice: MonetaryAmount
  requestDate: string
  investorAccountRef: string
  notes: string
}

export interface ApprovedPurchasePayload {
  investor: string
  escrowBank: string
  regulator: string
  metadata: BondMetadata
  approvedUnits: string
  approvedMaxPrice: MonetaryAmount
  approvalDate: string
  investorAccountRef: string
}

export interface TokenizedBondPayload {
  escrowBank: string
  currentOwner: string
  regulator: string
  metadata: BondMetadata
  units: string
  mintDate: string
  custodyCusip: string
  dtcSettlementRef: string
  transferHistory: string[]
}

export interface RedemptionRequestPayload {
  investor: string
  escrowBank: string
  regulator: string
  metadata: BondMetadata
  units: string
  status: string    // "RedemptionRequested" | "RedemptionApproved" | "RedemptionRejected"
}

export interface CouponPaymentRecordPayload {
  escrowBank: string
  investor: string
  regulator: string
  metadata: BondMetadata
  units: string
  couponDate: string
  couponAmount: MonetaryAmount
  paymentRef: string
}
