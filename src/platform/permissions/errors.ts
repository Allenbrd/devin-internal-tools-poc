export class UnauthenticatedError extends Error {
  readonly status = 401;
  constructor() {
    super("Authentication required");
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(readonly permission: string) {
    super(`Missing permission "${permission}"`);
    this.name = "ForbiddenError";
  }
}
