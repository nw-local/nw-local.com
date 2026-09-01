// The certificate asset validation rule, kept in its own module with no
// `sanity` import so the root `scripts/check-coa-contract.ts` can exercise it
// without resolving Studio-only dependencies. Importing it from `coa.ts` would
// pull in `sanity`, which is installed only under `studio/node_modules` and is
// absent in the root-only CI "Type check" job.
export function certificateAssetValidation<
  Rule extends { required: () => Rule; assetRequired: () => Rule },
>(rule: Rule): Rule {
  return rule.required().assetRequired()
}
