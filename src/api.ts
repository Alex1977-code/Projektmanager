import { CLIENT_ID, IS_HOSTED } from './hosted';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  if (IS_HOSTED) {
    const { localRequest } = await import('./local/backend');
    try {
      return (await localRequest(method, url, body)) as T;
    } catch (e) {
      const err = e as Error & { status?: number };
      throw new ApiError(err.status || 500, err.message);
    }
  }
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { 'X-Requested-With': 'projektmanager', 'X-Client-Id': CLIENT_ID, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Server nicht erreichbar. Bitte Verbindung prüfen.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (res.status === 401 && !url.startsWith('/api/auth/')) window.dispatchEvent(new Event('pm:unauthorized'));
  if (!res.ok) throw new ApiError(res.status, data?.error || `Fehler ${res.status}`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
};
