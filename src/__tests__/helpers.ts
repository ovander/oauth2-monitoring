// Build a minimal fake JWT (not cryptographically valid, but structurally correct)
export function makeJwt(payload: Record<string, unknown>): string {
  const encode = (obj: unknown) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
  const header = encode({ alg: 'RS256', typ: 'JWT' })
  const body = encode(payload)
  return `${header}.${body}.fakesig`
}

// Build a minimal mock Response
export function mockResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers }
  })
}

export function mockErrorResponse(status: number, errorBody = { error: 'error', error_description: 'An error occurred' }): Response {
  return mockResponse(errorBody, status)
}
