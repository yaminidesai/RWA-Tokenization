// Mock Jumio KYC verification service.
// In production: replace with real Jumio REST API calls.
// Jumio docs: https://docs.jumio.com
// TODO (production): set USE_REAL_JUMIO=true and provide JUMIO_API_TOKEN + JUMIO_API_SECRET

import { v4 as uuidv4 } from 'uuid'

export interface JumioVerificationResult {
  reference: string
  amlCleared: boolean
  sanctionsCleared: boolean
  identityVerified: boolean
  rejectionReason?: string
}

// Simulate KYC verification for an investor.
// In a real system, this would:
//   1. POST to Jumio to create a verification workflow
//   2. Return a redirect URL to the Jumio identity capture page
//   3. Receive a webhook callback when verification completes
//   4. Call Jumio to retrieve the final decision

export async function runKYCVerification(
  fullName: string,
  jurisdiction: string,
): Promise<JumioVerificationResult> {
  // Simulate network delay
  await delay(500)

  const reference = `JUMIO-MOCK-${uuidv4().slice(0, 8).toUpperCase()}`

  // In mock mode, everyone passes unless their name contains "FAIL" (for testing)
  const shouldFail = fullName.toUpperCase().includes('FAIL')

  if (shouldFail) {
    return {
      reference,
      amlCleared: false,
      sanctionsCleared: false,
      identityVerified: false,
      rejectionReason: 'Identity verification failed (mock)',
    }
  }

  return {
    reference,
    amlCleared: true,
    sanctionsCleared: true,
    identityVerified: true,
  }
}

// Simulate OFAC sanctions screening
export async function runOFACScreening(fullName: string): Promise<{ cleared: boolean; reference: string }> {
  await delay(200)
  const reference = `OFAC-MOCK-${uuidv4().slice(0, 8).toUpperCase()}`
  const onWatchlist = fullName.toUpperCase().includes('SANCTIONED')
  return { cleared: !onWatchlist, reference }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
