// Custom error class for YAPI specific errors
export class YapiError extends Error {
  constructor(message: string, public readonly errcode?: number, public readonly status?: number, public readonly responseBody?: any) {
    super(message);
    this.name = 'YapiError';
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, YapiError);
    }
  }
}

// Custom error for configuration issues
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ConfigurationError);
    }
  }
}

// Type guard to check for YapiError
export function isYapiError(error: unknown): error is YapiError {
  return error instanceof YapiError;
}