/**
 * Canton HTTP JSON API v2 Client
 *
 * Talks to the Canton participant node via its built-in JSON API (started with
 * `daml sandbox --json-api-port 7575` or `canton daemon` with `http-api` block).
 *
 * ## API format (Canton 3.4.10 / SDK 3.4.10)
 *
 * ### Submit a command
 *   POST /v2/commands/submit-and-wait-for-transaction
 *   Body: { commands: JsCommands }
 *
 *   JsCommands:
 *     { commandId, userId, actAs: string[], commands: JsCommand[] }
 *
 *   JsCommand discriminated union (class name as key):
 *     { "CreateCommand":   { templateId: string, createArguments: object } }
 *     { "ExerciseCommand": { templateId: string, contractId: string,
 *                            choice: string, choiceArgument: object } }
 *     { "ExerciseByKeyCommand": { templateId, contractKey, choice, choiceArgument } }
 *
 *   templateId format: "#<package-name>:<ModuleName>:<EntityName>"
 *   e.g. "#rwa-tokenization:RWA.KYC:KYCInvitation"
 *
 *   createArguments / choiceArgument: DAML LF JSON encoding
 *     - Party   → string (full party ID)
 *     - Text    → string
 *     - Numeric → string ("100.0")
 *     - Bool    → boolean
 *     - Date    → ISO date string ("2026-04-02")
 *     - Optional None → null
 *     - Optional Some(x) → x  (unwrapped)
 *     - List    → JSON array
 *     - Record  → JSON object  { fieldName: value, ... }
 *     - Enum    → string constructor  ("KYCPending")
 *     - Variant → { "tag": "Constructor", "value": <arg> }
 *
 * ### Query active contracts
 *   POST /v2/state/active-contracts
 *   Body: { activeAtOffset: number, eventFormat: EventFormat }
 *
 *   EventFormat:
 *     { filtersByParty: { [partyId]: Filters }, verbose: bool }
 *
 *   Filters:
 *     { cumulative: [CumulativeFilter] }
 *
 *   CumulativeFilter (discriminated union — oneof name as key, PascalCase type name as inner key):
 *     { identifierFilter: { "WildcardFilter":  { value: { includeCreatedEventBlob: bool } } } }
 *     { identifierFilter: { "TemplateFilter":  { value: { templateId: string,
 *                                                         includeCreatedEventBlob: bool } } } }
 *     { identifierFilter: { "InterfaceFilter": { value: { interfaceId: string,
 *                                                         includeInterfaceView: bool,
 *                                                         includeCreatedEventBlob: bool } } } }
 *
 * ### Ledger offset
 *   GET /v2/state/ledger-end  →  { offset: number }
 *
 * ## Known limitations
 *   - Canton sandbox on JDK 24 fails transaction submission with
 *     "JCE cannot authenticate provider BC" (BouncyCastle / JDK 24 incompatibility).
 *     Use JDK 17 or JDK 21 in production.
 *   - All service callers wrap ledger calls in try/catch and fall back to mock IDs.
 */

import axios, { AxiosInstance, AxiosError } from 'axios'
import { v4 as uuidv4 } from 'uuid'
import { config } from '../config'
import type { LedgerContract, LedgerExerciseResult } from './types'

// ── Template IDs ─────────────────────────────────────────────────────────────
// Format: "#<daml.yaml name>:<DAML module>:<Template>"
const PKG = '#rwa-tokenization'

export const TEMPLATE_IDS = {
  KYCInvitation:       `${PKG}:RWA.KYC:KYCInvitation`,
  InvestorKYC:         `${PKG}:RWA.KYC:InvestorKYC`,
  CustodyRecord:       `${PKG}:RWA.AssetCustody:CustodyRecord`,
  EscrowRequest:       `${PKG}:RWA.EscrowRequest:EscrowRequest`,
  ApprovedPurchase:    `${PKG}:RWA.EscrowRequest:ApprovedPurchase`,
  RejectedRequest:     `${PKG}:RWA.EscrowRequest:RejectedRequest`,
  TokenizedBond:       `${PKG}:RWA.TokenizedBond:TokenizedBond`,
  RedemptionRequest:   `${PKG}:RWA.TokenizedBond:RedemptionRequest`,
  CouponPaymentRecord: `${PKG}:RWA.TokenizedBond:CouponPaymentRecord`,
}

// ── JWT helpers ───────────────────────────────────────────────────────────────

/**
 * Build an unsigned sandbox JWT for read operations (query, ledger-end, parties).
 * These endpoints accept the legacy `https://daml.com/ledger-api` claim format.
 *
 * For submit operations, a `userId` must be supplied in the Commands body instead
 * (the legacy token format cannot convey a user ID for the v2 submit endpoints).
 */
function makeSandboxToken(actAs: string[], readAs: string[] = []): string {
  const header  = b64url({ alg: 'none', typ: 'JWT' })
  const payload = b64url({
    'https://daml.com/ledger-api': {
      actAs,
      readAs,
      applicationId: 'rwa-tokenization',
    },
  })
  return `${header}.${payload}.`
}

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString('base64url')
}

// ── V2 response shapes ────────────────────────────────────────────────────────

interface V2CreatedEvent {
  contractId: string
  templateId: string
  createArgument?: Record<string, unknown>   // DAML LF JSON; note: singular in v2
  witnessParties?: string[]
  signatories?: string[]
  observers?: string[]
  packageName?: string
}

interface V2TransactionResponse {
  transaction: {
    updateId: string
    commandId: string
    events: Array<
      | { CreatedEvent: V2CreatedEvent }
      | { ArchivedEvent: { contractId: string; templateId: string } }
      | { ExercisedEvent: unknown }
    >
    offset: number
  }
}

interface V2ActiveContractEntry {
  workflowId?: string
  contractEntry?: {
    JsActiveContract?: {
      createdEvent: V2CreatedEvent
      synchronizerId?: string
    }
  }
}

// ── Main client ───────────────────────────────────────────────────────────────

class LedgerClient {
  private http: AxiosInstance
  private ledgerEnd = 0   // cached; refreshed before each query

  constructor() {
    this.http = axios.create({
      baseURL: config.canton.jsonApiUrl,
      timeout: 30_000,
    })
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private authHeader(actAs: string | string[], readAs: string[] = []) {
    const parties = Array.isArray(actAs) ? actAs : [actAs]
    return { Authorization: `Bearer ${makeSandboxToken(parties, readAs)}` }
  }

  /** Unique, idempotent command ID. Callers may pass their own for retries. */
  private cmdId(prefix = 'cmd') {
    return `${prefix}-${uuidv4()}`
  }

  /**
   * Extract the first created contract from a v2 transaction response.
   * Returns the contractId and its payload (createArgument).
   */
  private extractCreated(tx: V2TransactionResponse): {
    contractId: string
    payload: Record<string, unknown>
  } | null {
    for (const ev of tx.transaction.events) {
      if ('CreatedEvent' in ev) {
        return {
          contractId: ev.CreatedEvent.contractId,
          payload: ev.CreatedEvent.createArgument ?? {},
        }
      }
    }
    return null
  }

  /** Extract all created contractIds from a transaction (for split transfers). */
  private extractAllCreated(tx: V2TransactionResponse): string[] {
    return tx.transaction.events
      .filter((ev): ev is { CreatedEvent: V2CreatedEvent } => 'CreatedEvent' in ev)
      .map(ev => ev.CreatedEvent.contractId)
  }

  // ── Submit a create command ──────────────────────────────────────────────────

  /**
   * Create a new DAML contract.
   *
   * @param templateId  One of TEMPLATE_IDS values.
   * @param payload     DAML LF JSON object matching the template's fields.
   *                    Party fields must be full party IDs.
   *                    Numeric fields must be strings.
   *                    Date fields must be ISO strings ("YYYY-MM-DD").
   * @param actAs       Party or parties acting for this command.
   * @param commandId   Optional idempotency key; generated if omitted.
   */
  async create<T>(
    templateId: string,
    payload: Record<string, unknown>,
    actAs: string | string[],
    commandId?: string,
  ): Promise<LedgerContract<T>> {
    const parties = Array.isArray(actAs) ? actAs : [actAs]

    const body = {
      commands: {
        commandId: commandId ?? this.cmdId('create'),
        userId: config.canton.bankUserId,
        actAs: parties,
        commands: [{
          CreateCommand: {
            templateId,
            createArguments: payload,
          },
        }],
      },
    }

    const res = await this.http.post<V2TransactionResponse>(
      '/v2/commands/submit-and-wait-for-transaction',
      body,
      { headers: this.authHeader(parties) },
    )

    const created = this.extractCreated(res.data)
    if (!created) {
      throw new Error(`Create of ${templateId} returned no CreatedEvent in transaction`)
    }

    return {
      templateId,
      contractId: created.contractId,
      payload:    created.payload as T,
    }
  }

  // ── Submit an exercise command ───────────────────────────────────────────────

  /**
   * Exercise a choice on an existing contract.
   *
   * @param templateId  Template ID of the contract being exercised.
   * @param contractId  The contract's ledger ID.
   * @param choice      DAML choice name (e.g. "ApproveKYC").
   * @param argument    DAML LF JSON argument object ({} for unit choices).
   * @param actAs       Party or parties acting for this command.
   * @param commandId   Optional idempotency key.
   */
  async exercise(
    templateId: string,
    contractId: string,
    choice: string,
    argument: Record<string, unknown>,
    actAs: string | string[],
    commandId?: string,
  ): Promise<LedgerExerciseResult> {
    const parties = Array.isArray(actAs) ? actAs : [actAs]

    const body = {
      commands: {
        commandId: commandId ?? this.cmdId(`ex-${choice}`),
        userId: config.canton.bankUserId,
        actAs: parties,
        commands: [{
          ExerciseCommand: {
            templateId,
            contractId,
            choice,
            choiceArgument: argument,
          },
        }],
      },
    }

    const res = await this.http.post<V2TransactionResponse>(
      '/v2/commands/submit-and-wait-for-transaction',
      body,
      { headers: this.authHeader(parties) },
    )

    const created = this.extractAllCreated(res.data)
    return {
      contractId:    created[0],
      contractIds:   created,
      exerciseResult: res.data.transaction,
    }
  }

  // ── Query active contracts ───────────────────────────────────────────────────

  /**
   * Fetch all active contracts of the given template visible to `readAs` party.
   *
   * The `query` parameter is a client-side filter applied after fetching —
   * the Canton v2 API does not support field-level server-side filtering.
   *
   * @param templateIds    List of template IDs to filter by.
   * @param _query         (Unused in v2; kept for API compatibility)
   * @param readAs         Party whose visibility determines which contracts are returned.
   */
  async query<T>(
    templateIds: string[],
    _query: Record<string, unknown> = {},
    readAs: string | string[] = config.canton.bankPartyId,
  ): Promise<LedgerContract<T>[]> {
    const parties = Array.isArray(readAs) ? readAs : [readAs]

    // Get the current ledger end to anchor the snapshot
    const offsetRes = await this.http.get<{ offset: number }>(
      '/v2/state/ledger-end',
      { headers: this.authHeader(parties) },
    )
    const activeAtOffset = offsetRes.data.offset

    // Build per-template cumulative filters
    const cumulativeFilters = templateIds.map(templateId => ({
      identifierFilter: {
        TemplateFilter: {
          value: { templateId, includeCreatedEventBlob: false },
        },
      },
    }))

    // Build filtersByParty for each reading party
    const filtersByParty: Record<string, unknown> = {}
    for (const party of parties) {
      filtersByParty[party] = { cumulative: cumulativeFilters }
    }

    const body = {
      activeAtOffset,
      eventFormat: {
        filtersByParty,
        verbose: true,
      },
    }

    const res = await this.http.post<V2ActiveContractEntry[]>(
      '/v2/state/active-contracts',
      body,
      { headers: this.authHeader(parties) },
    )

    // Parse the streaming response (returned as JSON array)
    const entries: V2ActiveContractEntry[] = Array.isArray(res.data) ? res.data : []

    return entries
      .filter(e => e.contractEntry?.JsActiveContract != null)
      .map(e => {
        const ev = e.contractEntry!.JsActiveContract!.createdEvent
        return {
          templateId: ev.templateId,
          contractId: ev.contractId,
          payload:    (ev.createArgument ?? {}) as T,
        }
      })
  }

  /**
   * Query active contracts visible to a specific party (e.g. an investor).
   * Useful for privacy-respecting reads where the bank should not read investor data.
   */
  async queryAs<T>(
    templateIds: string[],
    actAsParty: string,
  ): Promise<LedgerContract<T>[]> {
    return this.query<T>(templateIds, {}, actAsParty)
  }

  // ── Party management ─────────────────────────────────────────────────────────

  /**
   * Allocate a new Canton party.
   * In production this requires participant-admin rights.
   * Falls back to a deterministic mock party ID if the API is unavailable.
   */
  async allocateParty(displayName: string): Promise<string> {
    try {
      // v2 localMetadata requires resourceVersion="" (empty string, not "0") on create
      const res = await this.http.post<{ partyDetails: { party: string } }>(
        '/v2/parties',
        {
          partyIdHint: displayName.replace(/\s+/g, ''),
          localMetadata: { resourceVersion: '' },
        },
        { headers: this.authHeader(config.canton.bankPartyId) },
      )
      const partyId = res.data.partyDetails.party

      // Grant bank-app user CanActAs rights for this party so the bank can act
      // on behalf of investors (custodial model — bank submits on investor's behalf).
      await this.grantActAsRights(partyId)

      return partyId
    } catch (err) {
      const ae = err as AxiosError
      console.warn(
        `[Ledger] allocateParty(${displayName}) failed (${ae.message}), using mock ID`,
      )
    }

    // Deterministic mock: stable across restarts, usable for local dev
    const hash = Buffer.from(displayName).toString('hex').slice(0, 40)
    return `${displayName.replace(/\s+/g, '')}::122${hash}`
  }

  /**
   * Grant bank-app user CanActAs rights for a party.
   * Required for Canton v2 submit endpoints which validate userId ↔ actAs rights.
   * Called automatically by allocateParty for every new investor party.
   *
   * v2 user rights body shape (discovered by live testing):
   *   { userId, identityProviderId, rights: [{ kind: { CanActAs: { value: { party } } } }] }
   */
  async grantActAsRights(partyId: string): Promise<void> {
    try {
      await this.http.post(
        `/v2/users/${config.canton.bankUserId}/rights`,
        {
          userId:             config.canton.bankUserId,
          identityProviderId: '',
          rights: [{ kind: { CanActAs: { value: { party: partyId } } } }],
        },
        { headers: this.authHeader(config.canton.bankPartyId) },
      )
    } catch (err) {
      const ae = err as AxiosError
      console.warn(`[Ledger] grantActAsRights(${partyId}) failed (${ae.message})`)
    }
  }

  // ── Ledger state ─────────────────────────────────────────────────────────────

  /** Returns the current ledger end offset (used to anchor ACS snapshots). */
  async getLedgerEnd(): Promise<number> {
    try {
      const res = await this.http.get<{ offset: number }>(
        '/v2/state/ledger-end',
        { headers: this.authHeader(config.canton.bankPartyId) },
      )
      this.ledgerEnd = res.data.offset
      return this.ledgerEnd
    } catch {
      return 0
    }
  }
}

export const ledger = new LedgerClient()
