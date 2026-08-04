import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";
import { sanityClient } from "./sanity";

const builder = createImageUrlBuilder( sanityClient );

export function urlFor( source: SanityImageSource ) {
  return builder.image( source );
}

// Sanity encodes intrinsic dimensions in the asset ref itself
// (image-<assetId>-<width>x<height>-<format>), so width/height are available
// without a second round trip to the asset document.
const ASSET_REF_DIMENSIONS = /-(\d+)x(\d+)-[a-z]+$/;

export interface ImageDimensions {
  width: number;
  height: number;
}

export function imageDimensions( assetRef: string ): ImageDimensions {
  const match = ASSET_REF_DIMENSIONS.exec( assetRef );
  if( !match ) {
    throw new Error(
      `Unable to parse dimensions from Sanity image ref "${assetRef}". `
      + "Expected the form image-<assetId>-<width>x<height>-<format>.",
    );
  }
  return { width: Number( match[ 1 ] ), height: Number( match[ 2 ] ) };
}
