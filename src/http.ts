const DEFAULT_RETRY_ATTEMPTS = Number(process.env.HTTP_RETRY_ATTEMPTS ?? 3);
const DEFAULT_RETRY_BASE_MS = Number(process.env.HTTP_RETRY_BASE_MS ?? 150);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetriableStatus(status: number) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

export async function fetchWithRetry(url: string | URL, init?: RequestInit) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= DEFAULT_RETRY_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url, init);
      if (!isRetriableStatus(res.status) || attempt === DEFAULT_RETRY_ATTEMPTS) return res;
    } catch (error) {
      lastError = error;
      if (attempt === DEFAULT_RETRY_ATTEMPTS) throw error;
    }

    const backoff = DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1);
    await sleep(backoff);
  }

  throw lastError instanceof Error ? lastError : new Error("http request failed");
}
