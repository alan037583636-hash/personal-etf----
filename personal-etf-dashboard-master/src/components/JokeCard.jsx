import { useEffect, useState } from 'react';

const JOKE_API_URL =
  'https://raw.githubusercontent.com/alan037583636-hash/yt-joke-scraper/main/latest_joke.json';

/**
 * @typedef {{ timestamp?: string | number, joke_text: string }} Joke
 * @typedef {{ fetch_date?: string, video_id?: string, jokes: Joke[] }} JokeData
 */

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function parseJokeData(value) {
  if (!isRecord(value)) {
    throw new Error('每日皓金句資料格式不正確。');
  }

  if (value.has_joke === false) return null;

  const rawJokes = Array.isArray(value.jokes)
    ? value.jokes
    : typeof value.joke_text === 'string'
      ? [value]
      : [];
  const jokes = rawJokes.filter(
    (joke) => isRecord(joke) && typeof joke.joke_text === 'string' && joke.joke_text.trim()
  );

  if (jokes.length === 0) return null;

  return {
    fetch_date: typeof value.fetch_date === 'string' ? value.fetch_date : '',
    video_id: typeof value.video_id === 'string' ? value.video_id : '',
    jokes,
  };
}

function timestampToSeconds(timestamp) {
  if (typeof timestamp === 'number') {
    return Number.isFinite(timestamp) && timestamp >= 0 ? Math.floor(timestamp) : null;
  }

  if (typeof timestamp !== 'string' || !timestamp.trim()) return null;
  const parts = timestamp.trim().split(':');
  if ((parts.length !== 2 && parts.length !== 3) || parts.some((part) => !/^\d+$/.test(part))) {
    return null;
  }

  const numbers = parts.map(Number);
  if (numbers.slice(1).some((part) => part >= 60)) return null;

  return numbers.reduce((seconds, part) => seconds * 60 + part, 0);
}

export function JokeCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function fetchJoke() {
      try {
        const response = await fetch(`${JOKE_API_URL}?t=${new Date().getTime()}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error(`每日皓金句載入失敗（HTTP ${response.status}）。`);
        }

        const payload = await response.json();
        setData(parseJokeData(payload));
      } catch (requestError) {
        if (requestError instanceof Error && requestError.name === 'AbortError') return;
        console.error('每日皓金句載入失敗:', requestError);
        setError(requestError instanceof Error ? requestError.message : '每日皓金句載入失敗。');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void fetchJoke();
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <section
        aria-label="每日皓哥金句載入中"
        className="bg-yellow-50 p-5 rounded-xl border border-yellow-200 shadow-sm"
      >
        <p className="text-sm text-gray-500">每日皓金句載入中...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="bg-yellow-50 p-5 rounded-xl border border-yellow-200 shadow-sm">
        <p role="alert" className="text-sm text-red-700">{error}</p>
      </section>
    );
  }

  if (!data) return null;

  return (
    <section className="bg-yellow-50 p-5 rounded-xl border border-yellow-200 shadow-sm">
      <div className="mb-4 flex flex-col gap-2 border-b border-yellow-200 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg font-bold text-slate-900">🎙️ 每日皓哥金句區</h2>
        {data.fetch_date && (
          <time className="text-xs text-gray-500" dateTime={data.fetch_date}>
            抓取日期：{data.fetch_date}
          </time>
        )}
      </div>

      <div className="space-y-4">
        {data.jokes.map((joke, index) => {
          const seconds = timestampToSeconds(joke.timestamp);
          const videoUrl = data.video_id && seconds !== null
            ? `https://youtu.be/${encodeURIComponent(data.video_id)}?t=${seconds}`
            : null;

          return (
            <article key={`${joke.timestamp ?? 'joke'}-${index}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm leading-relaxed text-slate-800">{joke.joke_text}</p>
                {videoUrl && (
                  <a
                    href={videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                  >
                    ▶ 觀看影片 {joke.timestamp}
                  </a>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
