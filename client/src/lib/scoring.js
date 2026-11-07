// Same rating bands and arithmetic as the server (server/ollama.js scoreCategories), used to
// preview a manual score change before it is saved. The server recalculates on save.
export const RATING_BANDS = [
  [4.5, 'Excellent'],
  [3.5, 'Good'],
  [2.5, 'Acceptable'],
  [1.5, 'Below Standard'],
  [0, 'Poor'],
]

const round2 = n => Math.round(n * 100) / 100

// categories: [{ weight, score }] → { total, rating }
export function previewTotal(categories) {
  const total = round2(categories.reduce((sum, c) => sum + round2(c.score * (Number(c.weight) || 0)), 0))
  return { total, rating: RATING_BANDS.find(([min]) => total >= min)[1] }
}
