export class ServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'ServiceError';
    this.status = status;
    this.code = code;
  }
}

export class ProviderError extends Error {
  constructor(message, { retryable = true, status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = retryable;
    this.status = status;
  }
}

export const isRetryableStatus = (s) => s === 408 || s === 425 || s === 429 || s >= 500;
