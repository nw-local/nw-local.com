#!/usr/bin/env node

import assert from "node:assert/strict";
import { assertCoa, normalizeCoa, type Coa } from "../src/lib/coa.ts";
import { certificateAssetValidation } from "../studio/schemaTypes/coa.ts";

const fixture = {
  _id: "coa.00000000-0000-4000-8000-000000000001",
  sourceId: "00000000-0000-4000-8000-000000000001",
  labResultId: "2155470281845367208-18-2026",
  sampleId: "SAMPLE-1",
  status: "pass",
  totalThc: { label: "Total THC (calculated)", value: "29.39", unit: "%" },
  waterActivity: { label: "Water activity", value: "0.421", unit: "aw" },
  panels: [ { name: "Cannabinoids", status: "pass", metrics: [] } ],
  certificate: {
    filename: "certificate.pdf",
    sha256: "a".repeat( 64 ),
    url: "https://cdn.sanity.io/file.pdf",
  },
} satisfies Coa;

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
