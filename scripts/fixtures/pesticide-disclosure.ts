import type { PesticideDisclosure } from "../../src/lib/pesticide-disclosure.ts";

export const DISCLOSURE_LOT_UUID = "00000000-0000-4000-8000-000000000001";
export const DISCLOSURE_PUBLIC_CODE = "NWL-4A7KP";
export const DISCLOSURE_NONE_APPLIED_LOT_UUID = "00000000-0000-4000-8000-000000000002";
export const DISCLOSURE_NONE_APPLIED_PUBLIC_CODE = "NWL-9G2TX";

export function makePesticideDisclosureFixture(): PesticideDisclosure {
  return {
    _id: `disclosure.${DISCLOSURE_LOT_UUID}`,
    publicCode: DISCLOSURE_PUBLIC_CODE,
    strain: "Blue Dream",
    grade: "Top Shelf",
    noneApplied: false,
    applications: [
      {
        productName: "Regalia",
        activeIngredient: "Reynoutria sachalinensis extract",
        epaRegistrationNumber: "84059-3",
        appliedOn: "2026-07-14",
        targetPest: "Powdery mildew",
      },
      {
        productName: "Grandevo",
        activeIngredient: "Chromobacterium subtsugae strain PRAA4-1",
        epaRegistrationNumber: "84059-15",
        appliedOn: "2026-07-28",
        targetPest: "Spider mites",
      },
    ],
  };
}

export function makeNoneAppliedDisclosureFixture(): PesticideDisclosure {
  return {
    _id: `disclosure.${DISCLOSURE_NONE_APPLIED_LOT_UUID}`,
    publicCode: DISCLOSURE_NONE_APPLIED_PUBLIC_CODE,
    strain: "Gelato #33",
    grade: "Value",
    noneApplied: true,
    applications: [],
  };
}
