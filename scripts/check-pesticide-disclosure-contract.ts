#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  assertPesticideDisclosure,
  normalizePesticideDisclosure,
} from "../src/lib/pesticide-disclosure.ts";
import {
  makeNoneAppliedDisclosureFixture,
  makePesticideDisclosureFixture,
} from "./fixtures/pesticide-disclosure.ts";

const fixture = makePesticideDisclosureFixture();

assertPesticideDisclosure( fixture );
assertPesticideDisclosure( makeNoneAppliedDisclosureFixture() );
// grade is optional
assertPesticideDisclosure( normalizePesticideDisclosure({ ...fixture, grade: null }) );

// bad calendar date
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], appliedOn: "2026-13-40" } ],
}) );
// non-date-only string
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], appliedOn: "2026-07-14T00:00:00Z" } ],
}) );
// unknown application field
assert.throws( () => assertPesticideDisclosure({
  ...fixture,
  applications: [ { ...fixture.applications[0], applicationRate: "2 oz/acre" } ],
}) );
// noneApplied contradiction
assert.throws( () => assertPesticideDisclosure({ ...fixture, applications: [] }) );
// missing required string
assert.throws( () => assertPesticideDisclosure({ ...fixture, strain: "" }) );
// bad id prefix
assert.throws( () => assertPesticideDisclosure({ ...fixture, _id: "coa.abc" }) );

console.log( "Pesticide disclosure contract checks passed." );
