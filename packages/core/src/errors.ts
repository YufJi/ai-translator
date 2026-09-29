export type TranslatorErrorCode =
  | "config_invalid"
  | "provider_not_found"
  | "provider_unavailable"
  | "auth_failed"
  | "rate_limited"
  | "timeout"
  | "network_error"
  | "bad_request"
  | "server_error"
  | "empty_response"
  | "aborted"
  | "unsupported_language"
  | "unknown";

export class TranslatorError extends Error {
  readonly code: TranslatorErrorCode;
  readonly status?: number;
  readonly providerId?: string;
  readonly retryable: boolean;
  override readonly cause?: unknown;

  constructor(
    code: TranslatorErrorCode,
    message: string,
    options: {
      status?: number;
      providerId?: string;
      retryable?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message);
    this.name = "TranslatorError";
    this.code = code;
    this.status = options.status;
    this.providerId = options.providerId;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
    this.cause = options.cause;
  }

  static fromStatus(status: number, message: string, providerId?: string): TranslatorError {
    const code: TranslatorErrorCode =
      status === 401 || status === 403
        ? "auth_failed"
        : status === 429
          ? "rate_limited"
          : status === 408 || status === 504
            ? "timeout"
            : status >= 500
              ? "server_error"
              : status >= 400
                ? "bad_request"
                : "unknown";
    return new TranslatorError(code, message, { status, providerId });
  }

  static aborted(providerId?: string): TranslatorError {
    return new TranslatorError("aborted", "Translation request was aborted", { providerId });
  }
}

const RETRYABLE = new Set<TranslatorErrorCode>([
  "rate_limited",
  "timeout",
  "network_error",
  "server_error",
  "provider_unavailable",
]);

export function isTranslatorError(value: unknown): value is TranslatorError {
  return value instanceof TranslatorError;
}

export function toTranslatorError(error: unknown, providerId?: string): TranslatorError {
  if (isTranslatorError(error)) return error;
  if (error instanceof Error) {
    if (error.name === "AbortError") return TranslatorError.aborted(providerId);
    const code: TranslatorErrorCode = error.name === "TimeoutError" ? "timeout" : "network_error";
    return new TranslatorError(code, error.message, { providerId, cause: error });
  }
  return new TranslatorError("unknown", String(error), { providerId, cause: error });
}

