// useState that is remembered in this browser (localStorage), so filters survive page reloads
// and server restarts. Saved values are checked against the default's shape: arrays stay arrays,
// filter objects keep only their known keys, and anything unreadable falls back to the default.
import { useEffect, useState } from 'react'

const PREFIX = 'filters:'

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw == null) return fallback
    const saved = JSON.parse(raw)
    if (Array.isArray(fallback)) return Array.isArray(saved) ? saved : fallback
    if (fallback && typeof fallback === 'object') {
      if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return fallback
      const merged = { ...fallback }
      for (const k of Object.keys(fallback)) {
        if (Array.isArray(fallback[k]) ? Array.isArray(saved[k]) : typeof saved[k] === typeof fallback[k]) {
          merged[k] = saved[k]
        }
      }
      return merged
    }
    return typeof saved === typeof fallback ? saved : fallback
  } catch {
    return fallback
  }
}

export function usePersistentState(key, initial) {
  const [value, setValue] = useState(() => read(key, typeof initial === 'function' ? initial() : initial))
  useEffect(() => {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value))
    } catch {
      /* storage unavailable */
    }
  }, [key, value])
  return [value, setValue]
}
