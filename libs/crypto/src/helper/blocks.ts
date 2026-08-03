import { toNumber } from '../eth/hex'
import type { BlockIdentifier, EthClient } from '../eth/rpc'

export interface SavedBlock {
  number: number
  timestamp: number
}

export interface BlockResponse {
  block: number
  timestamp: number
}

export default class Blocks {
  checkedBlocks: { [key: string]: number[] }
  saveBlocks: boolean
  savedBlocks: { [key: string]: SavedBlock }
  requests: number
  blockTime?: number
  firstTimestamp?: number

  constructor(
    private requestManager: EthClient,
    save = true
  ) {
    this.checkedBlocks = {}
    this.saveBlocks = save
    this.savedBlocks = {}
    this.requests = 0
  }

  async fillBlockTime(): Promise<{ blockTime: number; firstTimestamp: number }> {
    const latest = await this.getBlockWrapper('latest')
    const first = await this.getBlockWrapper(1)

    this.blockTime = (latest.timestamp - first.timestamp) / (Number(latest.number) - 1)
    this.firstTimestamp = first.timestamp
    return { blockTime: this.blockTime, firstTimestamp: this.firstTimestamp }
  }

  async getDate(date: number, after = true): Promise<BlockResponse> {
    const dateInSeconds = date / 1000
    const now = Date.now() / 1000

    let firstTimestamp = this.firstTimestamp
    let blockTime = this.blockTime
    if (firstTimestamp === undefined || blockTime === undefined) {
      ;({ firstTimestamp, blockTime } = await this.fillBlockTime())
    }

    if (dateInSeconds < firstTimestamp) {
      return {
        block: 1,
        timestamp: dateInSeconds
      }
    }

    const latestCached = this.savedBlocks['latest']
    if (dateInSeconds >= now || (latestCached && dateInSeconds > latestCached.timestamp)) {
      return {
        block: toNumber(await this.requestManager.eth_blockNumber()),
        timestamp: dateInSeconds
      }
    }

    this.checkedBlocks[dateInSeconds] = []

    const predictedBlock = await this.getBlockWrapper(Math.ceil((dateInSeconds - firstTimestamp) / blockTime))

    return {
      block: await this.findBetter(dateInSeconds, predictedBlock, after, blockTime),
      timestamp: dateInSeconds
    }
  }

  async findBetter(date: number, predictedBlock: SavedBlock, after: boolean, blockTime?: number): Promise<number> {
    let effectiveBlockTime = blockTime ?? this.blockTime ?? (await this.fillBlockTime()).blockTime
    if (await this.isBetterBlock(date, predictedBlock, after)) {
      return predictedBlock.number
    }

    const difference = date - predictedBlock.timestamp
    let skip = Math.ceil(difference / effectiveBlockTime)

    if (skip === 0) {
      skip = difference < 0 ? -1 : 1
    }

    const nextPredictedBlock = await this.getBlockWrapper(this.getNextBlock(date, predictedBlock.number, skip))

    effectiveBlockTime = Math.abs(
      (predictedBlock.timestamp - nextPredictedBlock.timestamp) / (predictedBlock.number - nextPredictedBlock.number)
    )

    return this.findBetter(date, nextPredictedBlock, after, effectiveBlockTime)
  }

  async isBetterBlock(date: number, predictedBlock: SavedBlock, after: boolean): Promise<boolean> {
    const blockTime = predictedBlock.timestamp

    if (after) {
      if (blockTime < date) {
        return false
      }

      const previousBlock = await this.getBlockWrapper(predictedBlock.number - 1)

      if (blockTime >= date && previousBlock.timestamp < date) {
        return true
      }
    } else {
      if (blockTime >= date) {
        return false
      }

      const nextBlock = await this.getBlockWrapper(predictedBlock.number + 1)
      if (blockTime < date && nextBlock.timestamp >= date) {
        return true
      }
    }

    return false
  }

  getNextBlock(date: number, currentBlock: number, skip: number): number {
    const nextBlock = currentBlock + skip

    if (this.checkedBlocks[date].includes(nextBlock)) {
      const newSkip = skip < 0 ? skip + 1 : skip - 1
      if (newSkip === 0) {
        throw new Error(`Could not find an unchecked block for timestamp ${date}`)
      }
      return this.getNextBlock(date, currentBlock, newSkip)
    }

    this.checkedBlocks[date].push(nextBlock)

    return nextBlock
  }

  async getBlockWrapper(block: BlockIdentifier): Promise<SavedBlock> {
    if (!this.saveBlocks) {
      const fetchedBlock = await this.requestManager.eth_getBlockByNumber(block, false)
      return {
        number: toNumber(fetchedBlock.number),
        timestamp: toNumber(fetchedBlock.timestamp)
      }
    }

    const key = block.toString()

    if (this.savedBlocks[key]) {
      return this.savedBlocks[key]
    }

    if (typeof block === 'number' && this.savedBlocks['latest'] && this.savedBlocks['latest'].number <= block) {
      return this.savedBlocks['latest']
    }

    const { timestamp } = await this.requestManager.eth_getBlockByNumber(block, false)

    this.savedBlocks[key] = {
      number: toNumber(block === 'latest' ? await this.requestManager.eth_blockNumber() : block),
      timestamp: toNumber(timestamp)
    }

    this.requests++

    return this.savedBlocks[key]
  }
}
