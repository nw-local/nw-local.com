# Image workflow

Uploading strain, blog, retailer, and author images to Sanity. Two scripts orchestrated by `make`, which loads `.env` so the Sanity credentials are present.

## 1. Prepare

```sh
make prep-images DIR="path/to/images" STRAIN="Strain Name" \
    RENAME="IMG_3559.HEIC:bud-closeup,IMG_3561.HEIC:trichome-detail"
```

Converts HEIC→JPG, slugifies filenames to `<strain-slug>-<stem>.jpg`, and reports which files are new versus already uploaded. `RENAME` is optional and maps source filenames to friendlier stems.

Output lands in a `_processed/` subdirectory inside the source folder.

**Keep `_processed/` around.** It is the canonical local manifest of what is currently uploaded for that strain, and the dedup logic reads it to detect duplicates and renames on later runs. Deleting it doesn't lose data, but the next run loses its ability to tell a rename from a new upload.

### The dedup contract

Deduplication hashes the **converted JPG**, not the source file, and matches that SHA-1 against `sha1hash` on Sanity's image assets. The `sips -s formatOptions 90` setting in `scripts/prep-images.sh` is therefore part of the contract: changing the quality value changes every hash, every already-uploaded image starts reading as new, and duplicates upload silently.

## 2. Upload

```sh
make upload-image FILE="path/to/_processed/strain-name-bud-closeup.jpg" \
    LABEL="Short label" \
    DESCRIPTION="SEO-friendly alt text describing the image content"
```

`DESCRIPTION` becomes the asset's description, which is what `/describe-assets` audits and what alt text is drawn from. Write it as real alt text, not a filename.

Requires `SANITY_WRITE_TOKEN`, which is not needed to build or run the site — only to add assets.

### Orientation

Hero images should be landscape 4:3, minimum 1200×900. `upload-image` warns on a portrait image because a portrait hero gets cropped on the strain detail page.

Author photos are legitimately portrait. Pass `PORTRAIT_OK=1` to suppress the warning:

```sh
make upload-image FILE="path/to/_processed/ben-petty.jpg" \
    LABEL="Ben Petty" \
    DESCRIPTION="SEO-friendly alt text describing the image content" \
    PORTRAIT_OK=1
```

### EXIF orientation

Phone photos frequently carry an EXIF orientation tag rather than storing rotated pixels. Bake the rotation in before uploading, so nothing downstream has to interpret the tag.

Note that `sips -g orientation` is unreliable here — it has reported `<nil>` for a file whose EXIF IFD0 orientation tag was `6` (rotate 90° clockwise). Read the tag with a tool that reads EXIF properly:

```python
from PIL import Image, ImageOps
ImageOps.exif_transpose( Image.open( source ) ).save( destination, quality = 95, subsampling = 0 )
```

Sanity's pipeline and browsers both honour the tag, so an un-baked image usually displays correctly anyway — but any local tooling that reads raw pixels will disagree, and that disagreement is what wastes time.

## Cropping in Sanity

Upload one high-resolution asset and set the **hotspot** rather than uploading pre-cropped variants. `urlFor()` derives every size from the hotspot, so a single portrait can serve a 96px circular byline avatar, a 400px `Article` image, and an 800px `Person` image — each correctly framed on the subject.
