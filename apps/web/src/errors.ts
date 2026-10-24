/** Errors that map to a client response. Messages are generic by design: no internals, no PHI. */
export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
