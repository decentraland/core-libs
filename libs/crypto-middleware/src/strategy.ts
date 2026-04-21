import type { Request } from 'express'
import { Strategy } from 'passport-strategy'
import RequestError from './errors'
import { Options } from './types'
import verify from './verify'

export class DecentralandStrategy extends Strategy {
  name = 'decentraland'

  constructor(private options: Options = {}) {
    super()
  }

  async authenticate(req: Request, options: Options = {}) {
    const merged = { ...this.options, ...options }
    try {
      const data = await verify(req.method, req.baseUrl + req.path, req.headers, merged)
      Object.assign(req, data)
      this.pass()
    } catch (err: any) {
      const requestError = err as RequestError
      if (!merged.optional) {
        this.fail(requestError.message, requestError.statusCode)
      } else {
        this.pass()
      }
    }
  }
}
