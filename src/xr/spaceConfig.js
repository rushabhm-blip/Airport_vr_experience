// Kept free of THREE so grid/fit logic can be tested in Node.
export { STAGE } from '../config.js';
import { STAGE } from '../config.js';
export const clampScale = (s) => Math.max(STAGE.minScale, Math.min(1, s));
