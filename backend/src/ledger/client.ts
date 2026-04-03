// Canton HTTP JSON API client.
// The JSON API bridges the Canton gRPC Ledger API to HTTP REST.
// Start it with: daml json-api --ledger-host localhost --ledger-port 6865 --http-port 7575

import axios, { AxiosInstance } from 'axios'
import { config } from '../config'
import type { LedgerContract, LedgerCommandResult } from './types'

// Template IDs for our DAML package
export const TEMPLATE_IDS = {
  KYCInvitation:       'RWA.KYC:KYCInvitation',
  InvestorKYC:         'RWA.KYC:InvestorKYC',
  CustodyRecord:       'RWA.AssetCustody:CustodyRecord',
  EscrowRequest:       'RWA.EscrowRequest:EscrowRequest',
  ApprovedPurchase:    'RWA.EscrowRequest:ApprovedPurchase',
  RejectedRequest:     'RWA.EscrowRequest:RejectedRequest',
  TokenizedBond:       'RWA.TokenizedBond:TokenizedBond',
  RedemptionRequest:   'RWA.TokenizedBond:RedemptionRequest',
  CouponPaymentRecord: 'RWA.TokenizedBond:CouponPaymentRecord',
}

// Build an unsigned JWT for the Canton sandbox (no auth configured).
// In production, replace with a real JWT from your auth provider.
function makeSandboxToken(actAs: string[], readAs: string[] = []): string {
  const payload = {
    'https://daml.com/ledger-api': {
      actAs,
      readAs,
      applicationId: 'rwa-tokenization',
    },
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  // Unsigned token: header.payload.  (empty signature — accepted by Canton sandbox)
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
  return `${header}.${encoded}.`
}

class LedgerClient {
  private http: AxiosInstance

  constructor() {
    this.http = axios.create({
      baseURL: config.canton.jsonApiUrl,
      timeout: 30_000,
    })
  }

  // Returns an axios instance pre-configured with the given actAs parties
  private forParty(actAs: string | string[], readAs: string[] = []) {
    const parties = Array.isArray(actAs) ? actAs : [actAs]
    const token = makeSandboxToken(parties, readAs)
    return {
      headers: { Authorization: `Bearer ${token}` },
    }
  }

  // ── Create a contract ────────────────────────────────────────────────────

  async create<T>(
    templateId: string,
    payload: Record<string, unknown>,
    actAs: string | string[],
  ): Promise<LedgerContract<T>> {
    const res = await this.http.post(
      '/v1/create',
      { templateId, payload },
      this.forParty(actAs),
    )
    if (res.data.status !== 200) {
      throw new Error(`Ledger create failed: ${JSON.stringify(res.data.errors)}`)
    }
    return res.data.result as LedgerContract<T>
  }

  // ── Exercise a choice ────────────────────────────────────────────────────

  async exercise(
    templateId: string,
    contractId: string,
    choice: string,
    argument: Record<string, unknown>,
    actAs: string | string[],
  ): Promise<LedgerCommandResult['result']> {
    const res = await this.http.post(
      '/v1/exercise',
      { templateId, contractId, choice, argument },
      this.forParty(actAs),
    )
    if (res.data.status !== 200) {
      throw new Error(`Ledger exercise failed on ${choice}: ${JSON.stringify(res.data.errors)}`)
    }
    return res.data.result
  }

  // ── Query contracts ──────────────────────────────────────────────────────

  async query<T>(
    templateIds: string[],
    query: Record<string, unknown> = {},
    readAs: string | string[] = config.canton.bankPartyId,
  ): Promise<LedgerContract<T>[]> {
    const parties = Array.isArray(readAs) ? readAs : [readAs]
    const token = makeSandboxToken([], parties)
    const res = await this.http.post(
      '/v1/query',
      { templateIds, query },
      { headers: { Authorization: `Bearer ${token}` } },
    )
    if (res.data.status !== 200) {
      throw new Error(`Ledger query failed: ${JSON.stringify(res.data.errors)}`)
    }
    return res.data.result as LedgerContract<T>[]
  }

  // ── Allocate a party (via Admin API — only for on-boarding new investors) ──
  // In production this would call the Canton Admin gRPC API.
  // For now, we return a deterministic mock party ID.
  async allocateParty(displayName: string): Promise<string> {
    try {
      const res = await this.http.post(
        '/v1/parties/allocate',
        { displayName, identifierHint: displayName },
        this.forParty(config.canton.bankPartyId),
      )
      if (res.data.status === 200) {
        return res.data.result.identifier as string
      }
    } catch {
      // Fall through to mock
    }
    // Mock: generate a deterministic party ID for local development
    const hash = Buffer.from(displayName).toString('hex').slice(0, 40)
    return `${displayName}::122${hash}`
  }

  // ── Get latest ledger offset (for polling) ───────────────────────────────
  async getLatestOffset(): Promise<string> {
    try {
      const res = await this.http.get('/v1/ledger/end', this.forParty(config.canton.bankPartyId))
      return res.data.result?.offset ?? 'begin'
    } catch {
      return 'begin'
    }
  }
}

export const ledger = new LedgerClient()
