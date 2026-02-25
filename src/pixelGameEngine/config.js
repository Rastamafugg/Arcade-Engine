export const TILE_SIZE = 8;
export const COLS      = 20;
export const ROWS      = 18;
export const LOGICAL_W = COLS * TILE_SIZE;
export const LOGICAL_H = ROWS * TILE_SIZE;
export const HUD_H     = 10;
export const WORLD_OFFSET_Y = HUD_H;
export const WORLD_H        = LOGICAL_H - WORLD_OFFSET_Y;

export const PALETTE = [
  '#222034', '#45283C', '#663931', '#8F563B', '#DF7126', '#D9A066', '#EEC39A', '#FBF236',
  '#99E550', '#6ABE30', '#37946E', '#4B692F', '#524B24', '#323C39', '#3F3F74', '#306082',
  '#5B6EE1', '#639BFF', '#5FCDE4', '#CBDBFC', '#FFFFFF', '#9BADB7', '#847E87', '#696A6A',
  '#595652', '#76428A', '#AC3232', '#D95763', '#4a3020', '#2a1a10', '#1a1a2e', '#316082'
];

export const paletteRGBA = PALETTE.map(hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF, 255];
});