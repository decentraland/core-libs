import { calculateDeploymentSize } from '../../../src/validations'
import { buildDeployment } from '../../setup/deployments'
import { buildEntity } from '../../setup/entity'
import { buildExternalCalls } from '../../setup/mock'
import type { DeploymentToValidate } from '../../../src/types'

describe('when calculating the deployment size', () => {
  let deployment: DeploymentToValidate

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('and all content files were uploaded with the deployment', () => {
    let fetchContentFileSize: jest.Mock
    let result: number | string

    beforeEach(async () => {
      deployment = buildDeployment({
        files: new Map<string, Uint8Array>([
          ['hashA', Buffer.alloc(10)],
          ['hashB', Buffer.alloc(25)]
        ]),
        entity: buildEntity({
          content: [
            { file: 'a.png', hash: 'hashA' },
            { file: 'b.png', hash: 'hashB' }
          ]
        })
      })
      fetchContentFileSize = jest.fn()
      result = await calculateDeploymentSize(deployment, buildExternalCalls({ fetchContentFileSize }))
    })

    it('should sum the byte length of the uploaded files', () => {
      expect(result).toBe(35)
    })

    it('should not fetch any file size from storage', () => {
      expect(fetchContentFileSize).not.toHaveBeenCalled()
    })
  })

  describe('and some content files are not uploaded and must be fetched from storage', () => {
    const contentHashes = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6']
    let inFlight: number
    let maxInFlight: number
    let fetchContentFileSize: jest.Mock

    beforeEach(() => {
      inFlight = 0
      maxInFlight = 0
      // Track the peak number of simultaneous in-flight fetches: increment on entry, yield (so batched
      // fetches overlap), then decrement — so maxInFlight reflects the concurrency the loop allowed.
      fetchContentFileSize = jest.fn(async (_hash: string) => {
        inFlight++
        maxInFlight = Math.max(maxInFlight, inFlight)
        await new Promise((resolve) => setTimeout(resolve, 5))
        inFlight--
        return 100
      })
      deployment = buildDeployment({
        files: new Map(),
        entity: buildEntity({ content: contentHashes.map((hash, i) => ({ file: `f${i}.png`, hash })) })
      })
    })

    describe('and no fetch concurrency is configured', () => {
      let result: number | string

      beforeEach(async () => {
        result = await calculateDeploymentSize(deployment, buildExternalCalls({ fetchContentFileSize }))
      })

      it('should fetch the size of every not-uploaded file', () => {
        expect(fetchContentFileSize).toHaveBeenCalledTimes(contentHashes.length)
      })

      it('should fetch them one at a time by default', () => {
        expect(maxInFlight).toBe(1)
      })

      it('should return the summed size of all files', () => {
        expect(result).toBe(contentHashes.length * 100)
      })
    })

    describe('and a fetch concurrency greater than one is configured', () => {
      let result: number | string

      beforeEach(async () => {
        result = await calculateDeploymentSize(
          deployment,
          buildExternalCalls({ fetchContentFileSize, fetchContentFileSizeConcurrency: 3 })
        )
      })

      it('should fetch no more than the configured number of files at a time', () => {
        expect(maxInFlight).toBe(3)
      })

      it('should still return the summed size of all files', () => {
        expect(result).toBe(contentHashes.length * 100)
      })
    })

    describe('and the configured concurrency is larger than the number of files', () => {
      beforeEach(async () => {
        await calculateDeploymentSize(
          deployment,
          buildExternalCalls({ fetchContentFileSize, fetchContentFileSizeConcurrency: 100 })
        )
      })

      it('should not fetch more files than there are', () => {
        expect(maxInFlight).toBe(contentHashes.length)
      })
    })
  })

  describe('and a content file cannot be found in storage', () => {
    let result: number | string

    beforeEach(async () => {
      const fetchContentFileSize = jest.fn(async (hash: string) => (hash === 'h2' ? undefined : 100))
      deployment = buildDeployment({
        files: new Map(),
        entity: buildEntity({
          content: [
            { file: 'a.png', hash: 'h1' },
            { file: 'b.png', hash: 'h2' }
          ]
        })
      })
      result = await calculateDeploymentSize(deployment, buildExternalCalls({ fetchContentFileSize }))
    })

    it('should return an error naming the missing hash', () => {
      expect(result).toBe("Couldn't fetch content file with hash: h2")
    })
  })
})
