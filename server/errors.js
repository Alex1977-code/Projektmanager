export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const ANONYMOUS_ADMIN = Object.freeze({ employeeId: null, role: 'admin', name: 'Ohne Anmeldung', username: '', anonymous: true });
