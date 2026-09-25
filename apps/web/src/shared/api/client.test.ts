import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, get, post, rememberStepUp, setStepUpHandler } from './client';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  setStepUpHandler(null);
});

describe('api client', () => {
  it('sends the CSRF header and never an Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await post('/me', { locale: 'kk' });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers['X-Requested-With']).toBe('ortaq-web');
    expect(init.headers.Authorization).toBeUndefined();
    expect(init.credentials).toBe('same-origin');
  });

  it('on 428 asks for step-up and retries with the token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(428, { error: { code: 'STEP_UP_REQUIRED', message: '' } }))
      .mockResolvedValueOnce(json(201, { id: 'org' }));
    vi.stubGlobal('fetch', fetchMock);
    setStepUpHandler(async () => {
      rememberStepUp('step-token', new Date(Date.now() + 300_000).toISOString());
      return 'step-token';
    });
    await expect(post('/admin/organizations', {})).resolves.toEqual({ id: 'org' });
    expect(fetchMock.mock.calls[1]![1].headers['X-Step-Up-Token']).toBe('step-token');
  });

  it('on 401 refreshes the session once and retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: '' } }))
      .mockResolvedValueOnce(json(200, {}))
      .mockResolvedValueOnce(json(200, { id: 'me' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(get('/me')).resolves.toEqual({ id: 'me' });
    expect(fetchMock.mock.calls[1]![0]).toBe('/v1/auth/refresh');
  });

  it('maps the error body to ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json(409, { error: { code: 'ORGANIZATION_BIN_TAKEN', message: 'taken' } })),
    );
    await expect(post('/admin/organizations', {})).rejects.toMatchObject(
      new ApiError(409, 'ORGANIZATION_BIN_TAKEN', 'taken'),
    );
  });
});
