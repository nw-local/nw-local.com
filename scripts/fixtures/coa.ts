export const COA_SOURCE_ID = "00000000-0000-4000-8000-000000000001";
export const COA_PUBLISHED_AT = "2026-09-01T21:15:30Z";

export function makeCoaFixture() {
  return {
    _id: `coa.${COA_SOURCE_ID}`,
    sourceId: COA_SOURCE_ID,
    labResultId: "2155470281845367208-18-2026",
    sampleId: "SAMPLE-1",
    status: "pass",
    publishedAt: COA_PUBLISHED_AT,
    totalThc: { label: "Total THC (calculated)", value: "29.39", unit: "%" },
    waterActivity: { label: "Water activity", value: "0", unit: "aw" },
    panels: [
      {
        name: "Cannabinoids",
        status: "pass",
        metrics: [ { name: "D9-THC", value: "0.12", unit: "%", status: "fail" } ],
      },
      {
        name: "Microbial",
        status: "pass",
        metrics: [ { name: "Total yeast and mold", value: "0", unit: "CFU/g" } ],
      },
    ],
    strain: { name: "Test Strain", url: "https://nw-local.com/strains/test-strain/" },
    certificate: {
      filename: "certificate.pdf",
      sha256: "a".repeat( 64 ),
      url: "https://cdn.sanity.io/files/example/certificate.pdf",
    },
  };
}
