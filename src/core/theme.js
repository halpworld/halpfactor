// Shared visual constants. Keep canvas and DOM looking like one game.
export const WORLD = Object.freeze({ W: 1366, H: 1024 });

export const COLORS = Object.freeze({
  bg: '#060a18',
  bgDeep: '#03050d',
  panel: '#0e1630',
  panelEdge: '#22305c',
  steel: '#5d6b8f',
  steelLight: '#a9b6d6',
  text: '#e8f4ff',
  textDim: '#7f90b8',
  cyan: '#22f0ff',
  magenta: '#ff3df2',
  purple: '#8a5cff',
  amber: '#ffb020',
  green: '#39ff88',
  red: '#ff3b4e',
  gold: '#ffd34d',
  goldDeep: '#c98a12',
  smoke: '#1a1a1f',
});

export const FONT = Object.freeze({
  // No web fonts: offline-first. Rounded system faces read well for kids.
  display: '"Avenir Next", "SF Pro Rounded", ui-rounded, "Trebuchet MS", system-ui, sans-serif',
  mono: '"SF Mono", Menlo, ui-monospace, monospace',
});
