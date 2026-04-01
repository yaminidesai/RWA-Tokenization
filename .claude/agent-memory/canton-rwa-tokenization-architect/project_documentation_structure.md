---
name: Platform documentation structure and scope
description: RWA tokenization platform documentation suite covering bank account setup, regulatory requirements, developer requirements, architecture, and pros/cons analysis — created as pre-build foundational design documents
type: project
---

The platform documentation suite was created in /docs/ with 6 files as foundational design/requirements documents BEFORE building the actual platform. Target asset class is US Treasury securities on Canton Network.

**Why:** The user requested comprehensive pre-build documentation suitable for both legal/compliance and engineering teams to reference during implementation.

**How to apply:** When building DAML contracts or platform code, reference these docs for architectural decisions (segregated custody, Canton over public chain, permissioned model), participant roles (escrow bank, bond issuer, treasury provider, regulator, investor), and the specific signatory/observer patterns documented in 04-platform-architecture-overview.md.
