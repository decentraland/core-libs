import type { IHttpServerComponent } from '@well-known-components/interfaces'
import { InvalidRequestError } from '../errors'

export async function parseJson<T>(request: IHttpServerComponent.IRequest): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new InvalidRequestError('Invalid body')
  }
}
