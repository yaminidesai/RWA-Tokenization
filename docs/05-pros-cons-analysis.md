# 05 — Pros and Cons Analysis

## Overview

This document provides side-by-side comparisons of key architectural, operational, and strategic decisions involved in building an RWA tokenization platform. Each comparison is presented in a structured table format with analysis to support decision-making by executive leadership, legal/compliance teams, and engineering teams.

---

## 1. Tokenized Securities vs. Traditional Securities (For Investors)

### Comparison

| Dimension | Tokenized Securities (Pros) | Tokenized Securities (Cons) |
|-----------|---------------------------|---------------------------|
| **Settlement speed** | Near-instant or T+0 settlement on the Canton ledger, compared to T+1 (US) or T+2 (international) for traditional securities. Eliminates settlement risk and frees up capital faster. | Atomic settlement on-ledger does not eliminate the need for off-chain fiat settlement, which still follows traditional timelines. True DVP across token and fiat requires integrated payment rails. |
| **Fractional ownership** | Tokens can represent fractional units of a bond (e.g., $100 increments instead of $1,000 minimums), broadening access for smaller investors. | Fractional ownership may create complications for voting rights, tax reporting (1099 generation per fraction), and regulatory classification. |
| **24/7 availability** | Canton Network can operate continuously, enabling transfer of tokenized bonds outside traditional market hours. | Underlying custody systems (DTC, Fedwire) operate on business-day schedules. Coupon payments, minting, and redemption remain constrained by off-chain operating hours. |
| **Transparency** | Investors can verify their holdings on-ledger in real time. Proof-of-reserves can be automated. Regulators have direct ledger access. | Transparency is limited to what the platform chooses to expose. Canton's privacy model means investors see only their own contracts, not the full market. |
| **Reduced counterparty risk** | Smart contracts enforce 1:1 backing and automate coupon/redemption payments, reducing reliance on manual processes and intermediary honesty. | Smart contract bugs or design flaws can introduce new forms of risk. The escrow bank remains a single point of trust for custody of underlying assets. |
| **Programmability** | Coupon payments, maturity redemptions, and transfer restrictions can be automated via DAML smart contracts, reducing operational overhead and human error. | Programmability introduces smart contract risk. Logic errors in DAML contracts could result in incorrect payments, unauthorized transfers, or locked assets. |
| **Reduced costs** | Elimination of some intermediaries (transfer agents, sub-custodians) can reduce fees. Automated compliance reduces manual review costs. | The platform requires significant upfront investment in technology, compliance, and audit. Ongoing costs for Canton licensing, HSM, KYC providers, and smart contract audits may offset savings. |
| **Portability** | Tokens can potentially be transferred across different Canton-connected platforms, enabling interoperability. | Portability is limited to the Canton ecosystem. Tokens cannot be freely moved to public blockchains or other DLT platforms without bridge mechanisms. |
| **Audit trail** | Immutable, timestamped record of all transactions on the Canton ledger provides a superior audit trail compared to traditional book-entry systems. | The audit trail is only as good as the platform's integration with off-chain systems. Discrepancies between on-ledger and off-chain records can arise if reconciliation fails. |
| **Access to new investor segments** | Tokenization can attract crypto-native investors and DeFi-oriented institutions to traditional fixed-income products. | Crypto-native investors may expect features (self-custody, composability with DeFi, permissionless access) that a permissioned, regulated platform cannot provide. |

### Summary Assessment

Tokenized securities offer meaningful advantages in settlement efficiency, programmability, and transparency. However, the benefits are partially constrained by the continued dependence on traditional off-chain infrastructure for custody, fiat settlement, and corporate actions. The value proposition is strongest for institutional investors who value automated compliance, real-time position visibility, and reduced settlement risk.

---

## 2. Canton Network vs. Public Blockchain (Ethereum, Solana) for RWA Tokenization

### Comparison

| Dimension | Canton Network (Pros) | Canton Network (Cons) |
|-----------|----------------------|----------------------|
| **Privacy** | Sub-transaction privacy: each party sees only the contracts where they are a signatory or observer. Investor holdings, trade details, and KYC data are not visible to unrelated parties. This is essential for institutional securities. | Privacy limits composability. Third-party applications cannot freely interact with contracts they cannot see. Building a vibrant ecosystem of secondary services is harder than on a transparent chain. |
| **Regulatory compliance** | Designed for regulated industries. Permissioned participants are identified legal entities. Transfer restrictions, KYC checks, and regulatory observer patterns are native to the DAML model. | Canton is less battle-tested in production than Ethereum. Regulatory familiarity with Canton is lower than with traditional systems, which may require more education of examiners. |
| **Finality** | Deterministic finality — once a transaction is committed, it is final. No risk of chain reorganizations, uncle blocks, or probabilistic finality. | Finality depends on the synchronizer node operator (the escrow bank). If the synchronizer is compromised or unavailable, finality is at risk. This is a centralization trade-off. |
| **Scalability** | Canton's architecture (sequencer + mediator) scales to thousands of TPS without the gas fee mechanism or block size constraints of public chains. No gas wars or MEV. | Scalability is limited by the synchronizer node's capacity and the number of participant nodes. Very large networks may require multi-domain architectures, which add operational complexity. |
| **Smart contract language** | DAML is purpose-built for financial contracts with explicit authorization models, contract keys, and upgrade support. It prevents common smart contract vulnerabilities by design (no reentrancy, no unbound loops in the runtime). | DAML has a much smaller developer community than Solidity or Rust. Hiring DAML developers is harder. Tooling and library ecosystem is smaller. |
| **Interoperability** | Canton supports cross-domain transactions, allowing different Canton networks to interoperate. Digital Asset is building the Global Synchronizer for broader Canton interoperability. | Canton does not natively interoperate with public blockchains. Bridging to Ethereum or Solana requires custom bridge infrastructure with its own trust assumptions and attack surface. |
| **Cost** | No gas fees. Transaction costs are operational (infrastructure + licensing) rather than per-transaction gas fees. Predictable cost model. | Canton Enterprise requires a commercial license from Digital Asset. HSM, infrastructure, and operational costs are significant. Public chains have lower infrastructure costs for low-volume applications. |
| **Ecosystem** | Growing ecosystem of financial institutions (including major banks and exchanges) building on Canton. The Global Synchronizer initiative aims to create a network effect. | Public blockchains have vastly larger ecosystems: thousands of tokens, DeFi protocols, wallets, block explorers, oracles, and developers. Canton's ecosystem is nascent by comparison. |
| **Self-custody** | Canton participants manage their own keys and run their own nodes, providing institutional self-custody. | Retail-friendly self-custody (MetaMask-style wallets) does not exist for Canton. Investor access typically requires the bank to operate a participant node on the investor's behalf. |
| **Censorship resistance** | Not a design goal. The synchronizer operator can refuse to process transactions. This is acceptable (and desirable) in a regulated context where the operator must enforce sanctions and legal orders. | For use cases requiring censorship resistance (which is not appropriate for regulated securities), Canton is not the right choice. |

| Dimension | Public Blockchain — Ethereum (Pros) | Public Blockchain — Ethereum (Cons) |
|-----------|-------------------------------------|-------------------------------------|
| **Ecosystem** | Largest smart contract ecosystem. Thousands of tokens, mature DeFi protocols (Aave, Compound, Uniswap), wallets (MetaMask), and tools (Etherscan, Hardhat, OpenZeppelin). | Ecosystem is primarily designed for permissionless, pseudonymous use cases. Integrating institutional KYC/AML requirements is an afterthought, not a native feature. |
| **Liquidity** | Deep existing liquidity pools. Tokenized Treasuries on Ethereum (e.g., Ondo Finance OUSG, Franklin Templeton BENJI) have attracted significant AUM. | Liquidity is concentrated in a few products. Fragmentation across L1s and L2s (Ethereum, Arbitrum, Base, Polygon) complicates the picture. |
| **Composability** | Smart contracts can be composed freely. A tokenized bond could be used as collateral in Aave or traded on Uniswap without custom integration. | Open composability creates regulatory and operational risk. The issuer cannot control how tokens are used downstream. Unauthorized lending, derivatives, or dark pool trading could occur. |
| **Transparency** | Full transaction transparency on a public ledger. Anyone can verify total supply, holder distribution, and transaction history. | Transparency conflicts with institutional privacy requirements. Competitor holdings, trade strategies, and investor identities would be publicly visible (even if pseudonymous, chain analysis can de-anonymize). |
| **Developer availability** | Large pool of Solidity developers. Mature tooling and documentation. | Solidity is not purpose-built for financial contracts. Common vulnerabilities (reentrancy, integer overflow, front-running) require careful coding and extensive auditing. |
| **Cost** | Low per-transaction cost on L2s (< $0.01 on Arbitrum/Base). | Gas costs on Ethereum L1 remain volatile and can spike during congestion ($10-$100+ per transaction). L2 costs are low but add bridge trust assumptions. |

| Dimension | Public Blockchain — Solana (Pros) | Public Blockchain — Solana (Cons) |
|-----------|-----------------------------------|-----------------------------------|
| **Performance** | Very high throughput (thousands of TPS) and low latency (400ms block times). | Solana has experienced multiple extended outages (network halts) in its history, raising concerns about reliability for financial infrastructure. |
| **Cost** | Extremely low transaction costs (< $0.01). | Low cost is achieved through centralization trade-offs (high validator hardware requirements, small validator set relative to Ethereum). |
| **Growing RWA ecosystem** | Several RWA tokenization projects are building on Solana (e.g., Maple Finance, Credix). | Solana's RWA ecosystem is less mature than Ethereum's. Institutional adoption is lower. |

### Summary Assessment

Canton Network is the appropriate choice for a bank-operated RWA tokenization platform because:

1. **Privacy is non-negotiable** for institutional securities. Public blockchains cannot provide sub-transaction privacy without complex cryptographic overlays (ZK proofs, private mempools) that are not yet mature.
2. **Regulatory compliance is native** to Canton's permissioned model, not bolted on.
3. **Deterministic finality** eliminates settlement uncertainty.
4. **No gas fee volatility** provides predictable operating costs.
5. **DAML's authorization model** is purpose-built for multi-party financial contracts.

Public blockchains (Ethereum, Solana) are better suited for retail-facing tokenized products where composability with DeFi, broad wallet support, and permissionless access are priorities and where the issuer is comfortable with public transparency.

---

## 3. Omnibus Custody vs. Segregated Custody Model

### Comparison

| Dimension | Omnibus Custody (Pros) | Omnibus Custody (Cons) |
|-----------|----------------------|----------------------|
| **Operational simplicity** | Single account at DTC/Fedwire for all tokenized bonds of a given CUSIP. Fewer accounts to manage, reconcile, and report on. | Internal sub-accounting is required to track which tokens correspond to which investor's share of the omnibus pool. Errors in sub-accounting can cause reconciliation failures. |
| **Cost efficiency** | Lower per-account custody fees from DTC. Fewer SWIFT/Fedwire messages for corporate actions. | Cost savings may be offset by the need for more sophisticated internal reconciliation and sub-accounting systems. |
| **Settlement efficiency** | Netting of positions within the omnibus account can reduce gross settlement volume when multiple investors buy/sell the same bond. | Netting benefits are minimal for a tokenization platform where each mint/burn corresponds to a discrete trade, not a portfolio of offsetting positions. |
| **Flexibility** | Easier to rebalance or optimize holdings across investors. | Rebalancing creates allocation challenges — which investor's bonds are sold when the omnibus account delivers securities? FIFO/LIFO accounting becomes necessary. |

| Dimension | Segregated Custody (Pros) | Segregated Custody (Cons) |
|-----------|--------------------------|--------------------------|
| **Asset protection** | Each investor's (or each bond series') assets are held in a separate sub-account. In the event of the bank's insolvency, segregated assets are clearly identifiable as client property and not part of the bank's estate. | Higher custody costs due to per-account fees at DTC. More SWIFT/Fedwire messages for corporate actions processing. |
| **Audit clarity** | 1:1 mapping between a DTC sub-account and the corresponding on-ledger tokenized bond series. Proof-of-reserves is straightforward — account balance = token supply. | More accounts to manage, reconcile, and monitor. Operational overhead scales linearly with the number of bond series. |
| **Regulatory defensibility** | Stronger position in regulatory examinations. Segregation demonstrates clear separation of client and proprietary assets, consistent with qualified custodian obligations. | Some regulators (and auditors) may accept omnibus with adequate sub-accounting, making full segregation unnecessary for compliance. |
| **Investor confidence** | Investors (especially institutional) prefer segregated custody as it provides stronger legal protection and reduces commingling risk. | Retail or smaller investors may not understand or value the distinction, making it a selling point only for the institutional segment. |
| **Insolvency protection** | Under UCC Article 8, securities held in segregated accounts have clearer "securities entitlement" status, reducing legal risk in bankruptcy proceedings. | Legal opinions on insolvency protection can vary by jurisdiction. The bank should obtain a legal opinion regardless of custody structure. |

### Recommendation

**Use segregated sub-accounts at DTC** for each tokenized bond series (identified by CUSIP/ISIN). The additional cost and operational overhead are justified by:

- Stronger legal protection for token holders.
- Simpler proof-of-reserves.
- Superior regulatory defensibility.
- Alignment with institutional investor expectations.

For very high-volume or low-denomination bond series, a hybrid approach (omnibus with robust internal sub-accounting) may be considered with legal counsel approval.

---

## 4. On-Chain Settlement vs. Traditional T+1/T+2 Settlement

### Comparison

| Dimension | On-Chain Settlement (T+0 / Atomic) (Pros) | On-Chain Settlement (T+0 / Atomic) (Cons) |
|-----------|-------------------------------------------|-------------------------------------------|
| **Settlement speed** | Transfers of tokenized bonds on the Canton ledger settle atomically (T+0). Ownership transfer and (if integrated) payment occur in a single transaction. Eliminates counterparty risk during the settlement window. | Atomic settlement requires both legs (securities + cash) to be on-ledger simultaneously. If fiat is not tokenized (i.e., no on-ledger cash/stablecoin), the cash leg still settles via traditional rails (Fedwire/ACH), creating a mismatch. |
| **Capital efficiency** | Investors do not need to maintain margin or collateral to cover settlement risk during a T+1/T+2 window. Capital is freed immediately. | Netting benefits of batch settlement are lost. In traditional markets, NSCC/FICC net millions of trades into a much smaller number of settlement obligations. Atomic settlement means every trade settles gross, which can increase total settlement volume and cost. |
| **Operational risk** | Eliminates fails-to-deliver (FTDs) and fails-to-receive, which are significant operational risks in traditional settlement. | Introduces new operational risks: smart contract bugs, Canton node outages, or key management failures can prevent settlement entirely. There is no "manual intervention" fallback as easily as in traditional systems. |
| **Regulatory status** | SEC has moved US equities to T+1 (May 2024) and is studying T+0. On-chain T+0 settlement is directionally aligned with regulatory trends. | Regulators have not yet approved T+0 settlement for all security types. Treasury securities settled via Fedwire are already real-time (T+0), but DTC settlement for secondary market trades still follows T+1. The platform must align with whichever settlement cycle regulators require. |
| **Finality** | Canton provides deterministic finality. Once the DAML `TransferOwnership` choice is exercised, ownership has transferred. No reversals, no chargebacks. | Finality can be a disadvantage when error correction is needed. Traditional systems have established procedures for trade breaks, cancellations, and corrections. On-ledger, the escrow bank would need a `ReverseTransfer` choice, which requires the new owner's consent (they are now a signatory). |
| **Cross-border settlement** | Potential to settle cross-border transfers faster than SWIFT/correspondent banking (1-3 days). | Cross-border regulatory requirements (FX controls, tax withholding, sanctions screening) still apply and can delay effective settlement regardless of on-chain speed. |

| Dimension | Traditional Settlement T+1/T+2 (Pros) | Traditional Settlement T+1/T+2 (Cons) |
|-----------|---------------------------------------|---------------------------------------|
| **Established infrastructure** | DTC, NSCC, FICC, Euroclear, and Clearstream handle trillions of dollars daily with proven reliability. Operational procedures for exceptions, fails, and corrections are well-established. | Legacy infrastructure is decades old. Integration is complex (SWIFT messages, batch files, proprietary protocols). Modernization is slow. |
| **Netting** | Central counterparty clearing (FICC/NSCC) nets millions of trades into a small number of settlement obligations, dramatically reducing gross settlement volume and the amount of cash/securities that must move. | Netting creates a dependency on the CCP (central counterparty). CCP failure would be systemic. Netting also delays finality. |
| **Error correction** | Well-established procedures for trade breaks, DK'd trades, and corrections. DTC and FICC have formal exception processing workflows. | Error correction processes are manual, slow, and expensive. A failed trade can take days to resolve. |
| **Regulatory acceptance** | Regulators fully understand and accept traditional settlement. No novel legal questions about finality, ownership, or insolvency treatment. | Meeting regulatory expectations for faster settlement (T+0) requires industry-wide infrastructure changes that are slow to implement. |

### Recommendation

Implement **on-ledger atomic settlement for the token leg** (transfer of `TokenizedBond` ownership on Canton), while acknowledging that the **cash leg may settle via traditional payment rails** (Fedwire Funds, ACH) on a T+0 or T+1 basis. This provides:

- Immediate transfer of beneficial ownership on-ledger.
- Elimination of securities settlement risk (fails-to-deliver).
- Compatibility with existing fiat payment infrastructure.

In the future, integration of tokenized cash (bank deposits on Canton, or regulated stablecoins) could enable true atomic DVP (securities + cash) in a single Canton transaction.

---

## 5. Permissioned vs. Permissionless Approach

### Comparison

| Dimension | Permissioned (Canton Network) (Pros) | Permissioned (Canton Network) (Cons) |
|-----------|--------------------------------------|--------------------------------------|
| **Identity** | All participants are identified, KYC'd legal entities. This is a regulatory requirement for securities transactions. The identity layer is built into the network, not an optional add-on. | The identity requirement creates friction for onboarding. Every new investor must complete KYC before interacting with the platform. This limits spontaneous or anonymous participation. |
| **Compliance** | Transfer restrictions, holding period enforcement, accredited investor checks, and sanctions screening can be enforced at the protocol level (DAML contract logic). The network operator can freeze or reverse transactions if legally required. | The ability to freeze or reverse transactions means the platform is not censorship-resistant. An investor's tokens can be frozen by the escrow bank, which may concern some investors (though this is standard for regulated securities). |
| **Performance** | No proof-of-work or proof-of-stake consensus overhead. Transaction throughput is limited only by the synchronizer's sequencing capacity, which is much higher than public blockchain consensus. | Performance is bounded by the synchronizer operator's infrastructure. If the escrow bank under-provisions the synchronizer, all participants are affected. |
| **Privacy** | Canton's sub-transaction privacy ensures that parties see only what they are entitled to. Investor holdings are not publicly visible. | Privacy limits secondary market development. A potential buyer cannot see the full order book or historical trading data without being explicitly granted observer access. |
| **Governance** | Clear governance: the escrow bank operates the synchronizer, Digital Asset maintains the Canton protocol, and regulators oversee the platform. Upgrade decisions follow established change management processes. | Governance is centralized. The escrow bank has significant power over the network (operating the synchronizer, defining participant eligibility). This may concern participants who prefer decentralized governance. |

| Dimension | Permissionless (Public Blockchain) (Pros) | Permissionless (Public Blockchain) (Cons) |
|-----------|------------------------------------------|------------------------------------------|
| **Open access** | Anyone with a wallet can participate. No onboarding friction. Maximizes the potential investor base. | Open access conflicts with securities regulation. Offering unregistered securities to non-accredited, non-KYC'd investors violates SEC rules. Permissionless access must be restricted at the smart contract level (allowlists), which partially negates the benefit. |
| **Composability** | Tokenized bonds can interact with any other smart contract on the chain. DeFi composability enables novel use cases: collateralized lending (Aave/Compound), automated market making, structured products. | Composability is a double-edged sword. Unauthorized use of tokenized bonds as collateral, in derivatives, or in unregulated lending protocols creates legal, regulatory, and reputational risk for the issuer and custodian. |
| **Censorship resistance** | No single party can prevent a valid transaction from being included in a block (in practice, MEV and validator centralization weaken this property on Ethereum). | Censorship resistance is undesirable for regulated securities. The bank must be able to freeze tokens for sanctions compliance, legal holds, and court orders. A truly censorship-resistant platform cannot comply with these requirements. |
| **Community and network effects** | Large existing user base, developer community, and institutional interest (BlackRock BUIDL on Ethereum). | Community expectations (transparency, permissionlessness, decentralization) may conflict with the bank's regulatory obligations and risk management practices. |
| **Self-custody** | Investors hold their own private keys (MetaMask, Ledger). No reliance on a custodian for access to their tokens. | Self-custody transfers key management risk to the investor. Lost keys mean lost assets, with no recovery mechanism. Institutional investors typically prefer custodial solutions. Regulatory requirements for qualified custodians may make self-custody impractical for securities. |

### Summary Assessment

A **permissioned approach (Canton Network)** is the only viable option for a bank-operated, SEC-regulated tokenized securities platform. The regulatory requirements for investor identification, transfer restrictions, sanctions compliance, and custodian obligations are incompatible with a permissionless architecture.

The permissionless approach may be appropriate for:
- Tokenized fund shares sold under Regulation D to accredited investors, where the smart contract enforces an allowlist.
- Retail-facing products sold under a registered offering with on-chain KYC gates.
- Jurisdictions with more permissive securities regulation.

---

## 6. Build In-House vs. Use Existing Tokenization Platform

### Comparison

| Dimension | Build In-House (Pros) | Build In-House (Cons) |
|-----------|----------------------|----------------------|
| **Customization** | Full control over architecture, DAML contract design, integration patterns, and user experience. The platform can be tailored precisely to the bank's regulatory requirements, custody model, and investor base. | Every feature must be designed, built, tested, and maintained by the bank's development team. This requires deep DAML and Canton expertise, which is scarce. |
| **Intellectual property** | The bank owns all intellectual property, including DAML contracts, off-chain services, and integration adapters. This IP can become a competitive advantage or a revenue-generating product. | IP ownership comes with maintenance responsibility. Every dependency update, security patch, and Canton version upgrade must be managed internally. |
| **Integration control** | The bank can integrate directly with its existing systems (core banking, custody, payment rails, compliance) without adapting to a vendor's integration model. | Integration development is time-consuming. Building adapters for DTC, Fedwire, SWIFT, KYC providers, and market data providers from scratch requires significant engineering effort. |
| **Data sovereignty** | All data remains within the bank's infrastructure. No data sharing with a platform vendor. Full control over data residency and retention. | Data sovereignty is achievable with vendor solutions that offer on-premises or private cloud deployment, somewhat reducing this advantage. |
| **Long-term cost** | No ongoing platform licensing fees beyond Canton Enterprise. After initial development, marginal cost per tokenized bond is low. | Total cost of ownership (TCO) over 5 years may be higher than a vendor solution due to development costs ($2M-$10M+), ongoing maintenance ($1M-$3M/year), and opportunity cost of engineering resources. |
| **Time to market** | Slower. Expect 12-18 months from project kickoff to production launch for a full-featured platform. | The bank may miss market windows while building. Competitors using vendor platforms may launch sooner. |

| Dimension | Use Existing Platform (Pros) | Use Existing Platform (Cons) |
|-----------|---------------------------|---------------------------|
| **Speed to market** | Vendor platforms (e.g., Digital Asset's Daml Hub, Broadridge DLR, DTCC's Digital Securities Management platform, Securitize, Tokeny) offer pre-built tokenization workflows. Launch in 3-6 months. | Vendor platforms may not support Canton-specific features or may use a different DLT (Ethereum, Hyperledger). Ensure Canton compatibility before selecting. |
| **Reduced development risk** | The vendor has already solved common problems: DAML contract patterns, off-chain integration, key management, upgrade procedures. | The bank is dependent on the vendor's roadmap, release schedule, and support quality. If the vendor pivots or goes out of business, the bank is stranded. |
| **Compliance features** | Mature platforms include built-in compliance features: KYC integration, transfer restrictions, regulatory reporting, audit trails. These have been reviewed by multiple institutions. | Pre-built compliance features may not match the bank's specific regulatory requirements or jurisdiction. Customization may be limited. |
| **Operational support** | Vendor provides operational support, monitoring, and incident response for the platform layer. The bank's team can focus on business operations rather than infrastructure. | Operational dependency on the vendor. SLA enforcement becomes critical. The bank must trust the vendor's security practices and incident response capabilities. |
| **Cost structure** | Predictable cost: platform licensing fee (often basis points on AUM or per-transaction fee) plus implementation services. Lower upfront investment. | Ongoing licensing fees can be significant at scale. A platform charging 5 bps on $1B AUM generates $500K/year in fees. Over 5 years, this may exceed the cost of building in-house. |
| **Multi-client ecosystem** | Some vendor platforms serve multiple issuers and investors, creating a built-in network effect and secondary market liquidity. | Sharing a platform with competitors may raise concerns about data isolation, competitive intelligence, and brand differentiation. |

### Existing Platforms to Evaluate

| Platform | DLT | Focus | Notes |
|----------|-----|-------|-------|
| **Digital Asset (Daml Hub / Canton)** | Canton / DAML | Institutional, multi-asset | Native Canton platform; closest alignment with this architecture |
| **Broadridge DLR (Distributed Ledger Repo)** | DAML-based | Repo, fixed income | Used by major banks for repo settlement; DAML contracts |
| **DTCC Digital Securities Management** | Custom DLT | US securities | From the largest securities depository; deep DTC integration |
| **Securitize** | Ethereum / Avalanche | Security tokens, funds | SEC-registered transfer agent; broad asset class support |
| **Tokeny (T-REX)** | Ethereum (ERC-3643) | Compliant security tokens | European focus; ERC-3643 standard for permissioned tokens |
| **Ownera (FinP2P)** | Multi-chain | Institutional distribution | Network protocol connecting multiple tokenization platforms |
| **Figure Technologies (Provenance)** | Cosmos SDK | Loans, equities, funds | US-focused; HELOC tokenization pioneer |

### Decision Framework

| Factor | Build In-House | Use Vendor Platform |
|--------|---------------|-------------------|
| Bank has 5+ DAML developers | Favorable | Not required |
| Time to market < 6 months | Not feasible | Favorable |
| AUM expected > $5B within 3 years | Favorable (lower unit cost) | Higher licensing costs |
| Unique regulatory requirements | Favorable (full customization) | May not be supported |
| Bank wants to license platform to others | Favorable (owns IP) | Not possible |
| Bank has limited DLT expertise | High risk | Favorable |
| Canton Network is a hard requirement | Build on Canton | Ensure vendor supports Canton |

### Recommendation

For a bank with strategic commitment to RWA tokenization and the resources to invest in a 12-18 month build:

- **Build in-house on Canton** for maximum control, IP ownership, and long-term cost efficiency.
- Use **Digital Asset professional services** for the initial implementation to accelerate development and knowledge transfer.
- Plan for a **dedicated DAML/Canton engineering team** of 5-8 engineers post-launch for ongoing development and maintenance.

For a bank seeking faster time to market or with limited DLT expertise:

- **Evaluate Digital Asset's Daml Hub** or **Broadridge DLR** as the platform layer, retaining control over the custody, compliance, and investor-facing components.
- Ensure the vendor contract includes **source code escrow**, **data portability**, and **termination transition support**.

---

## 7. Comparison Summary Matrix

| Decision | Recommended Approach | Key Driver |
|----------|---------------------|------------|
| Tokenized vs. traditional securities | Tokenized (with traditional custody backing) | Programmability, efficiency, transparency |
| Canton vs. public blockchain | Canton Network | Privacy, regulatory compliance, deterministic finality |
| Omnibus vs. segregated custody | Segregated (per bond series) | Asset protection, audit clarity, regulatory defensibility |
| On-chain vs. T+1/T+2 settlement | On-chain (token leg) + traditional (cash leg) | Faster ownership transfer, reduced settlement risk |
| Permissioned vs. permissionless | Permissioned (Canton) | Regulatory compliance, identity requirements |
| Build in-house vs. vendor platform | Build in-house (with Digital Asset advisory) | Long-term cost, IP ownership, customization |

---

## Appendix A: Risk Matrix for Key Decisions

| Decision | Risk if Wrong | Reversibility | Mitigation |
|----------|-------------|---------------|------------|
| Choosing Canton over Ethereum | Lower liquidity, smaller ecosystem | Low (replatforming is expensive) | Monitor Canton ecosystem growth; design off-chain services to be DLT-agnostic where possible |
| Segregated over omnibus custody | Higher cost if token volume is low | Medium (can consolidate accounts) | Start with segregated; evaluate hybrid approach if costs become prohibitive |
| Building in-house | Delayed launch, higher cost, talent risk | Medium (can pivot to vendor) | Phase the build; launch with core features; use Digital Asset advisory to de-risk |
| T+0 on-chain settlement | Mismatch with cash leg settlement | Low (cannot easily go back to T+1 for tokens) | Clearly communicate the settlement model to investors; integrate tokenized cash when available |
