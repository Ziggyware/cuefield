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

/** Vertical restitution of the slate when a ball lands. */
export const E_TABLE = 0.42;
/** Vertical speed below which a bounce is treated as settled, m/s. */
export const REST_VZ = 0.06;
/** Air drag on the horizontal and vertical velocity, 1/s. Small, but keeps long hops finite. */
export const AIR_DRAG = 0.22;
/** Air drag on spin, 1/s. */
export const AIR_SPIN = 0.5;
/** Centre height at which a ball clears the cushion nose instead of striking it, m. */
export const RAIL_CLEAR = 1.3 * R;
/** Rounded nose radius of a pocket jaw tip, m. */
export const JAW_R = 0.3 * R;
/** Restitution and friction of a pocket jaw: dead enough to rattle, not to hold the ball. */
export const E_JAW = 0.52;
export const MU_JAW = 0.18;
/** A ball flying higher than this over a pocket sails past the drop, m. */
export const POCKET_CLEAR = 1.45 * R;
