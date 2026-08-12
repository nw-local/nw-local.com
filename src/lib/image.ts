import { createImageUrlBuilder, type SanityImageSource } from "@sanity/image-url";
import { sanityClient, type SanityImage } from "./sanity";

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

function imageDimensions( assetRef: string ): ImageDimensions {
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
  // Resolve and validate the asset id first, before consulting metadata, so a
  // malformed Portable Text block fails the build loudly instead of shipping
  // a page with a hole in it.
  const assetId = asset?._ref ?? asset?._id;
  if( !assetId ) {
    throw new Error(
      `${context} has no asset reference. Attach an image in Sanity Studio or remove the field.`,
    );
  }

  const dimensions = asset?.metadata?.dimensions;
  if( dimensions?.width && dimensions?.height ) {
    return { width: dimensions.width, height: dimensions.height };
  }

  return imageDimensions( assetId );
}

// Full-bleed backdrop candidates. Sanity will happily upscale a small source
// and return double the bytes for no extra detail, so cap every request at the
// asset's own width. The ceiling is a retina-density common desktop width
// rather than anything derived from the content column, because the backdrop
// spans the viewport rather than sitting inside `main`.
const BACKDROP_CEILING_WIDTH = 3000;
const BACKDROP_CANDIDATE_WIDTHS = [ 480, 800, 1200, 1600, 2000, 2400 ];

export interface BackdropSources {
  src: string;
  srcset: string;
  width: number;
}

export function heroBackdropSources( image: SanityImage, context: string ): BackdropSources {
  const width = Math.min(
    BACKDROP_CEILING_WIDTH,
    resolveImageDimensions( image.asset, context ).width,
  );
  const candidateWidths = [ ...new Set(
    [ ...BACKDROP_CANDIDATE_WIDTHS, width ].filter( candidate => candidate <= width ),
  ) ];
  return {
    src: urlFor( image ).width( width ).format( "webp" ).url(),
    srcset: candidateWidths
      .map( candidate => `${urlFor( image ).width( candidate ).format( "webp" ).url()} ${candidate}w` )
      .join( ", " ),
    width,
  };
}
