---
name: RWA Tokenization Platform on Canton
description: Bank-operated platform for tokenizing US Treasury bonds on Canton Network using Daml SDK 3.4.10, targeting LF 2.1. Escrow bank is central trust anchor with participant types for bond issuer, treasury provider, regulator, and investors.
type: project
---

The project is an RWA tokenization platform on Canton Network for US Treasury bonds and government securities. The bank acts as escrow bank (qualified custodian, platform operator, synchronizer domain operator).

**Why:** The bank wants to offer tokenized Treasury securities to institutional and accredited investors with automated compliance, real-time position visibility, and reduced settlement risk.

**How to apply:**
- All architecture decisions should prioritize regulatory compliance (OCC, SEC, FinCEN) and Canton's sub-transaction privacy model
- Current Daml SDK version is 3.4.10 targeting LF 2.1
- Existing modules: RWA.Types, RWA.KYC (InvestorKYC), RWA.AssetCustody (AssetCustody, CustodyConfirmation)
- Missing modules that need implementation: RWA.EscrowRequest, RWA.TokenizedBond, RWA.CouponPayment, RWA.RedemptionRequest
- Comprehensive docs already exist in docs/ (5 documents covering bank setup, requirements, developer guide, architecture, pros/cons)
- The existing InvestorKYC template differs from the docs/04 KYCRecord spec (signatory model differs) -- needs reconciliation
- Deployment target: hybrid on-premise + private cloud for a regulated bank
- Integration targets: DTC/DTCC (SWIFT MT5xx), Fedwire Securities, ACH, Bloomberg/Refinitiv
