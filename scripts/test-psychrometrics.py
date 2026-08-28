#!/usr/bin/env python3
#
# Tests for psychrometrics.py.
#
# The load-bearing test is test_reproduces_pr73_breach. PR #73 fixed a dew
# point table whose cells had been rounded to nearest, and recorded the exact
# figure that made it wrong: the 74 °F night's 70 percent ceiling landed at an
# actual 71.00 percent. That published number is a fixture no amount of
# self-consistent arithmetic can fake. If the helpers stop reproducing it, they
# are wrong, whatever the rest of the suite says.
#
# Run: ./scripts/test-psychrometrics.py

import sys

sys.path.insert(0, __file__.rsplit("/", 1)[0])

from psychrometrics import (  # noqa: E402
    celsius_to_fahrenheit,
    ceil_to,
    dew_point_celsius,
    fahrenheit_to_celsius,
    floor_to,
    relative_humidity_at_dew_point,
    relative_humidity_from_vpd,
    saturation_vapor_pressure_kpa,
    vpd_from_relative_humidity,
)

FAILURES = []


def check(label, actual, expected, tolerance=0.01):
    if abs(actual - expected) > tolerance:
        FAILURES.append(f"{label}: got {actual:.4f}, expected {expected:.4f}")
        return
    print(f"  ok  {label}")


def check_true(label, condition, detail=""):
    if not condition:
        FAILURES.append(f"{label}{': ' + detail if detail else ''}")
        return
    print(f"  ok  {label}")


def test_unit_conversion():
    print("unit conversion")
    check("32 °F is 0 °C", fahrenheit_to_celsius(32), 0.0)
    check("212 °F is 100 °C", fahrenheit_to_celsius(212), 100.0)
    check("round trip 74 °F", celsius_to_fahrenheit(fahrenheit_to_celsius(74)), 74.0)


def test_magnus_anchor():
    print("Magnus equation")
    # The leading constant IS the saturation vapor pressure at freezing, so this
    # anchors the curve at a point with a known physical meaning.
    check("SVP at 0 °C is the leading constant", saturation_vapor_pressure_kpa(0), 0.61094)
    # These pin claims the CO2 post makes in prose, so a change to the constants
    # cannot silently contradict published text. Verified against the live post
    # 2026-08-27: block 43 states an SVP of 4.00 kPa at 84 °F and derives 67 and
    # 65 percent from it; block 45 states the 26 percent step up from 77 °F.
    check("SVP at 84 °F is the published 4.00 kPa",
          saturation_vapor_pressure_kpa(fahrenheit_to_celsius(84)), 3.9736)
    ratio = (saturation_vapor_pressure_kpa(fahrenheit_to_celsius(84))
             / saturation_vapor_pressure_kpa(fahrenheit_to_celsius(77)))
    check_true("SVP at 84 °F is ~26 percent above 77 °F",
               0.25 <= ratio - 1 <= 0.27, f"ratio was {ratio:.4f}")


def test_published_rh_cells():
    print("published RH figures in the CO2 post")
    temp_c = fahrenheit_to_celsius(84)
    for vpd, published in ((1.3, 67), (1.4, 65), (1.2, 70)):
        actual = relative_humidity_from_vpd(temp_c, vpd) * 100
        check_true(f"{vpd} kPa at 84 °F rounds to the published {published} percent",
                   round(actual) == published,
                   f"computed {actual:.2f}, published {published}")


def test_vpd_round_trip():
    print("VPD and RH are inverses")
    temp_c = fahrenheit_to_celsius(84)
    vpd = vpd_from_relative_humidity(temp_c, 0.65)
    check("RH survives a round trip through VPD",
          relative_humidity_from_vpd(temp_c, vpd), 0.65)


def test_dew_point_round_trip():
    print("dew point round trip")
    room_f = 74
    dew_f = celsius_to_fahrenheit(dew_point_celsius(fahrenheit_to_celsius(room_f), 0.70))
    check("dew point implies the RH it came from",
          relative_humidity_at_dew_point(dew_f, room_f), 0.70)


def test_rounding_direction():
    print("directional rounding")
    check("floor_to rounds a ceiling down", floor_to(63.60), 63.0)
    check("floor_to leaves an exact value alone", floor_to(63.0), 63.0)
    check("ceil_to rounds a minimum up", ceil_to(63.10), 64.0)
    check("ceil_to leaves an exact value alone", ceil_to(63.0), 63.0)


def test_reproduces_pr73_breach():
    """The fixture test. Round-to-nearest must reproduce the published bug."""
    print("reproduces the PR #73 breach")
    night_f, limit = 74, 0.70
    true_ceiling_f = celsius_to_fahrenheit(
        dew_point_celsius(fahrenheit_to_celsius(night_f), limit)
    )
    nearest = round(true_ceiling_f)
    implied_percent = relative_humidity_at_dew_point(nearest, night_f) * 100

    # CLAUDE.md: "put the 74 °F night's 70 percent ceiling at an actual 71.00
    # percent". Matching to two decimals is the point of the test.
    check("round-to-nearest reproduces the 71.00 percent breach",
          implied_percent, 71.00, tolerance=0.005)

    floored = floor_to(true_ceiling_f)
    floored_percent = relative_humidity_at_dew_point(floored, night_f) * 100
    check_true("floor rounding clears the same threshold",
               floored_percent <= limit * 100,
               f"floor gave {floored_percent:.2f} percent")



def main():
    for test in (test_unit_conversion, test_magnus_anchor, test_published_rh_cells,
                 test_vpd_round_trip, test_dew_point_round_trip,
                 test_rounding_direction, test_reproduces_pr73_breach):
        test()

    print()
    if FAILURES:
        print(f"FAIL: {len(FAILURES)} assertion(s) failed")
        for failure in FAILURES:
            print(f"  {failure}")
        return 1
    print("test-psychrometrics: all assertions passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
