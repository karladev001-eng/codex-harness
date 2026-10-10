# Independent master reference fixtures

These inputs were authored for regression testing, independently of a supplied user master. `standard-4x3` and `wide-16x9` each contain:

- `references/<name>.pptx`: original standard OOXML presentation with one linked master, layout, theme and example slide.
- `references/<name>.potx`: actual standard OOXML template content type, not a renamed PPTX.
- `references/source-render.png`: actual fixture PPTX rendered through LibreOffice and Poppler; it is not an HTML mock or a fabricated source screenshot.
- `assets/logo.png`: synthetic two-color test mark, byte-identical to the master image part.
- `deck.json`: canonical HTML design using the selected master theme and normalized title/body/logo rectangles.
- `master-inspection.json`: bounded structural extraction; its renderer status is unverified because the inspector itself never renders.
- `source-render.json`: separate actual source rendering evidence, hashes, commands, visual inspection and limitations.

From the skill directory, build the actual runtime output in a fresh directory:

```sh
node scripts/pack.mjs build examples/masters/wide-16x9/deck.json --out NEW_OUTPUT
node scripts/pack.mjs build examples/masters/standard-4x3/deck.json --out ANOTHER_NEW_OUTPUT
node --test tests/master.test.mjs
```

Compare each original source PNG with its generated `r1/A/output/slides.html`. Tests verify source structures, the canonical mapping and actual emitted HTML within the recorded tolerances. Browser visual equality remains unverified where local-file access is unavailable. HTML intentionally adds a short summary and visible source footer; font metrics and paragraph wrapping differ. These are HTML design reconstructions; editable native master inheritance and PowerPoint round-trip compatibility are not preserved.

`python3 scripts/make-fixtures.py --out NEW_DIRECTORY` regenerates deterministic original PPTX/POTX, logo and canonical decks. It does not generate screenshots or claim rendering verification. The committed source-render evidence was added after separately rendering and inspecting the actual source. No real user master or real brand is tested.
