const P = {
  markA: <><path d="M12 22V11M12 14C4 14 3 9 4 4c6 0 10 3 8 10Zm0-3C12 5 16 2 22 3c0 5-3 9-10 8Z"/><path d="m7 8 5 6m6-8-6 5"/></>,
  markB: <><path d="M3 16V8m6 13V3m6 15V6m6 10V8" strokeWidth="3.3"/></>,
  home: <><path d="m3 11 9-8 9 8v9H7v-9m9 9V10"/><path d="M3 11h6"/></>,
  book: <><path d="M12 20c-2-3-6-3-9-2V4c4-1 7 0 9 3m0 13c2-3 6-3 9-2V4c-4-1-7 0-9 3v13Z"/><path d="M6 8h2m8 0h2M6 11h2m8 0h2"/></>,
  habits: <><path d="M12 22V10m0 5c-6 0-9-3-9-7 5 0 9 2 9 7Zm0-4c0-5 4-8 9-8 0 5-4 8-9 8Z"/><circle cx="5" cy="20" r="1" fill="currentColor" stroke="none"/></>,
  drop: <><path d="M12 2c-2 4-7 9-7 13a7 7 0 0 0 14 0c0-4-5-9-7-13Z"/><path d="M8 14c-1 3 1 5 3 5"/></>,
  language: <><path d="M3 5h12M9 2v3m-4 3c1 4 4 7 8 9M13 5c-1 6-4 9-10 12m11 4 4-11 4 11m-6-4h5"/></>,
  moon: <><path d="M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12Z"/><path d="M17 3v4m-2-2h4"/></>,
  timer: <><circle cx="12" cy="13" r="8"/><path d="M12 8v5l3 2M9 2h6m-3 0v3"/></>,
  more: <><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></>,
  arrow: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
  back: <><path d="M20 12H5m6-6-6 6 6 6"/></>,
  check: <><path d="m5 12 4 4L19 6"/></>,
  sound: <><path d="M3 9h4l5-4v14l-5-4H3V9Zm13-2c4 3 4 7 0 10m-1-7c1 1 1 3 0 4"/></>,
  play: <><path d="m9 5 10 7-10 7V5Z" fill="currentColor" stroke="none"/></>,
  pause: <><path d="M8 5v14m8-14v14" strokeWidth="3"/></>,
  spark: <><path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2Z"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 2v6m10-6v6M3 11h18m-12 4h6"/></>,
  activity: <><path d="M3 9v6m4-9v12m10-12v12m4-9v6M7 12h10"/></>,
  feather: <><path d="M4 22 16 6M6 18c-3-6 0-15 12-15 4 10-1 17-12 15Zm4-5h8m-5-5v5"/></>,
  grid: <><path d="m3 11 9-8 9 8v9H7v-9m9 9V10"/><path d="M3 11h6"/></>,
  flame: <><path d="M12 22V10m0 5c-6 0-9-3-9-7 5 0 9 2 9 7Zm0-4c0-5 4-8 9-8 0 5-4 8-9 8Z"/><circle cx="5" cy="20" r="1" fill="currentColor" stroke="none"/></>,
  speaker: <><path d="M3 9h4l5-4v14l-5-4H3V9Zm13-2c4 3 4 7 0 10m-1-7c1 1 1 3 0 4"/></>,
  left: <><path d="M20 12H5m6-6-6 6 6 6"/></>,
  right: <><path d="M4 12h15m-6-6 6 6-6 6"/></>,
  sprout: <><path d="M12 22V10m0 5c-6 0-9-3-9-7 5 0 9 2 9 7Zm0-4c0-5 4-8 9-8 0 5-4 8-9 8Z"/><circle cx="5" cy="20" r="1" fill="currentColor" stroke="none"/></>,
  mark: <><path d="M3 16V8m6 13V3m6 15V6m6 10V8" strokeWidth="3.3"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  close: <><path d="m6 6 12 12M18 6 6 18"/></>,
  chevron: <><path d="m9 5 7 7-7 7"/></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  inbox: <><path d="M3 13h5l2 3h4l2-3h5M6 4h12l3 9v7H3v-7L6 4Z"/></>,
  edit: <><path d="m4 16 11-11 4 4L8 20H4v-4Zm10-10 4 4"/></>,
  archive: <><path d="M4 9h16v12H4V9Zm-1-6h18v6H3V3Zm7 10h4"/></>,
  heart: <><path d="M12 21 4 13C-2 5 8 0 12 7c4-7 14-2 8 6l-8 8Z"/></>,
  plane: <><path d="m3 11 8 2 2 8 3-3 0-5 5-8-2-2-8 5H6l-3 3Z"/></>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></>,
  music: <><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="19" rx="3" ry="2"/><ellipse cx="18" cy="17" rx="3" ry="2"/></>,
  focus: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
  trash: <><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></>,
  trophy: <><path d="M7 3h10v7a5 5 0 0 1-10 0V3Zm0 2H3v3a4 4 0 0 0 4 4m10-7h4v3a4 4 0 0 1-4 4m-5 3v4m-5 2h10"/></>,
  target: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 1v4m0 14v4M1 12h4m14 0h4"/></>,
}

export const Icon = ({ name, size = 22, stroke = 'currentColor', width = 1.6, style }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke}
       strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {P[name] || P.spark}
  </svg>
)

const LEGACY = { workout: 'activity', '✅': 'habits', '📖': 'book', '🏃': 'activity', '💧': 'drop', '🧘': 'focus',
  '🌙': 'moon', '💪': 'activity', '🎸': 'music', '🎂': 'calendar', '❤️': 'heart', '✈️': 'plane', '🎯': 'target' }

export function HabitSymbol({ value, size = 22 }) {
  const name = LEGACY[value] || value
  return P[name] ? <Icon name={name} size={size} /> : <span className="habit-emoji">{value}</span>
}
