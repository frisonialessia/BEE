/** Shared API transport types for the BEE frontend client. */

export interface FetchResult<T> {
  data: T;
  /** True when served by the live API; false when using offline sample data. */
  live: boolean;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
