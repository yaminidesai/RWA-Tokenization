# 02 — Bank Requirements

## Overview

This document specifies the regulatory, financial, operational, and governance requirements that a bank must satisfy to operate an RWA tokenization platform on the Canton Network. These requirements apply to the bank in its role as the platform operator, qualified custodian, broker, and transfer agent for tokenized Treasury securities.

**Architectural context**: The bank is the sole Canton participant in this platform. It operates one participant node connected to the Canton Global Synchronizer (operated by the Canton Network's super-validator consortium). Bond issuers, treasury providers, and regulators have no Canton nodes — the bank is the single trust anchor, holding real Treasury securities at DTC and minting tokens on a 1:1 basis.

---

## 1. Regulatory Licensing and Registration

### 1.1 Banking Charter

The operating bank must hold one of the following charters:

| Charter Type | Regulator | Key Characteristics |
|-------------|-----------|---------------------|
| National bank charter | Office of the Comptroller of the Currency (OCC) | Federal charter; subject to OCC examination; can operate nationwide; eligible for Federal Reserve membership |
| State bank charter (Federal Reserve member) | State banking department + Federal Reserve | State charter; Federal Reserve member; subject to Fed and state examination |
| State bank charter (non-member) | State banking department + FDIC | State charter; FDIC-insured; subject to FDIC and state examination |
| Trust company charter | OCC or state | Specialized charter for fiduciary and custody activities |

**Recommendation**: A nationally chartered bank (OCC-regulated) or a state-chartered bank with Federal Reserve membership provides the broadest set of powers and the clearest regulatory pathway for digital asset custody, based on OCC Interpretive Letters 1170 and 1179.

### 1.2 Digital Asset Custody Authority

Under OCC Interpretive Letter 1170 (July 2020), national banks and federal savings associations may provide cryptocurrency custody services, including holding cryptographic keys, as a modern form of traditional custody activities. This extends to custody of tokenized securities.

**Requirements**:

- Demonstrate operational capability for digital asset custody.
- Implement adequate risk management and internal controls.
- Obtain a supervisory non-objection from the OCC before commencing significant digital asset custody activities.

**Note on the bank's trust model**: Because the bank is the sole signatory on the core `TokenizedBond` and `CustodyRecord` DAML contracts, it carries full responsibility for the integrity of the tokenization process. This is analogous to a qualified custodian's standard fiduciary duty — the bank self-attests to its DTC holdings, and the 1:1 backing invariant is enforced both by the DAML `ensure` clause (on-chain) and by daily reconciliation against DTC position statements (off-chain).

### 1.3 Broker-Dealer Registration (if applicable)

If the bank or an affiliate facilitates secondary market trading of tokenized securities:

| Registration | Regulator | When Required |
|-------------|-----------|---------------|
| Broker-dealer registration | SEC (Form BD) | If the bank effects transactions in securities for the account of others |
| FINRA membership | FINRA | Required for all SEC-registered broker-dealers |
| State securities registration | State securities regulators | May be required in states where tokens are offered or traded |

**Exemptions**: Banks are generally exempt from broker-dealer registration under Section 3(a)(4) and 3(a)(5) of the Securities Exchange Act of 1934, provided they limit their activities to traditional banking functions (including custody, trust, and safekeeping).

### 1.4 Transfer Agent Registration

The bank acts as the de facto transfer agent for tokenized securities — it maintains the register of token holders and processes all transfers on the Canton ledger.

- **SEC registration** on Form TA-1 (Section 17A of the Securities Exchange Act).
- Comply with SEC Rule 17Ad-1 through 17Ad-22 (transfer agent rules).
- Maintain accurate records of registered owners (the `TokenizedBond` contracts on the Canton ledger serve as this registry).
- Process transfers within required timeframes.

### 1.5 State Licensing

| License | Jurisdiction | When Required |
|---------|-------------|---------------|
| Money transmitter license | Various states | If token transfers are deemed money transmission (banks generally exempt) |
| Digital asset business license (e.g., NY BitLicense) | New York | If operating digital asset business with NY residents (chartered NY banks may be exempt) |
| Trust company license | Various states | If operating custody functions in states where the bank is not chartered |

---

## 2. Capital Adequacy Requirements

### 2.1 Basel III

The bank must maintain adequate capital ratios under Basel III:

| Ratio | Minimum Requirement | Well-Capitalized Threshold |
|-------|---------------------|---------------------------|
| Common Equity Tier 1 (CET1) | 4.5% | 6.5% |
| Tier 1 Capital | 6.0% | 8.0% |
| Total Capital | 8.0% | 10.0% |
| Leverage Ratio | 4.0% | 5.0% |

### 2.2 Risk-Weighted Assets for Tokenized Treasury Securities

Under the Basel Committee's final standard on the prudential treatment of cryptoasset exposures (December 2022, effective January 2025):

- **Group 1 assets** (tokenized traditional assets meeting certain conditions): same risk weights as the underlying traditional asset.
  - US Treasury securities: 0% risk weight under the standardized approach.
  - Tokenized Treasury bonds that meet Group 1 criteria should receive the same 0% risk weight.
- **Group 1 classification requirements**:
  - The cryptoasset is a tokenized traditional asset providing the holder with the same legal rights as the traditional asset.
  - No additional risks are introduced by the tokenization.
  - The redemption mechanism ensures the holder can convert the token to the underlying asset.

**Implication**: If the platform's tokenized bonds meet Group 1 criteria, they should not require additional capital beyond what is held for the underlying Treasury securities.

### 2.3 Operational Risk Capital

The bank must allocate operational risk capital for:

- Smart contract risk (bugs, logic errors in DAML contracts — mitigated by pre-production audit).
- Technology infrastructure risk (Canton participant node failures, Global Synchronizer unavailability).
- Custody operations risk (key management failures, unauthorized access to the bank's participant node).
- Vendor risk (Canton Network super-validators, HSM providers, KYC providers).

---

## 3. Cybersecurity and Data Governance

### 3.1 Regulatory Cybersecurity Standards

| Standard / Regulation | Regulator | Key Requirements |
|----------------------|-----------|------------------|
| FFIEC Information Technology Examination Handbook | FFIEC (OCC, Fed, FDIC) | Comprehensive IT governance, risk management, audit |
| OCC Heightened Standards (12 CFR 30, Appendix D) | OCC | Risk governance framework for large banks ($50B+ assets) |
| NYDFS Cybersecurity Regulation (23 NYCRR 500) | NY DFS | Cybersecurity program, CISO, penetration testing, MFA (if licensed in NY) |
| Gramm-Leach-Bliley Act (GLBA) Safeguards Rule | FTC / banking regulators | Safeguards for customer information |
| SOC 2 Type II | AICPA | Controls over security, availability, processing integrity, confidentiality |

### 3.2 Canton-Specific Cybersecurity Requirements

- **Participant node security**: The bank's single Canton participant node must be deployed in a hardened environment with network segmentation, intrusion detection, and least-privilege access. This is the only Canton node the bank operates.
- **Key management**: Private keys for the Canton participant identity and all DAML party identities must be stored in FIPS 140-2 Level 3 (or higher) Hardware Security Modules (HSMs). This includes the `escrowBank` party signing key.
- **Network encryption**: All Canton protocol communications (participant ↔ Global Synchronizer) must use TLS 1.3 with mutual authentication (mTLS).
- **Smart contract security**: DAML contracts must undergo independent security audit before production deployment.
- **Access control**: Role-based access control (RBAC) for Canton Admin API and DAML Ledger API. Each off-chain service authenticates with a JWT scoped to a single party (`escrowBank`) and specific contract types.
- **Logging and monitoring**: All Canton node activity, DAML contract exercises, and API calls must be logged to a tamper-evident audit log (SIEM integration).

### 3.3 Data Governance

| Requirement | Standard | Details |
|------------|----------|---------|
| Data classification | Internal policy | Classify all data (PII, financial, transaction) by sensitivity |
| Data retention | SEC Rule 17a-4 (if broker-dealer), OCC 12 CFR 12 | Retain records for minimum 3-6 years |
| PII minimization | Platform design principle | Only `kycProviderRef` (reference ID) stored on the Canton ledger; full PII stays in the bank's off-chain KYC system |
| Right to erasure | GDPR, CCPA | Canton's privacy model helps — only parties with a stake in a contract see its data. Archived contracts are not visible to non-stakeholders. |
| Backup and recovery | FFIEC guidance | Regular backups of Canton participant node PostgreSQL database; tested recovery procedures; RPO/RTO targets |

---

## 4. Qualified Custodian Obligations

### 4.1 Investment Advisers Act Requirements

Under SEC Rule 206(4)-2 (the "Custody Rule"), investment advisers who have custody of client assets must maintain those assets with a "qualified custodian." Banks chartered under federal or state law are qualified custodians.

If the bank provides custody for tokenized securities on behalf of investment advisers' clients:

- Securities must be held in separate accounts or in omnibus accounts with adequate sub-accounting.
- The bank must provide account statements to clients at least quarterly.
- Client assets must be clearly identified as belonging to clients and segregated from the bank's proprietary assets.

### 4.2 SEC Staff Accounting Bulletin 121 (SAB 121)

SAB 121 (issued April 2022) requires entities that hold cryptoassets on behalf of platform users to recognize a liability on their balance sheet equal to the fair value of the cryptoassets.

**Implications for the bank**:

- If tokenized Treasury bonds are classified as "crypto-assets" under SAB 121, the bank may need to recognize the full value of custodied tokenized bonds on its balance sheet.
- The bank should work with its auditors and regulators to determine whether SAB 121 applies to tokenized securities representing traditional financial assets.
- Monitor Congressional efforts to modify SAB 121 treatment for bank-held tokenized traditional assets.

### 4.3 UCC Article 8 Considerations

The bank must ensure that tokenized bonds are treated as "financial assets" under Uniform Commercial Code (UCC) Article 8. This provides:

- Clear property rights for token holders.
- Established rules for pledging, liens, and secured transactions.
- Protection in the event of the bank's insolvency (customer securities are not part of the estate).

The bank's legal counsel should confirm that the tokenization structure creates a "securities entitlement" under UCC 8-501, where the bank is the "securities intermediary" and each token holder has a "securities account."

---

## 5. Smart Contract Audit Requirements

### 5.1 Audit Scope

Before deploying DAML contracts to the production Canton Network, the bank must commission an independent smart contract audit covering:

| Audit Area | Description |
|-----------|-------------|
| Logic correctness | Do the contracts implement the intended business logic? |
| Authorization model | Are signatories, observers, and controllers properly assigned? The bank is sole signatory on most contracts — auditors must verify this is appropriate and that no unauthorized party can exercise choices. |
| Privacy model | Does Canton's sub-transaction privacy model prevent unauthorized data exposure? (Investors must not see other investors' `TokenizedBond` contracts.) |
| Invariant enforcement | Is the 1:1 backing invariant (`totalMintedUnits <= quantity` on `CustodyRecord`) properly enforced? |
| Atomic composition | Are minting and redemption transactions properly composed (single atomic DAML transaction covering `CustodyRecord` update + `TokenizedBond` creation/archival)? |
| Edge cases | What happens if off-chain DTC settlement fails mid-workflow? |
| Upgrade path | Can contracts be upgraded without disrupting existing token holders? |

### 5.2 Audit Process

1. **Pre-audit**: Bank provides all DAML source code, architecture documentation, and test suites to the auditor.
2. **Audit execution**: Auditor reviews code, runs automated analysis tools, and performs manual review. Timeline: 4-8 weeks.
3. **Findings report**: Auditor produces a findings report with severity ratings (Critical, High, Medium, Low, Informational).
4. **Remediation**: Bank addresses all Critical and High findings.
5. **Re-audit**: Auditor verifies remediation of Critical and High findings.
6. **Attestation**: Auditor issues an attestation letter confirming the audit was completed.

### 5.3 Qualified Auditors

The smart contract audit should be performed by a firm with:

- Demonstrated experience auditing DAML contracts specifically.
- Understanding of Canton Network's privacy model, transaction processing, and LF 2.x limitations.
- Understanding of financial services regulatory requirements.
- Examples: Digital Asset professional services, Big Four technology consulting practices with DAML expertise.

---

## 6. Insurance and Bonding

### 6.1 Required Insurance Coverage

| Coverage Type | Purpose | Typical Limits |
|-------------|---------|---------------|
| Fidelity bond (Financial Institution Bond) | Covers loss due to employee dishonesty, forgery, computer fraud | $10M - $100M+ |
| Errors and omissions (E&O) / Professional liability | Covers claims from professional services (custody, transfer agent) | $10M - $50M+ |
| Cyber liability | Covers costs of data breaches, ransomware, business interruption | $10M - $100M+ |
| Directors and officers (D&O) | Covers personal liability of directors and officers | $10M - $50M+ |
| Technology errors and omissions | Covers claims related to technology platform failures | $5M - $25M+ |

### 6.2 Digital Asset-Specific Insurance

- **Custody insurance**: Specialized coverage for loss of digital assets due to hacking, key compromise, or operational failure.
- **Key management risk**: Insurers evaluate the bank's HSM procedures, access controls, and incident response plan for the Canton participant node.

---

## 7. AML/BSA Compliance Program

### 7.1 Program Requirements

Under the Bank Secrecy Act (BSA) and its implementing regulations (31 CFR Chapter X), the bank must maintain:

1. **Written policies and procedures** covering the tokenization platform, including:
   - Customer identification procedures (CIP) for token holders.
   - Customer due diligence (CDD) — captured in the `InvestorKYC` DAML contract.
   - Transaction monitoring for tokenized bond transfers.
   - Suspicious activity monitoring and SAR filing.
   - OFAC sanctions screening (performed off-chain by the bank's KYC Service before every `TransferOwnership` exercise).

2. **Designated BSA/AML compliance officer**.

3. **Ongoing employee training** on tokenization-specific AML typologies.

4. **Independent testing (audit)**: Annual independent review of the AML program.

5. **Risk-based customer due diligence**: Risk assessment of each investor, with enhanced procedures for higher-risk relationships.

### 7.2 Tokenization-Specific AML Considerations

| Risk Area | Mitigation |
|----------|------------|
| Pseudonymous transfer | Canton Network is permissioned; all investor parties are KYC'd and identified in the `InvestorKYC` contract before any purchase is approved. |
| Rapid transfers | Bank's Transfer Service monitors velocity of `TransferOwnership` events; flags unusual patterns. |
| Layering through multiple transfers | Transaction monitoring on the bank's ledger event stream detects rapid sequential transfers. |
| Sanctions evasion | Bank's Transfer Service performs real-time OFAC screening before co-signing any `TransferOwnership` choice. Daily batch screening of all active `TokenizedBond` holder parties. |
| Nominee or shell structures | UBO identification required during KYC onboarding; stored in off-chain KYC system; `kycProviderRef` on `InvestorKYC` links to the full off-chain record. |

### 7.3 Travel Rule Compliance

For transfers of tokenized securities of $3,000 or more, the bank must collect and transmit originator and beneficiary information. On this platform:

- All parties are identified (the `TransferOwnership` DAML choice records both `currentOwner` and `newOwner` party IDs).
- The bank's Transfer Service extracts this information from ledger events and submits it to FinCEN as required.

---

## 8. Board and Management Governance

### 8.1 Board Oversight

The bank's board of directors must:

- **Approve the digital asset strategy**: Including the Canton participant node operation, Global Synchronizer connectivity, and the bank's role as sole Canton participant for this platform.
- **Establish risk limits**: Maximum aggregate value of tokenized securities; concentration limits per CUSIP.
- **Receive regular reporting**: Quarterly reports on tokenized securities outstanding, reconciliation results, compliance findings, and technology risk metrics.
- **Review and approve policies**: All policies related to digital asset custody, DAML contract governance, and smart contract upgrade procedures.

### 8.2 Key Personnel Requirements

| Role | Qualifications | Responsibilities |
|------|---------------|------------------|
| Head of Digital Asset Operations | 10+ years in custody/securities operations, DLT experience | Overall P&L and operational responsibility for the platform |
| DAML/Canton Technical Lead | Deep DAML (LF 2.x) and Canton expertise, financial services background | Smart contract development, participant node administration, Global Synchronizer connectivity |
| Digital Asset Compliance Officer | JD or equivalent, 7+ years in financial regulatory compliance | Regulatory compliance, policy development, exam management |
| Digital Asset Risk Officer | CFA/FRM or equivalent | Operational risk for the bank-as-sole-Canton-participant model; smart contract risk |
| CISO (or deputy for digital assets) | CISSP or equivalent | Cybersecurity for Canton participant node and HSM; incident response |

### 8.3 Three Lines of Defense

| Line | Function | Role in Tokenization Platform |
|------|----------|-------------------------------|
| **First line** | Business and operations | Day-to-day operation of the Canton participant node, DAML contract management, custody operations, investor onboarding |
| **Second line** | Risk management and compliance | Independent oversight of first-line activities; AML monitoring on ledger event streams; policy development |
| **Third line** | Internal audit | Annual audit of tokenization operations, including Canton participant node controls and DAML contract authorization model |

---

## 9. Vendor and Third-Party Management

### 9.1 Critical Vendors for This Platform

| Vendor Category | Risk Level | Key Due Diligence Focus |
|----------------|------------|------------------------|
| Canton Global Synchronizer (Digital Asset / super-validators) | Critical | Platform stability, upgrade path, SLA for sequencer availability, connectivity guarantees |
| Cloud infrastructure (AWS / Azure / GCP) | Critical | Data residency, encryption, FedRAMP authorization for participant node hosting |
| HSM provider (Thales, Entrust, AWS CloudHSM) | Critical | FIPS 140-2 Level 3 certification, key ceremony procedures for Canton participant key |
| KYC/AML provider (Jumio, Onfido, LexisNexis) | High | Accuracy rates, regulatory acceptance, data retention, GDPR compliance |
| Smart contract auditor | High | DAML LF 2.x expertise, independence, track record |
| Market data provider (Bloomberg, Refinitiv) | Medium | Data accuracy, latency, coverage |

### 9.2 Global Synchronizer Dependency

The bank's participant node connects to the Canton Global Synchronizer, which is operated by the Canton Network's super-validator consortium. This is a critical dependency:

- **SLA**: Confirm the Global Synchronizer's availability SLA (sequencer uptime, sequencer failover procedures).
- **Sequencer connectivity**: The bank's participant node must maintain a stable, low-latency connection to the Global Synchronizer sequencer endpoints.
- **Governance**: Understand how Global Synchronizer upgrades are announced and managed, and what change management process the bank needs to follow for its participant node.
- **Contingency**: Document the procedure for temporarily suspending platform operations if the Global Synchronizer is unavailable.

---

## 10. Requirements Compliance Matrix

| # | Requirement | Regulatory Source | Status |
|---|------------|-------------------|--------|
| 1 | Banking charter (national or state) | OCC / state banking law | |
| 2 | Digital asset custody non-objection | OCC IL 1170, 1179 | |
| 3 | Transfer agent registration | SEC Section 17A | |
| 4 | CET1 capital ratio >= 6.5% | Basel III / 12 CFR 3 | |
| 5 | Cybersecurity program for Canton participant node | FFIEC, 23 NYCRR 500 | |
| 6 | HSM key management for Canton participant + escrowBank party keys | FFIEC, industry best practice | |
| 7 | Qualified custodian obligations | SEC Rule 206(4)-2 | |
| 8 | DAML smart contract audit (pre-production) | OCC risk management guidance | |
| 9 | Fidelity bond and E&O insurance | OCC / state requirements | |
| 10 | AML/BSA compliance program covering tokenization | 31 CFR Chapter X | |
| 11 | Board approval of digital asset strategy | OCC Heightened Standards | |
| 12 | Vendor risk management — Global Synchronizer, HSM, KYC | OCC 2013-29, Interagency 2023 | |
| 13 | Incident response plan (including Canton node failure) | FFIEC, NYDFS 500 | |
| 14 | Business continuity plan (Global Synchronizer unavailability) | FFIEC | |
| 15 | Daily reconciliation: DTC positions vs. on-ledger token supply | OCC / SEC audit expectations | |
| 16 | Off-chain regulatory reporting (SEC/OCC) from Canton ledger data | SEC, OCC | |
| 17 | SAB 121 analysis and treatment for tokenized Treasuries | SEC SAB 121 | |
| 18 | UCC Article 8 legal opinion on tokenized securities | Legal counsel | |
| 19 | Annual independent audit (SSAE 18 SOC 1 Type II) | Banking regulations | |
| 20 | Data governance and PII minimization on Canton ledger | GDPR, CCPA, SEC 17a-4 | |
