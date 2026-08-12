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

// Both raw documents and `asset->` projections flow through the components that
// need dimensions: a raw reference carries `_ref` and no metadata, while a
// dereferenced asset carries `_id` plus a populated `metadata.dimensions`.
// Accept either shape so callers do not each reimplement the fallback.
export interface SanityImageAssetLike {
  _ref?: string;
  _id?: string;
  metadata?: { dimensions?: { width?: number; height?: number } };
}

export function resolveImageDimensions(
  asset: SanityImageAssetLike | undefined,
  context: string,
): ImageDimensions {
  const dimensions = asset?.metadata?.dimensions;
  if( dimensions?.width && dimensions?.height ) {
    return { width: dimensions.width, height: dimensions.height };
  }

  const assetId = asset?._ref ?? asset?._id;
  if( !assetId ) {
    throw new Error(
      `${context} has no asset reference. Attach an image in Sanity Studio or remove the field.`,
    );
  }

  return imageDimensions( assetId );
}
