export interface FileMeta {
  path: string;
  size: number;
  mtime: number;
  isDir: boolean;
}

export interface TreeResponse {
  entries: FileMeta[];
}

export interface PutResult {
  ok: true;
  mtime: number;
  size: number;
}

export class FileApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
  }
}

async function request(input: RequestInfo, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (!res.ok) {
    let code: string | undefined;
    let message = `HTTP ${res.status}`;
    try {
      const body = (await res.clone().json()) as { error?: string; message?: string };
      code = body.error;
      if (body.message) message = body.message;
      else if (body.error) message = body.error;
    } catch {
      // Body was not JSON; fall through with default message.
    }
    throw new FileApiError(message, res.status, code);
  }
  return res;
}

export async function getTree(): Promise<FileMeta[]> {
  const res = await request('/api/tree');
  const body = (await res.json()) as TreeResponse;
  return body.entries;
}

export async function getFile(path: string): Promise<{ content: string; mtime: number }> {
  const res = await request(`/api/file?path=${encodeURIComponent(path)}`);
  const content = await res.text();
  const mtime = Number(res.headers.get('x-mtime') ?? 0);
  return { content, mtime };
}

export async function putFile(path: string, content: string): Promise<PutResult> {
  const res = await request(`/api/file?path=${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { 'content-type': 'text/markdown' },
    body: content
  });
  return (await res.json()) as PutResult;
}

export async function deleteFile(path: string): Promise<void> {
  await request(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' });
}

export async function moveFile(from: string, to: string): Promise<void> {
  await request('/api/move', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ from, to })
  });
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await getFile(path);
    return true;
  } catch (err) {
    if (err instanceof FileApiError && err.status === 404) return false;
    throw err;
  }
}
