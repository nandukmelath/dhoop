# Dhoop: the logo

The mark is the sun the app shows while it listens, thinks and speaks: twelve rays, long and short in turn, round a marigold disc with an ink edge. The word is set in Anek Latin, narrow and heavy, the family the app uses for all six scripts.

| File | Use it for |
| --- | --- |
| `dhoop-logo.png` | The sun and the word, see-through background. Slides, documents, anything light |
| `dhoop-logo-on-paper.png` | The same on the app's paper colour |
| `dhoop-logo-on-night.png` | The same for dark backgrounds |
| `dhoop-logo-stacked-1024.png` | Square, with the line "Solar for your roof, in your language". Posters, a title slide |
| `dhoop-mark-1024.png`, `dhoop-mark.svg` | The sun alone, see-through. The SVG stays sharp at any size |
| `dhoop-mark-light-edge.svg` | The sun alone with a light edge, for dark backgrounds |
| `dhoop-icon-1024.png`, `dhoop-icon-night-1024.png` | A square picture for a profile, an app icon or a sticker |
| `dhoop-favicon.svg`, `dhoop-favicon-512.png` | A sun with eight thick rays, for sizes under 48 pixels |
| `dhoop-social-1200x630.png` | The card a chat or a post shows beside the link |

## Colours

| Name | Value | Where |
| --- | --- | --- |
| Marigold | `#faa40f` | The sun. Never for small text: it is too light to read on paper |
| Ink | `#1f1914` | The word and the sun's edge |
| Paper | `#f5f0e5` | The usual background |
| Cream | `#fcfaf3` | The word and the edge on dark |
| Night | `#141b33` | The dark background |

## Using it

- Leave clear space round the logo of at least the width of one ray's length.
- Do not stretch it, tilt it, recolour the sun or set the word in another typeface.
- Under 48 pixels use the favicon; under 120 pixels wide use the sun without the word.

## Making the files again

The files are pictures of the page at `/brand`, so the logo and the app share one drawing. With the app running: `npm run brand`. It needs Google Chrome and a Mac (it uses `sips` for the small icons), and also rewrites the site's tab and home-screen icons in `public/`.
