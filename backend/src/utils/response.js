// 统一响应格式，见 CLAUDE.md：{ success, data, error }
export function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data, error: null });
}

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
