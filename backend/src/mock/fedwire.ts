// Mock Fedwire funds transfer service.
// In production: replace with real Fedwire API calls via your Fed account.
// TODO (production): set USE_REAL_FEDWIRE=true, provide FEDWIRE_ROUTING_NUMBER + FEDWIRE_ACCOUNT_NUMBER
//
// Fedwire is used for:
//   - Paying investors coupon distributions (ACH for smaller amounts, Fedwire for large)
//   - Receiving principal proceeds on bond redemptions
//   - DVP settlement of bond purchases (Fedwire Securities)

import { v4 as uuidv4 } from 'uuid'

export interface FedwireTransferResult {
  imad: string           // Input Message Accountability Data (unique per wire)
  omad: string           // Output Message Accountability Data
  amount: number
  currency: string
  status: 'completed'
}

// Simulate sending a Fedwire funds transfer to an investor
export async function sendFedwireTransfer(
  recipientAccountRef: string,
  amount: number,
  currency: string,
  memo: string,
): Promise<FedwireTransferResult> {
  await delay(800)

  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const seq = uuidv4().slice(0, 8).toUpperCase()

  return {
    imad: `${today}BANKUS33${seq}`,
    omad: `${today}FEDWIRE${seq}`,
    amount,
    currency,
    status: 'completed',
  }
}

// Simulate ACH payment (used for smaller coupon amounts)
export async function sendACHPayment(
  recipientAccountRef: string,
  amount: number,
  memo: string,
): Promise<{ traceNumber: string; status: 'completed' }> {
  await delay(400)

  const trace = uuidv4().replace(/-/g, '').slice(0, 15).toUpperCase()
  return { traceNumber: `ACH-${trace}`, status: 'completed' }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
