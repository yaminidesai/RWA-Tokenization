// TypeScript types mirroring the DAML contracts.
// These are used when calling the Canton HTTP JSON API.

export interface MonetaryAmount {
  amount: string   // Decimal as string (Canton JSON API format)
  currency: string
}

export interface BondMetadata {
  cusip: string
  isin: string
  issuerName: string
  assetClass: string
  treasuryType: string | null
  faceValue: string
  couponRate: string
  couponFreq: string
  maturityDate: string   // ISO date YYYY-MM-DD
  issuanceDate: string
  regExemption: string
}

// ── Canton HTTP JSON API response shapes ─────────────────────────────────────

export interface LedgerContract<T> {
  templateId: string
  contractId: string
  payload: T
}

export interface LedgerQueryResult<T> {
  status: number
  result: LedgerContract<T>[]
}

export interface LedgerCommandResult {
  status: number
  result: {
    contractId?: string
    exerciseResult?: unknown
  }
}

// ── DAML Contract Payload Types ───────────────────────────────────────────────

export interface KYCInvitationPayload {
  investor: string
  escrowBank: string
  invitedDate: string
}

export interface InvestorKYCPayload {
  investor: string
  escrowBank: string
  fullName: string
  jurisdiction: string
  accreditation: string
  isAccredited: boolean
  amlCleared: boolean
  sanctionsCleared: boolean
  status: string
  approvalDate: string
  expiryDate: string
  kycProviderRef: string
  lastScreeningDate: string
}

export interface CustodyRecordPayload {
  escrowBank: string
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
  metadata: BondMetadata
  approvedUnits: string
  approvedMaxPrice: MonetaryAmount
  approvalDate: string
  investorAccountRef: string
}

export interface TokenizedBondPayload {
  escrowBank: string
  currentOwner: string
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
  metadata: BondMetadata
  units: string
  status: string
}

export interface CouponPaymentRecordPayload {
  escrowBank: string
  investor: string
  metadata: BondMetadata
  units: string
  couponDate: string
  couponAmount: MonetaryAmount
  paymentRef: string
}
