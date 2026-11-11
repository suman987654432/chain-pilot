'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const TOKEN_KEY = 'cp_token';
const SESSION_CACHE_KEY = 'cp_session_cache';

export function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(SESSION_CACHE_KEY);
  }
}

export function getCachedSession(): any | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setCachedSession(session: any | null) {
  if (typeof window === 'undefined') return;
  if (session) localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_CACHE_KEY);
}

export async function apiCall<T = any>(
  url: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (body) headers['content-type'] = 'application/json';
  if (token) headers['authorization'] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && typeof window !== 'undefined') {
    setStoredToken(null);
    if (!window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data;
}

export function useData<T = any>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(!!url);
  const [error, setError] = useState<string>('');
  const reqIdRef = useRef<number>(0);

  const fetchUrl = useCallback((targetUrl: string | null) => {
    if (!targetUrl) {
      setData(null);
      setLoading(false);
      setError('');
      return;
    }

    const currentId = ++reqIdRef.current;
    setLoading(true);

    apiCall<T>(targetUrl)
      .then((d) => {
        if (currentId === reqIdRef.current) {
          setData(d);
          setError('');
          setLoading(false);
        }
      })
      .catch((e) => {
        if (currentId === reqIdRef.current) {
          setError(e.message || 'Failed to load data');
          setLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    fetchUrl(url);
  }, [url, fetchUrl]);

  const reload = useCallback(() => {
    fetchUrl(url);
  }, [url, fetchUrl]);

  return {
    data,
    loading,
    error,
    reload,
  };
}

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

export const inr = (v: unknown, dec = 0) =>
  (Number(v) < 0 ? '−₹' : '₹') +
  Math.abs(Number(v ?? 0)).toLocaleString('en-IN', {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  });

export const inr2 = (v: unknown) => inr(v, 2);

export const fmtDate = (v?: string | null) =>
  v
    ? new Date(v.length === 10 ? v + 'T00:00:00' : v).toLocaleDateString(
        'en-IN',
        { day: '2-digit', month: 'short', year: 'numeric' }
      )
    : '—';

export const todayStr = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 10);

export const monthStart = () => todayStr().slice(0, 8) + '01';

export const fyStart = () => {
  const t = todayStr();
  const y = +t.slice(0, 4) - (+t.slice(5, 7) < 4 ? 1 : 0);
  return `${y}-04-01`;
};

export async function fileToDataUrl(
  file: File
): Promise<{ url: string; mime: string }> {
  const raw: string = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });

  if (!file.type.startsWith('image/') || file.size < 400_000) {
    return { url: raw, mime: file.type };
  }

  const img = new Image();
  img.src = raw;
  await img.decode();
  const scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = img.width * scale;
  c.height = img.height * scale;
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
  return { url: c.toDataURL('image/jpeg', 0.75), mime: 'image/jpeg' };
}

