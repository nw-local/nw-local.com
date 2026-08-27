#!/usr/bin/env python3
#
# Psychrometric helpers: saturation vapor pressure, VPD, relative humidity and
# dew point, plus the directional rounding that threshold cells require.
#
# Shared rather than inlined into check-threshold-tables.py because the same
# math is needed in two places with different orchestration around it. The
# checker verifies published cells; drafting a new table computes them. Those
# are different jobs, so they stay separate, but the equation underneath is one
# thing and lives here.
#
# The Magnus equation is an empirical curve fit, not a derivation. The three
# constants come from fitting measured vapor pressure against temperature:
# 0.61094 is simply the saturation vapor pressure at freezing, and 17.625 and
# 243.04 have no physical meaning on their own. T is in °C, which is the one
# legitimately single-unit temperature in this repo, because it is a formula
# variable rather than a setpoint a grower reads.

import math

# Fitted constants for the Magnus equation over the range these articles use.
MAGNUS_A = 0.61094  # kPa, saturation vapor pressure at 0 °C
MAGNUS_B = 17.625
MAGNUS_C = 243.04


def fahrenheit_to_celsius(fahrenheit):
    return (fahrenheit - 32.0) * 5.0 / 9.0


def celsius_to_fahrenheit(celsius):
    return celsius * 9.0 / 5.0 + 32.0


def saturation_vapor_pressure_kpa(temperature_celsius):
    """Saturation vapor pressure in kPa, by the Magnus equation."""
    return MAGNUS_A * math.exp(
        MAGNUS_B * temperature_celsius / (temperature_celsius + MAGNUS_C)
    )


def relative_humidity_from_vpd(temperature_celsius, vpd_kpa):
    """Fraction, not percent. RH = 1 - (VPD / SVP)."""
    return 1.0 - vpd_kpa / saturation_vapor_pressure_kpa(temperature_celsius)


def vpd_from_relative_humidity(temperature_celsius, relative_humidity):
    """relative_humidity is a fraction, not a percent."""
    return saturation_vapor_pressure_kpa(temperature_celsius) * (
        1.0 - relative_humidity
    )


def dew_point_celsius(temperature_celsius, relative_humidity):
    """Temperature at which this air reaches saturation. RH is a fraction."""
    gamma = math.log(relative_humidity) + (
        MAGNUS_B * temperature_celsius / (MAGNUS_C + temperature_celsius)
    )
    return MAGNUS_C * gamma / (MAGNUS_B - gamma)


def relative_humidity_at_dew_point(dew_point_fahrenheit, room_fahrenheit):
    """Fraction of RH that a given dew point produces in a room at room temp.

    This is the inverse a threshold check needs: given a dew point we published
    as a ceiling, what humidity does it actually imply in that room?
    """
    return saturation_vapor_pressure_kpa(
        fahrenheit_to_celsius(dew_point_fahrenheit)
    ) / saturation_vapor_pressure_kpa(fahrenheit_to_celsius(room_fahrenheit))


def floor_to(value, step=1.0):
    """Round a CEILING cell down, so the published figure never exceeds truth.

    Rounding to nearest is what put five of ten cells above their own caption's
    stated threshold in PR #73. When a caption names a limit, rounding stops
    being symmetric: the direction that steps over the line is wrong even when
    it is nearer.
    """
    return math.floor(value / step) * step


def ceil_to(value, step=1.0):
    """Round a MINIMUM cell up, for the same reason floor_to rounds down."""
    return math.ceil(value / step) * step
