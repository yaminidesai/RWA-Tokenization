# RWA Tokenization Platform on Canton Network

go## Platform Documentation Index

This documentation suite provides the foundational design, regulatory analysis, and technical requirements for building a Real-World Asset (RWA) tokenization platform on the Canton Network. It is intended for use by bank legal/compliance teams, technology leadership, and the development team responsible for implementation.

---

### Documents

| #   | Document                                                                 | Audience                             | Description                                                                                                                                                            |
| --- | ------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [Bank Securities Account Setup](./01-bank-securities-account-setup.md)   | Operations, Legal, Compliance        | How banks establish accounts with securities issuers, custodians, and clearing infrastructure (Treasury Direct, DTC/DTCC, Euroclear, Clearstream, primary dealers).    |
| 2   | [Bank Requirements](./02-bank-requirements.md)                           | Legal, Compliance, Board             | Regulatory licensing, capital adequacy, cybersecurity, qualified custodian obligations, and governance requirements the bank must satisfy to operate this platform.    |
| 3   | [Developer Requirements](./03-developer-requirements.md)                 | Engineering, InfoSec, DevOps         | Technical and compliance requirements for developers: Canton node setup, DAML contract standards, key management, testing, deployment, and incident response.          |
| 4   | [Platform Architecture Overview](./04-platform-architecture-overview.md) | Engineering, Product, Compliance     | High-level system architecture: Canton node topology, DAML contract modules, off-chain services, participant roles, token lifecycle, and legacy integration points.    |
| 5   | [Pros and Cons Analysis](./05-pros-cons-analysis.md)                     | Executive Leadership, Product, Legal | Side-by-side comparison tables covering tokenized vs. traditional securities, Canton vs. public blockchains, custody models, settlement approaches, and build vs. buy. |

---

### How to Use This Documentation

1. **Executive sponsors and board members** should start with [Document 5 (Pros/Cons Analysis)](./05-pros-cons-analysis.md) for strategic decision context, then review [Document 2 (Bank Requirements)](./02-bank-requirements.md) for regulatory obligations.

2. **Legal and compliance teams** should review Documents 1, 2, and 5 in sequence to understand the full regulatory landscape, account setup procedures, and trade-offs involved.

3. **Engineering and product teams** should review [Document 4 (Architecture Overview)](./04-platform-architecture-overview.md) first for the system design, then [Document 3 (Developer Requirements)](./03-developer-requirements.md) for implementation standards.

4. **Operations teams** should start with [Document 1 (Securities Account Setup)](./01-bank-securities-account-setup.md) for custody and clearing infrastructure details.

---

### Scope and Assumptions

- **Target asset class**: US Treasury securities (T-Bills, T-Notes, T-Bonds, TIPS, FRNs) as the initial asset class, with the architecture designed to extend to corporate bonds, municipal bonds, and other fixed-income instruments.
- **Distributed ledger**: Canton Network (permissioned, sub-transaction privacy, DAML smart contracts).
- **Jurisdictions**: Primarily US-regulated entities, with provisions for cross-border distribution under Regulation S.
- **Custody model**: The operating bank acts as qualified custodian, holding underlying securities in segregated or omnibus accounts at DTC or via a Federal Reserve Bank account.
- **Investor types**: Institutional investors, accredited investors, and (where regulation permits) qualified retail investors.

---

### Version History

| Version | Date       | Author                     | Changes                             |
| ------- | ---------- | -------------------------- | ----------------------------------- |
| 0.1     | 2026-03-16 | Platform Architecture Team | Initial draft of all five documents |
