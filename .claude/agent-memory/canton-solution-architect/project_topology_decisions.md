---
name: Canton Topology Architecture Decisions
description: Key decisions on simplified Canton topology -- bank-only participant model, no Bond Issuer or Treasury Provider as Canton parties; signatory model implications
type: project
---

The Canton topology was simplified from the original 4-participant design (bank, bond issuer, treasury provider, regulator) to a 2-participant model (bank + optional regulator). Bond Issuer (US Treasury) and Treasury Provider (DTC/primary dealers) are entirely external, interacting only via SWIFT/DTC/Fedwire off-chain adapters.

**Why:** The US Treasury and DTC will never run Canton participant nodes. The original architecture over-modeled their on-ledger presence. The bank holds real T-bonds in its DTC custodial account and self-attests custody on Canton after DTC reconciliation.

**How to apply:**
- TokenizedBond has escrowBank as sole signatory (not co-signed with bondIssuer)
- AssetCustody and CustodyConfirmation have escrowBank as sole signatory (custodian/treasuryProvider removed as Canton party)
- All investor parties are hosted on the bank's participant node (allocated via Admin API during KYC onboarding)
- Canton sub-transaction privacy only applies between bank participant and regulator participant; all investor data is visible to the bank
- Config files are in canton/config/ (synchronizer.conf, bank-participant.conf, regulator-participant.conf)
- Bootstrap script is canton/bootstrap.canton
- The existing Daml contracts (KYC, AssetCustody) need signatory model updates to remove references to custodian/treasuryProvider as Canton parties
