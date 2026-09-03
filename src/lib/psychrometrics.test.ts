import { describe, expect, test } from "vitest";
import {
  ceilTo,
  celsiusToFahrenheit,
  dewPointCelsius,
  fahrenheitToCelsius,
  floorTo,
  relativeHumidityAtDewPoint,
  relativeHumidityFromVpd,
  saturationVaporPressureKpa,
  vpdFromRelativeHumidity,
} from "./psychrometrics.ts";

// This mirrors scripts/test-psychrometrics.py against the same published
// fixtures. The Python is canonical (it computes figures that ship in prose);
// this suite exists so the TypeScript port the browser calculator runs cannot
// drift from it. If a constant changes in one copy and not the other, one of
// these two suites goes red.

describe( "unit conversion", () => {
  test( "32 °F is 0 °C", () => {
    expect( fahrenheitToCelsius( 32 ) ).toBeCloseTo( 0, 6 );
  });
  test( "212 °F is 100 °C", () => {
    expect( fahrenheitToCelsius( 212 ) ).toBeCloseTo( 100, 6 );
  });
  test( "round trip 74 °F", () => {
    expect( celsiusToFahrenheit( fahrenheitToCelsius( 74 ) ) ).toBeCloseTo( 74, 6 );
  });
});

describe( "Magnus equation", () => {
  test( "SVP at 0 °C is the leading constant", () => {
    // The leading constant IS the saturation vapor pressure at freezing.
    expect( saturationVaporPressureKpa( 0 ) ).toBeCloseTo( 0.61094, 5 );
  });

  test( "SVP at 84 °F is the published 4.00 kPa", () => {
    // The CO2 post states an SVP of 4.00 kPa at 84 °F (block 43, verified
    // against the live post). Pinning it means a constant change cannot
    // silently contradict published text.
    expect( saturationVaporPressureKpa( fahrenheitToCelsius( 84 ) ) ).toBeCloseTo( 3.9736, 3 );
  });

  test( "SVP at 84 °F is ~26 percent above 77 °F", () => {
    const ratio = saturationVaporPressureKpa( fahrenheitToCelsius( 84 ) )
      / saturationVaporPressureKpa( fahrenheitToCelsius( 77 ) );
    expect( ratio - 1 ).toBeGreaterThanOrEqual( 0.25 );
    expect( ratio - 1 ).toBeLessThanOrEqual( 0.27 );
  });
});

describe( "published RH figures in the CO2 post", () => {
  const temperatureCelsius = fahrenheitToCelsius( 84 );
  const cells: ReadonlyArray<[ number, number ]> = [ [ 1.3, 67 ], [ 1.4, 65 ], [ 1.2, 70 ] ];
  for( const [ vpd, published ] of cells ) {
    test( `${vpd} kPa at 84 °F rounds to the published ${published} percent`, () => {
      const actual = relativeHumidityFromVpd( temperatureCelsius, vpd ) * 100;
      expect( Math.round( actual ) ).toBe( published );
    });
  }
});

describe( "VPD and RH are inverses", () => {
  test( "RH survives a round trip through VPD", () => {
    const temperatureCelsius = fahrenheitToCelsius( 84 );
    const vpd = vpdFromRelativeHumidity( temperatureCelsius, 0.65 );
    expect( relativeHumidityFromVpd( temperatureCelsius, vpd ) ).toBeCloseTo( 0.65, 6 );
  });
});

describe( "dew point round trip", () => {
  test( "dew point implies the RH it came from", () => {
    const roomFahrenheit = 74;
    const dewFahrenheit = celsiusToFahrenheit(
      dewPointCelsius( fahrenheitToCelsius( roomFahrenheit ), 0.70 ),
    );
    expect( relativeHumidityAtDewPoint( dewFahrenheit, roomFahrenheit ) ).toBeCloseTo( 0.70, 6 );
  });
});

describe( "directional rounding", () => {
  test( "floorTo rounds a ceiling down", () => {
    expect( floorTo( 63.6 ) ).toBe( 63 );
  });
  test( "floorTo leaves an exact value alone", () => {
    expect( floorTo( 63 ) ).toBe( 63 );
  });
  test( "ceilTo rounds a minimum up", () => {
    expect( ceilTo( 63.1 ) ).toBe( 64 );
  });
  test( "ceilTo leaves an exact value alone", () => {
    expect( ceilTo( 63 ) ).toBe( 63 );
  });
});

describe( "reproduces the PR #73 breach", () => {
  // The load-bearing fixture. PR #73 fixed a dew point table whose cells had
  // been rounded to nearest, and recorded the exact figure that made it wrong:
  // the 74 °F night's 70 percent ceiling landed at an actual 71.00 percent.
  // That published number is a fixture no self-consistent arithmetic can fake.
  test( "round-to-nearest reproduces the 71.00 percent breach", () => {
    const nightFahrenheit = 74;
    const limit = 0.70;
    const trueCeilingFahrenheit = celsiusToFahrenheit(
      dewPointCelsius( fahrenheitToCelsius( nightFahrenheit ), limit ),
    );
    const nearest = Math.round( trueCeilingFahrenheit );
    const impliedPercent = relativeHumidityAtDewPoint( nearest, nightFahrenheit ) * 100;
    expect( impliedPercent ).toBeCloseTo( 71.0, 2 );
  });

  test( "floor rounding clears the same threshold", () => {
    const nightFahrenheit = 74;
    const limit = 0.70;
    const trueCeilingFahrenheit = celsiusToFahrenheit(
      dewPointCelsius( fahrenheitToCelsius( nightFahrenheit ), limit ),
    );
    const flooredPercent = relativeHumidityAtDewPoint( floorTo( trueCeilingFahrenheit ), nightFahrenheit ) * 100;
    expect( flooredPercent ).toBeLessThanOrEqual( limit * 100 );
  });
});
