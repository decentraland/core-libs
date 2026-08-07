import { randomBytes } from 'crypto'

/**
 * Generates a random Ethereum-like wallet address
 * @returns A random address starting with '0x' followed by 40 hex characters
 */
export function generateRandomWalletAddress(): string {
  const randomBytesBuffer = randomBytes(20)
  return '0x' + randomBytesBuffer.toString('hex')
}

/**
 * Generates multiple random Ethereum-like wallet addresses
 * @param count Number of addresses to generate
 * @returns Array of random addresses
 */
export function generateRandomWalletAddresses(count: number): string[] {
  return Array.from({ length: count }, () => generateRandomWalletAddress())
}
