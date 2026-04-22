import { Strategy } from 'passport-strategy'
import RequestError from './errors'
import verify from './verify'
import type { Options } from './types'
import type { Request } from 'express'

export class DecentralandStrategy extends Strategy {
  name = 'decentraland'

  constructor(private options: Options = {}) {
    super()
  }

  async authenticate(req: Request, options: Options = {}): Promise<void> {
    const merged = { ...this.options, ...options }
    try {
      const data = await verify(req.method, req.baseUrl + req.path, req.headers, merged)
      Object.assign(req, data)
      this.pass()
    } catch (err) {
      if (merged.optional) {
        this.pass()
        return
      }
      if (err instanceof RequestError) {
        this.fail(err.message, err.statusCode)
      } else {
        this.error(err instanceof Error ? err : new Error(String(err)))
      }
    }
  }
}
