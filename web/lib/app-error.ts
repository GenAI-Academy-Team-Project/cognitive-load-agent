export class AppError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
