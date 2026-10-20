# The Readymade Institute

A web app that turns any ordinary object into a work of contemporary art. You describe something from your pocket, bag or desk, and the app writes its museum wall label in International Art English, then shows the object installed in an exhibition.

**Live app:** LIVE_URL

CART 498 · Assignment 4 · Dan Truong

---

## How it works

```
your description ──► (1) curator: wall label ──► (2) art director: image prompt ──► (3) image model: installation photo
                         tombstone + extended label     written from the label only
```

1. **The label.** The OpenAI Responses API (`client.responses.parse`, model `gpt-4.1`) writes the label as structured output. A Pydantic schema makes sure every tombstone field is there: artist and bio, title and year, medium, dimensions, provenance, credit line. Then the extended label follows, along with the invented theorist and their book.
2. **The image prompt.** A second Responses API call receives **only the finished label**, never what the visitor typed, and writes the prompt for the image model.
3. **The image.** The OpenAI Images API (`client.images.generate`, model `gpt-image-1`) returns the picture as base64 (`b64_json`). The server turns it into a `data:image/png;base64,...` URL that the browser can show directly.

The label and the image are two separate requests, so the label appears on the wall while the photo is still being made.

## International Art English: features and prompt rules

I based the rules on what Rule & Levine (2012) found when they compared e-flux press releases with ordinary British English. The developer prompt in `museum.py` has six numbered rules that the machine always follows. Rule 2 lists the IAE features it has to use and exaggerate:

| IAE feature (Rule & Levine) | Their examples | Rule in my prompt |
|---|---|---|
| Nouns made out of other words, with French-style endings | *visuality, globality, potentiality* | 2a: invent at least two *-ity / -ality / -ization* nouns from ordinary words ("pocketability") |
| "The" + adjective, from translated French theory | *the real, the void, the political* | 2b: use "the everyday", "the real", "the void"… |
| Space words for things that aren't spaces | *space, intersection, platform, void* | 2c: one spatial metaphor ("the space between X and Y", "a threshold") |
| Stacked adverbs and paired terms | *playfully and subversively* | 2d: one adverb pair + one "at once X and Y" |
| Prefixes that make new words | *para-, proto-, post-, hyper-* | 2e: one coinage with one of these prefixes |
| Verbs where the artwork "does" something | *interrogate, subvert, displace* | 2f: use interrogates / destabilizes / displaces / subverts / re-inscribes |
| Long sentences that start with a dependent clause and end in lists | | Style instruction under rule 2 |

The other rules:

- **Rule 1, stay precise about the object.** Every physical fact comes from the visitor's description, and at least two mundane details have to appear in the label. The language gets inflated, never the object. The joke is the gap between the two.
- **Rule 3:** cite exactly one invented theorist and their invented book.
- **Rule 4:** invent every reputation. No real artists, critics, curators, theorists, galleries or museums.
- **Rule 5:** the extended label is one paragraph of 80–120 words.
- **Rule 6:** tombstone conventions. Dimensions are the *only* place where the curator may change the object (a monumental replica, or "Dimensions variable"), and the label has to mention that choice. This keeps rule 1 and the scale choice from contradicting each other.

The code doesn't just trust the model. `label_problems()` counts the words and checks that the theorist's name and the book title really appear in the extended label. If something is wrong, the draft goes back to the model with the list of problems, up to 3 attempts in total. Anything the visitor types is treated only as a description of an object. If someone writes instructions instead, the curator treats that text itself as the found object.

## How the image prompt is derived from the label

The image step never sees the visitor's text. It gets the label written out as it hangs on the wall, and follows its own rules (`IMAGE_RULES` in `museum.py`):

- **The object** is whatever the title, medium and extended label describe, including its wear. No upgrades.
- **The dimensions set the scale.** The art director compares them with a human body. Real size means a small object on its display. Something like 600 × 400 cm fills the room, with a visitor next to it for scale. "Dimensions variable" means the object is scattered or multiplied across the floor or wall. The chosen scale is written in the prompt.
- **The setting** comes from the visitor's choice (white cube, vitrine, lone plinth under a spotlight, biennale pavilion), or the art director picks the one that fits the label.
- **Abstract materials** in the medium ("fatigue", "the void") become light, shadow or emptiness, never written words.
- **Style:** a realistic installation photograph with no readable text, because the label is already beside the work.

You can see the scale, the setting and the full image prompt under **Curatorial notes** below each work.

## User guide

1. Open the app and describe one object in the text box: what it is, plus a few small details like colour, brand, wear, or where you found it. Details make better labels. You can also click one of the example objects.
2. Choose an **exhibition setting**, or leave it on "Let the curator decide".
3. Click **Acquire for the collection**. The wall label appears after a few seconds. The installation photo takes about 30 seconds more.
4. Read the label beside the work. Open **Curatorial notes** to see how the image prompt was written from the label.
5. Click **Acquire another object** to start again.

Notes: descriptions are limited to 400 characters, and each visitor can make 8 acquisitions every 15 minutes, so the public link doesn't use up the API credit. On Render's free plan, the first visit after a quiet period can take about a minute while the server wakes up.

## Running it yourself

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
mv .env-bup .env          # then put your OPENAI_API_KEY in .env
python3 app.py            # open http://127.0.0.1:5000
```

**Deploying on Render:** build command `pip install -r requirements.txt`, start command `gunicorn app:app --timeout 240` (both are already in `render.yaml`), and add `OPENAI_API_KEY` as an environment variable in the Render dashboard. The key is never in the code or the repo. Optional environment variables: `TEXT_MODEL`, `IMAGE_MODEL`, `IMAGE_QUALITY`, `RATE_LIMIT`.

## Reflection: why is a language model so fluent in this dialect?

REFLECTION
