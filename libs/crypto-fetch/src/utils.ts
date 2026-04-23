type Global = typeof globalThis

export function getImplementation<K extends keyof Global>(options: Partial<Global>, key: K): Global[K] {
  const result = options[key] ?? globalThis[key]
  if (!result) {
    throw new ReferenceError(`"${String(key)}" is not defined`)
  }

  return result
}
