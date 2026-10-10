export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorBody(code: string, message: string, requestId: string, details?: unknown) {
  return {
    error: details === undefined ? { code, message } : { code, message, details },
    requestId,
  };
}
