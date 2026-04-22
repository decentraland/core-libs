import signedHeaderFactory, { SignedHeaderFactoryOptions } from './signedHeaderFactory'
import { SignedRequestInfo, SignedRequestInit } from './types'
import { getImplementation } from './utils'

export type SignedFetchFactoryOptions = SignedHeaderFactoryOptions & {
  URL?: typeof URL
  Request?: typeof Request
  fetch?: typeof fetch
}

export default function signedFetchFactory(options: SignedFetchFactoryOptions = {}) {
  const signedHeader = signedHeaderFactory(options)
  const URLImpl = getImplementation(options, 'URL')
  const RequestImpl = getImplementation(options, 'Request')
  const fetchImpl = getImplementation(options, 'fetch')

  return function signedFetch(input: SignedRequestInfo, init?: SignedRequestInit | undefined) {
    if (init && init.identity) {
      const { identity, metadata, ...originalInit } = init

      if (
        typeof input === 'string' ||
        input instanceof URLImpl ||
        (globalThis.URL && input instanceof globalThis.URL)
      ) {
        const url = typeof input === 'string' ? new URLImpl(input) : input
        const request = new RequestImpl(url.toString(), {
          ...originalInit,
          headers: signedHeader(
            identity,
            init.method || 'GET',
            url.pathname,
            metadata || {},
            originalInit?.headers
          )
        })

        return fetchImpl(request)
      }

      const url = new URLImpl(input.url)
      const request = new RequestImpl(input)
      const headers = signedHeader(identity, input.method || 'GET', url.pathname, metadata || {})

      headers.forEach((value, key) => {
        request.headers.set(key, value)
      })

      return fetchImpl(request)
    }

    return fetchImpl(input, init)
  }
}
