#!/usr/bin/env node

import assert from "node:assert/strict";
import { assertCoa, normalizeCoa } from "../src/lib/coa.ts";
import { makeCoaFixture } from "./fixtures/coa.ts";
import { certificateAssetValidation } from "../studio/schemaTypes/coa.ts";

const fixture: unknown = makeCoaFixture();

assertCoa( fixture );
assertCoa({
  ...fixture,
  panels: [ {
    name: "Cannabinoids",
    status: "pass",
    metrics: [ { name: "D9-THC", value: "0.12", unit: "%", status: "pass" } ],
  } ],
});
assertCoa({
  ...fixture,
  waterActivity: { ...fixture.waterActivity, value: "0" },
});
for( const invalidDecimal of [ "NaN", " 0.421", ".421", "0.4210" ] ) {
  assert.throws(
    () => assertCoa({
      ...fixture,
      totalThc: { ...fixture.totalThc, value: invalidDecimal },
    }),
  );
}
assertCoa( normalizeCoa({
  ...fixture,
  totalThc: null,
  waterActivity: null,
  strain: null,
  panels: [ {
    name: "Cannabinoids",
    status: "pass",
    metrics: [ { name: "D9-THC", value: "0.12", unit: "%", status: null } ],
  } ],
}) );
assert.throws( () => assertCoa( normalizeCoa({ ...fixture, status: null }) ) );
assert.throws( () => assertCoa({ ...fixture, certificate: {} }) );
assert.throws(
  () => assertCoa({ ...fixture, totalThc: { ...fixture.totalThc, status: "pass" } }),
);
assert.throws(
  () => assertCoa({ ...fixture, strain: { name: "Test Strain", url: "not-a-url" } }),
);

const assetValidationCalls: string[] = [];
const assetRuleProbe = {
  required() {
    assetValidationCalls.push( "required" );
    return assetRuleProbe;
  },
  assetRequired() {
    assetValidationCalls.push( "assetRequired" );
    return assetRuleProbe;
  },
};
certificateAssetValidation( assetRuleProbe );
assert.deepEqual( assetValidationCalls, [ "required", "assetRequired" ] );

console.log( "COA contract checks passed." );
