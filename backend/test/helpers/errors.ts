/** Ejecuta fn y devuelve lo que lance (o undefined). Sirve para afirmar `code` de AppError. */
export function thrown(fn: () => unknown): any {
  try {
    fn()
  } catch (e) {
    return e
  }
  return undefined
}

export async function rejected(p: Promise<unknown> | (() => Promise<unknown>)): Promise<any> {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    return e
  }
  return undefined
}
