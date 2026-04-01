# 01 — Bank Securities Account Setup

## Overview

Before any tokenized bond can be issued on the Canton Network, the operating bank must establish accounts and relationships with the securities issuers, central securities depositories (CSDs), and clearing infrastructure that hold and settle the underlying assets. This document describes the account setup process for each major counterparty, the legal and licensing prerequisites, custody arrangements, and ongoing obligations.

**Key architectural principle**: Bond issuers (US Treasury) and treasury providers (primary dealers, DTC) are entirely external to the Canton Network. They operate on their own infrastructure — DTC, Fedwire, SWIFT — and have no visibility into or participation in the Canton ledger. The bank establishes normal financial industry account relationships with these entities. The Canton platform is used exclusively by the bank to tokenize the securities it already holds in custody.

---

## 1. Account Relationships Required

The platform requires the bank to maintain accounts with the following entities. None of these entities are Canton participants — they are off-chain counterparties accessed by the bank's off-chain services via SWIFT, FIX, and proprietary APIs.

| Entity | Role | Canton Involvement | Account Purpose |
|--------|------|-------------------|-----------------|
| US Treasury (TreasuryDirect / auction) | Issuer / primary market | None — purely off-chain | Direct purchase of newly issued Treasuries via auction |
| Federal Reserve Bank (FRB) | Fiscal agent, Fedwire operator | None — purely off-chain | Fedwire Securities Service book-entry custody; funds settlement |
| DTCC / DTC (Depository Trust Company) | CSD for US securities | None — purely off-chain | Book-entry ownership, settlement, corporate actions for all tokenized securities |
| FICC (Fixed Income Clearing Corporation) | Central counterparty clearing | None — purely off-chain | Government securities clearing (GSD division) |
| Primary dealers (e.g., J.P. Morgan, Goldman Sachs) | Secondary market intermediary | None — purely off-chain | Treasury auction participation, secondary market bond purchases |
| Euroclear | International CSD (ICSD) | None — purely off-chain | Cross-border settlement if expanding to non-US government bonds |
| Clearstream (Deutsche Boerse) | International CSD (ICSD) | None — purely off-chain | Cross-border settlement if expanding to non-US government bonds |

The bank's Custody Service, Minting Service, and Redemption Service (all off-chain microservices) communicate with DTC and Fedwire via SWIFT messages and proprietary APIs. The results of those interactions are then recorded on the Canton ledger by the bank's off-chain services acting as the `escrowBank` party.

---

## 2. US Treasury and the Federal Reserve

### 2.1 TreasuryDirect (Retail / Small Institutional)

TreasuryDirect is the US Treasury's online platform for purchasing government securities directly. It is primarily designed for retail investors and small institutions. For a tokenization platform, TreasuryDirect is insufficient because:

- Account limits are relatively low.
- Securities held in TreasuryDirect cannot be transferred to DTC or Fedwire easily.
- It does not support omnibus or custodial account structures needed for tokenization.

**Recommendation**: TreasuryDirect is not suitable as the primary custody channel. Use the Fedwire Securities Service or DTC instead.

### 2.2 Federal Reserve Bank — Fedwire Securities Service

The Fedwire Securities Service is the book-entry system operated by the Federal Reserve Banks for holding and transferring US Treasury securities, federal agency securities, and mortgage-backed securities.

#### Account Opening Process

1. **Eligibility**: The bank must be a depository institution eligible for a Federal Reserve master account, or access Fedwire through a correspondent bank that has such an account.

2. **Application**:
   - Submit Federal Reserve Financial Services application (FR 2050 or equivalent).
   - Provide legal entity documentation (articles of incorporation, charter, bylaws).
   - Provide evidence of OCC or state banking charter.
   - Designate authorized signers and security administrators.

3. **Technical setup**:
   - Establish FedLine Direct or FedLine Advantage connectivity.
   - Configure Fedwire Securities message types (receive, deliver, pledge).
   - Implement SWIFT or proprietary messaging for settlement instructions.
   - Complete connectivity testing with the Federal Reserve Bank.

4. **Ongoing requirements**:
   - Maintain required reserve balances.
   - Comply with Federal Reserve Operating Circular 7 (Fedwire Funds) and Operating Circular 10 (Fedwire Securities).
   - Submit to Federal Reserve examination and audit.

#### Book-Entry Securities on Fedwire

- Securities are held in book-entry form at the Federal Reserve Bank.
- Each participant has a securities account identified by an ABA routing number.
- Transfers are delivery-versus-payment (DVP) — securities move simultaneously with funds on the Fedwire Funds Service.
- Settlement is same-day, real-time, final and irrevocable.
- After Fedwire settlement, the bank's Custody Service creates or updates a `CustodyRecord` on the Canton ledger recording the bank's attestation of the position, including the Fedwire IMAD as an immutable reference.

---

## 3. DTCC / DTC (Depository Trust Company)

### 3.1 Overview

The Depository Trust Company (DTC) is the central securities depository for the United States. It holds virtually all US securities in book-entry form and facilitates their settlement.

For a tokenization platform focused on US Treasury securities, DTC provides:

- Book-entry custody of Treasury securities.
- Settlement services through FICC.
- Corporate actions processing (coupon payments, maturities, calls) via SWIFT MT564 notifications.
- Participant-level reporting (MT535 position statements).

### 3.2 DTC Participant Account Opening

#### Eligibility

To become a DTC participant, the bank must be one of the following:

- A bank or trust company chartered under US federal or state law.
- A broker-dealer registered with the SEC and a member of FINRA.
- A foreign bank or broker-dealer meeting DTC's eligibility criteria.
- A registered clearing agency.

#### Application Process

1. **Pre-application**: Contact DTCC Relationship Management to discuss participant type (full-service participant, limited participant, or pledgee).

2. **Formal application** (DTCC Form):
   - Legal entity name, jurisdiction of organization, and regulatory status.
   - Audited financial statements (minimum 2 years).
   - Net capital or capital adequacy documentation.
   - Insurance coverage details (fidelity bond, errors & omissions).
   - Description of business activities and anticipated DTC transaction volumes.
   - Identification of control persons, directors, and officers.
   - Background check consent for control persons.

3. **Regulatory review**:
   - DTC verifies the applicant's regulatory standing with the SEC, OCC, or applicable state regulator.
   - FINRA membership verification (if broker-dealer).
   - Review of any regulatory actions, enforcement orders, or pending litigation.

4. **Financial requirements**:
   - Minimum net capital or excess net capital requirements (generally $1M-$10M+ depending on activity level).
   - Required Participants Fund deposit (calculated based on activity; recalculated periodically).
   - Adequate insurance coverage.

5. **Operational readiness**:
   - Establish connectivity to DTC's Participant Terminal System (PTS) or Settlement Web.
   - Configure message types for receive/deliver instructions (MT540/MT541/MT542/MT543).
   - Complete certification testing.
   - Designate authorized personnel and security tokens.

6. **Approval**: DTCC Board or designated committee approval. Timeline: 60-120 days from complete application.

### 3.3 DTC Account Structures

| Structure | Description | Use Case |
|-----------|-------------|----------|
| **Participant Account** | The bank's own account at DTC | Holding the bank's proprietary positions |
| **Segregated Sub-Accounts** | Separate sub-accounts within the participant account | Segregating the underlying securities that back tokenized bonds from the bank's proprietary holdings |
| **Pledgee Account** | Account that receives pledged securities | Collateral management, lending |

**For tokenization**: The bank maintains segregated sub-accounts at DTC to hold the underlying Treasury securities that back tokenized bonds. This ensures:

- Clear separation of tokenization-backing assets from the bank's proprietary holdings.
- Compliance with SEC Rule 15c3-3 (Customer Protection Rule) if the bank operates as a broker-dealer.
- Compliance with qualified custodian requirements under the Investment Advisers Act.
- Audit trail showing that each tokenized bond series is backed 1:1 by underlying securities at DTC.

The `CustodyRecord` on the Canton ledger records the DTC settlement reference (`dtcSettlementRef`) for each position, creating an immutable on-chain link to the off-chain DTC custody event.

### 3.4 FICC / GSD (Government Securities Division)

For clearing government securities trades, the bank may also need membership in the Fixed Income Clearing Corporation's Government Securities Division (FICC/GSD).

**FICC/GSD netting membership** provides:

- Central counterparty clearing for Treasury trades.
- Netting of settlement obligations (reduces gross settlement volume).
- Risk management through margin and clearing fund requirements.

---

## 4. Primary Dealer Relationships

### 4.1 Role of Primary Dealers

Primary dealers are the banks and securities firms designated by the Federal Reserve Bank of New York as trading counterparties for open market operations. They are obligated to participate in Treasury auctions and make markets in US government securities.

For the tokenization platform, primary dealer relationships provide the bank with:

- **Bond acquisition**: The bank purchases Treasury securities from primary dealers via electronic trading platforms (TradeWeb, Bloomberg) or via FIX protocol, and settles via DTC (SWIFT MT541 buy instruction).
- **Secondary market liquidity**: Primary dealers are the most active market makers in Treasuries.
- **Repo financing**: Primary dealers are major counterparties in the Treasury repo market.

**How this connects to Canton**: After the bank purchases bonds from a primary dealer and receives DTC settlement confirmation (SWIFT MT545), the bank's Custody Service creates a `CustodyRecord` on the Canton ledger. The `dealerReference` field on that contract records the primary dealer trade confirmation ID, providing an off-chain audit trail that ties the on-ledger record to the specific trade.

### 4.2 Establishing a Trading Relationship

1. **ISDA Master Agreement**: Execute an ISDA Master Agreement and Credit Support Annex (CSA) with the primary dealer for derivatives and repo transactions.

2. **Master Securities Lending Agreement (MSLA)** or **Global Master Repurchase Agreement (GMRA)**: For repo and securities lending.

3. **Trading documentation**:
   - Complete the primary dealer's onboarding package (KYC, AML, tax documentation).
   - Establish credit lines and trading limits.
   - Agree on settlement instructions (DTC, Fedwire, or ICSD).

4. **Connectivity**:
   - Electronic trading platforms (TradeWeb, Bloomberg, MarketAxess).
   - FIX protocol connectivity for automated order routing from the bank's Custody Service.
   - Post-trade confirmation via SWIFT MT545 (settlement confirmation to bank's Custody Service).

---

## 5. AML/KYC Onboarding Requirements

Each of the above counterparties will require AML/KYC documentation from the bank. The typical package includes:

### 5.1 Standard KYC Documentation

| Document | Description |
|----------|-------------|
| Certificate of Incorporation / Charter | Legal formation document |
| Articles of Association / Bylaws | Governance structure |
| Certificate of Good Standing | Current status from jurisdiction of incorporation |
| Organizational chart | Showing ownership structure up to ultimate beneficial owners (UBOs) |
| UBO identification | Identification of all individuals owning 10-25%+ (threshold varies by jurisdiction) |
| Board of Directors list | Names, nationalities, dates of birth |
| Authorized signatories | Names and specimen signatures |
| Regulatory licenses | OCC charter, state banking license, SEC registration, FINRA membership |
| Audited financial statements | Minimum 2 years |
| AML/KYC program documentation | Written AML/BSA compliance program, OFAC sanctions screening procedures |
| Tax documentation | W-9 (US entities), W-8BEN-E (non-US entities), FATCA/CRS self-certification |
| LEI (Legal Entity Identifier) | 20-character alphanumeric code from a GLEIF-accredited issuer |

---

## 6. Custody Arrangements

### 6.1 Omnibus vs. Segregated Accounts

| Feature | Omnibus Account | Segregated Account |
|---------|-----------------|-------------------|
| **Structure** | Single account holds securities for multiple underlying clients | Separate account per client or per tokenized bond series |
| **Operational complexity** | Lower — one account to manage | Higher — multiple accounts and reconciliation |
| **Cost** | Lower custody fees per position | Higher per-account fees |
| **Client asset protection** | Depends on jurisdiction; may be commingled for insolvency purposes | Stronger legal separation; assets clearly identifiable as client property |
| **Regulatory preference** | Acceptable for many regulated entities | Preferred/required for qualified custodian obligations |
| **Reconciliation** | Internal sub-accounting required | Straightforward — account balance equals token supply for that series |

**Recommendation for this platform**: Use **segregated sub-accounts at DTC** for each tokenized bond series (identified by CUSIP). This provides:

- Clear 1:1 backing between the on-ledger `CustodyRecord` and the underlying DTC sub-account.
- Simplified proof-of-reserves: DTC position for CUSIP X = total `TokenizedBond` units for CUSIP X.
- Stronger legal protection for token holders in the event of the bank's insolvency.
- Regulatory defensibility when demonstrating qualified custodian compliance.

### 6.2 Proof of Reserves

The tokenization platform implements a proof-of-reserves mechanism:

1. **On-chain invariant**: The `CustodyRecord` DAML contract enforces `totalMintedUnits <= quantity`. The DAML runtime prevents the bank from minting more tokens than it has attested to holding.

2. **Daily reconciliation**: The bank's Reconciliation Service (off-chain) compares:
   - On-ledger: sum of all active `TokenizedBond.units` for each CUSIP.
   - Off-chain: DTC position statement (MT535) for the corresponding sub-account.
   - Any discrepancy triggers an immediate alert to operations and compliance.

3. **Attestation**: Periodic (monthly or quarterly) third-party attestation by an independent auditor confirming that DTC holdings match or exceed the aggregate face value of outstanding tokenized bonds.

4. **Regulatory reporting**: The bank's Reporting Service exports on-ledger token supply data alongside DTC position data to SEC/OCC in required formats. Regulators receive this data through the bank's regulatory reporting channels — they do not have direct Canton ledger access.

---

## 7. Settlement and Clearing Infrastructure

### 7.1 Settlement Methods

| Method | System | Securities | Settlement Cycle | Finality |
|--------|--------|-----------|-------------------|----------|
| DVP (Delivery vs. Payment) | Fedwire Securities | US Treasuries, agency securities | Real-time, same-day | Immediate, irrevocable |
| DVP | DTC | US Treasuries, equities, corporates | T+1 (as of May 2024) | End-of-day finality |
| DVP | Euroclear / Clearstream | International bonds | T+2 (standard) or T+1 | End-of-day finality |

### 7.2 Payment Rails for Fiat Settlement

| Payment Rail | Currency | Speed | Use Case |
|-------------|----------|-------|----------|
| Fedwire Funds Service | USD | Real-time, same-day | Bond purchases from primary dealers, redemption payouts to investors |
| FedNow | USD | Real-time, 24/7 | Lower-value instant payments |
| ACH (Automated Clearing House) | USD | Same-day or next-day | Coupon payments to investor bank accounts |
| SWIFT (gpi) | Multi-currency | 1-3 business days (gpi: hours) | Cross-border payments for international investors |

### 7.3 Integration with Token Lifecycle

| Token Event | Off-Chain Action | System | Canton Ledger Action |
|-------------|-----------------|--------|---------------------|
| Token minting (new issuance) | Bank purchases securities, DTC settles | DTC DVP (MT541 → MT545) or Fedwire DVP | Bank's Minting Service creates `TokenizedBond`; updates `CustodyRecord.totalMintedUnits` |
| Coupon payment | DTC distributes coupon proceeds to bank | DTC (MT564 corporate action), Fedwire Funds | Bank's Coupon Service exercises `RecordCouponPayment` on `TokenizedBond` |
| Token transfer (secondary) | No off-chain action; underlying stays at DTC | N/A | Bank's Transfer Service exercises `TransferOwnership` on `TokenizedBond` |
| Token redemption (maturity) | DTC matures bond, Fedwire returns principal | DTC maturity processing, Fedwire Funds | Bank's Redemption Service exercises `BurnToken`; updates `CustodyRecord` |

---

## 8. Ongoing Reporting and Compliance Obligations

### 8.1 Regulatory Reporting

| Report | Regulator | Frequency | Description |
|--------|-----------|-----------|-------------|
| Call Report (FFIEC 031/041) | OCC / Federal Reserve / FDIC | Quarterly | Balance sheet, income, custody assets |
| FOCUS Report (X-17A-5) | SEC / FINRA | Monthly/Quarterly | Financial and operational report (if broker-dealer) |
| SAR (Suspicious Activity Report) | FinCEN | As needed | Suspicious transactions > $5,000 |
| CTR (Currency Transaction Report) | FinCEN | As needed | Cash transactions > $10,000 |
| FATCA / CRS reporting | IRS / local tax authority | Annual | Foreign account tax compliance |
| Large Position Reports | US Treasury | As required | Large positions in Treasury securities |

**Note on regulatory access to Canton data**: Regulators (SEC, OCC) do not have Canton participant nodes. The bank's Reporting Service exports on-ledger token issuance, transfer, coupon, and redemption data in the formats required by each regulator. This off-chain reporting satisfies regulatory audit trail requirements without requiring regulator participation in the Canton network.

### 8.2 Internal Compliance

- **Daily reconciliation**: Custodial positions (DTC MT535) vs. on-ledger token supply.
- **Monthly proof of reserves**: Internal attestation by operations and compliance.
- **Quarterly audit committee review**: Review of custodial arrangements, reconciliation results, and exception reports.
- **Annual external audit**: Independent audit of custodial operations, including SSAE 18 SOC 1 Type II report.
- **Annual regulatory exam**: OCC, Federal Reserve, or state regulator examination of the bank's custody and digital asset operations.

---

## 9. Account Setup Checklist

- [ ] Confirm bank charter type and regulatory standing (OCC national bank, state-chartered, etc.)
- [ ] Obtain LEI (Legal Entity Identifier) if not already held
- [ ] Apply for Fedwire Securities Service access (or confirm correspondent bank access)
- [ ] Apply for DTC participant status (or confirm existing participation)
- [ ] Apply for FICC/GSD membership (if clearing government securities)
- [ ] Establish primary dealer trading relationships (minimum 2-3 for competitive pricing)
- [ ] Execute ISDA, GMRA, and/or MSLA agreements with trading counterparties
- [ ] Configure segregated sub-accounts at DTC per tokenized bond series (CUSIP)
- [ ] Establish Fedwire Funds connectivity for bond purchase payments and redemption payouts
- [ ] Establish SWIFT connectivity for DTC settlement instructions (MT541, MT543) and confirmations (MT545)
- [ ] Configure SWIFT MT564 processing for DTC corporate action (coupon) notifications
- [ ] Configure SWIFT MT535 processing for daily DTC position reconciliation
- [ ] Establish FIX protocol connectivity to primary dealer electronic trading platforms (TradeWeb, Bloomberg)
- [ ] Implement daily reconciliation process: DTC positions vs. Canton on-ledger token supply
- [ ] Engage independent auditor for proof-of-reserves attestation
- [ ] Complete KYC documentation packages for all counterparties
- [ ] Obtain board approval for custodial operations related to digital asset tokenization
- [ ] Set up off-chain Reporting Service to export Canton ledger data to regulatory reporting systems

---

## Appendix A: Key Regulatory References

- **OCC Interpretive Letter 1170 (July 2020)**: National banks may provide custody services for cryptographic keys associated with digital assets.
- **OCC Interpretive Letter 1179 (January 2021)**: Banks may participate in independent node verification networks and use stablecoins.
- **SEC Staff Statement on DLT Securities (2020-2024)**: Guidance on application of securities laws to tokenized securities.
- **Federal Reserve Operating Circular 7**: Fedwire Funds Service rules.
- **Federal Reserve Operating Circular 10**: Fedwire Securities Service rules.
- **DTC Rules and Procedures**: Available at dtcc.com.
- **FINRA Regulatory Notice 19-24**: Guidance on digital asset activities by broker-dealers.
