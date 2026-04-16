const SW_BASE = 'https://secure.splitwise.com/api/v3.0';

export async function POST(req: Request) {
  try {
    const { endpoint, method = 'GET', apiKey, payload } = await req.json();

    if (!endpoint || !apiKey) {
      return Response.json({ error: 'missing_params' }, { status: 400 });
    }

    const url = `${SW_BASE}/${endpoint}`;
    const isGet = method === 'GET';

    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      ...(isGet ? {} : { body: JSON.stringify(payload ?? {}) }),
    });

    const data = await res.json();

    if (res.status === 401) {
      return Response.json({ error: 'invalid_key', message: 'Invalid API key' }, { status: 401 });
    }

    if (!res.ok) {
      return Response.json(
        { error: 'splitwise_error', message: data?.error ?? 'Splitwise request failed' },
        { status: res.status }
      );
    }

    return Response.json(data);
  } catch {
    return Response.json({ error: 'proxy_error', message: 'Failed to reach Splitwise' }, { status: 502 });
  }
}
