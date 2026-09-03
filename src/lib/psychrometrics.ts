// Psychrometric helpers: saturation vapor pressure, VPD, relative humidity and
// dew point, plus the directional rounding that threshold cells require.
//
// This is a faithful TypeScript port of scripts/psychrometrics.py, which stays
// the canonical implementation: the Python computes the figures baked into the
// cultivation posts, and scripts/test-psychrometrics.py pins its constants
// against numbers already published. This module exists so the browser-side
// VPD calculator can run the same math without shipping Python. The two copies
// share one contract, so the constants below must match the Python exactly, and
// src/lib/psychrometrics.test.ts pins them against the same published fixtures
// (the CO2 post's 4.00 kPa cell and the PR #73 71.00 percent breach) so neither
// copy can drift from the other or from live prose.
//
// The Magnus equation is an empirical curve fit, not a derivation. The three
// constants come from fitting measured vapor pressure against temperature:
// 0.61094 is the saturation vapor pressure at freezing, and 17.625 and 243.04
// have no physical meaning on their own. T is in Celsius throughout, which is
// the one legitimately single-unit temperature here, because it is a formula
// variable rather than a setpoint a grower reads.

// Fitted constants for the Magnus equation over the range these articles use.
const MAGNUS_A = 0.61094; // kPa, saturation vapor pressure at 0 °C
const MAGNUS_B = 17.625;
const MAGNUS_C = 243.04;

export function fahrenheitToCelsius( fahrenheit: number ): number {
  return ( fahrenheit - 32 ) * 5 / 9;
}

export function celsiusToFahrenheit( celsius: number ): number {
  return celsius * 9 / 5 + 32;
}

/** Saturation vapor pressure in kPa, by the Magnus equation. */
export function saturationVaporPressureKpa( temperatureCelsius: number ): number {
  return MAGNUS_A * Math.exp(
    MAGNUS_B * temperatureCelsius / ( temperatureCelsius + MAGNUS_C ),
  );
}

/** Fraction, not percent. RH = 1 - (VPD / SVP). */
export function relativeHumidityFromVpd( temperatureCelsius: number, vpdKpa: number ): number {
  return 1 - vpdKpa / saturationVaporPressureKpa( temperatureCelsius );
}

/** relativeHumidity is a fraction, not a percent. Returns kPa. */
export function vpdFromRelativeHumidity( temperatureCelsius: number, relativeHumidity: number ): number {
  return saturationVaporPressureKpa( temperatureCelsius ) * ( 1 - relativeHumidity );
}

/** Temperature in °C at which this air reaches saturation. RH is a fraction. */
export function dewPointCelsius( temperatureCelsius: number, relativeHumidity: number ): number {
  const gamma = Math.log( relativeHumidity ) + (
    MAGNUS_B * temperatureCelsius / ( MAGNUS_C + temperatureCelsius )
  );
  return MAGNUS_C * gamma / ( MAGNUS_B - gamma );
}

/**
 * Fraction of RH that a given dew point produces in a room at room temp.
 *
 * The inverse of the usual direction: given a dew point we published as a
 * ceiling, what humidity does it actually imply in that room?
 */
export function relativeHumidityAtDewPoint( dewPointFahrenheit: number, roomFahrenheit: number ): number {
  return saturationVaporPressureKpa( fahrenheitToCelsius( dewPointFahrenheit ) )
    / saturationVaporPressureKpa( fahrenheitToCelsius( roomFahrenheit ) );
}

/**
 * Round a CEILING cell down, so the published figure never exceeds truth.
 *
 * Rounding to nearest is what put five of ten cells above their own caption's
 * stated threshold in PR #73. When a caption names a limit, rounding stops
 * being symmetric: the direction that steps over the line is wrong even when
 * it is nearer.
 */
export function floorTo( value: number, step = 1 ): number {
  return Math.floor( value / step ) * step;
}

/** Round a MINIMUM cell up, for the same reason floorTo rounds down. */
export function ceilTo( value: number, step = 1 ): number {
  return Math.ceil( value / step ) * step;
}
