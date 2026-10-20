/** SI units. Sim arithmetic is restricted to + − × ÷ √ so results are bit-identical across JS engines. */
export const G = 9.81;
export const R = 0.028575;
export const MASS = 0.17;
export const INERTIA = 0.4 * MASS * R * R;
export const E_BALL = 0.95;
export const MU_BALL = 0.06;
export const MU_CUSHION = 0.2;
/** Cushion nose at 63.5% of ball diameter: sin φ = (h − R)/R. */
export const NOSE_SIN = 0.27;
export const NOSE_COS = Math.sqrt(1 - NOSE_SIN * NOSE_SIN);
export const DT = 1 / 2000;
export const MAX_SIM_TIME = 40;
export const EPS_V = 1e-6;
/** Spin-rate gain of friction: τ/I = μ m g R / (2/5 m R²) = (5/2R) μ g. */
export const SPIN_K = 5 / (2 * R);
