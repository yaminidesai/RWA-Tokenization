// Mock DTC (Depository Trust Company) integration.
// In production: replace with real SWIFT MT541/MT545 messages to DTC.
// TODO (production): set USE_REAL_DTC=true, provide DTC_PARTICIPANT_ID and SWIFT credentials.
//
// Real flow:
//   1. Bank sends SWIFT MT541 (Receive Free of Payment) to primary dealer
//   2. DTC settles the trade
//   3. Bank receives SWIFT MT545 (Confirmation of Settlement) from DTC
//   4. MT535 (Statement of Holdings) used for nightly reconciliation

import { v4 as uuidv4 } from 'uuid'

export interface DTCSettlementResult {
  settlementRef: string    // MT545 settlement confirmation reference
  dealerRef: string        // primary dealer trade confirmation
  fedwireImad: string      // Fedwire Securities IMAD (DVP settlement)
  settledUnits: number
  settledPrice: number     // actual per-unit price
}

// Simulate purchasing bonds from a primary dealer via DTC.
// Takes 1-2 seconds to simulate the settlement window.
export async function purchaseBondsAtDTC(
  cusip: string,
  units: number,
  maxPricePerUnit: number,
): Promise<DTCSettlementResult> {
  await delay(1500)   // simulate T+1 settlement

  const ref = uuidv4().slice(0, 8).toUpperCase()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // Simulate market price slightly below investor maximum (realistic spread)
  const actualPrice = maxPricePerUnit * 0.998

  return {
    settlementRef: `DTC-MT545-${today}-${ref}`,
    dealerRef: `DEALER-TRADE-${ref}`,
    fedwireImad: `${today}MMQFMP2P${ref.padStart(8, '0')}`,
    settledUnits: units,
    settledPrice: actualPrice,
  }
}

// Simulate redeeming bonds at DTC maturity / early redemption.
export async function redeemBondsAtDTC(
  cusip: string,
  units: number,
  faceValuePerUnit: number,
): Promise<{ redemptionRef: string; principalAmount: number; fedwireImad: string }> {
  await delay(1000)

  const ref = uuidv4().slice(0, 8).toUpperCase()
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  return {
    redemptionRef: `DTC-REDEMPTION-${today}-${ref}`,
    principalAmount: units * faceValuePerUnit,
    fedwireImad: `${today}MMQFMP2P${ref.padStart(8, '0')}`,
  }
}

// Simulate MT535 nightly position reconciliation report
export async function getHoldingsStatement(
  cusip: string,
): Promise<{ quantity: number; valuationDate: string }> {
  await delay(300)
  return {
    quantity: 0,   // real system would return actual DTC position
    valuationDate: new Date().toISOString().slice(0, 10),
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
