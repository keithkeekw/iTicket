// Tinted badge styles built on the theme's status colours.
export const TONE = {
  success: 'border-transparent bg-success/15 text-success',
  warning: 'border-transparent bg-warning/20 text-warning',
  danger: 'border-transparent bg-destructive/15 text-destructive',
  info: 'border-transparent bg-info/15 text-info',
  muted: 'border-transparent bg-muted text-muted-foreground',
}

export const STATUS_TONE = {
  new: TONE.warning,
  open: TONE.danger,
  pending: TONE.info,
  hold: TONE.muted,
  solved: TONE.success,
  closed: TONE.muted,
}

export const RATING_TONE = {
  Excellent: TONE.success,
  Good: TONE.info,
  Acceptable: TONE.warning,
  'Below Standard': TONE.danger,
  Poor: TONE.danger,
}

export const SCORE_TONE = { 5: TONE.success, 4: TONE.info, 3: TONE.warning, 2: TONE.danger, 1: TONE.danger }

export const CONFIDENCE_TONE = { high: TONE.success, medium: TONE.warning, low: TONE.danger }
