---
name: No External Canton Participants
description: Bond Issuer (US Treasury) and Treasury Provider (primary dealer) are NOT Canton participants. The bank is the sole operational Canton actor. DTC/Fedwire/SWIFT interactions are purely off-chain.
type: feedback
---

Bond Issuer and Treasury Provider must NOT be modeled as Canton participant nodes or DAML parties. They exist entirely outside the Canton ecosystem on their own infrastructure (DTC, Fedwire, SWIFT).

**Why:** The US Treasury and primary dealers do not run Canton nodes. The bank holds T-bills/T-bonds/T-notes in its own DTC account and mints 1:1 tokens against its custody holdings. The previous architecture incorrectly made bondIssuer and treasuryProvider co-signatories on DAML contracts, which would require them to have Canton participant nodes and sign DAML transactions -- this is not how real-world Treasury bond custody works.

**How to apply:**
- Remove `bondIssuer` and `treasuryProvider` as DAML parties from all contracts
- Remove `custodian` party from AssetCustody (it referenced a non-existent Canton participant)
- The bank (escrowBank) is the sole signatory on custody records, token contracts, and all operational contracts
- DTC/Fedwire interactions are handled by the bank's off-chain services, with settlement references stored as Text fields on DAML contracts
- Only three Canton party types: escrowBank, investor, regulator
- Regulator may have a read-only participant node for audit; investors connect through bank's Ledger API or lightweight nodes
