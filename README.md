# AI Storyboard

Single-page web application for planning keyframes and prompt transitions for AI-generated video workflows.

## Current Phase
- UI requirements review from wireframes.
- Technology and architecture decisions will be finalized in a later step.
- Confirmed product behavior and persistence rules are captured below.

## Baseline Product Requirements (UI)
1. General layout
- Fixed app label at top-left: `AI Storyboard`.
- Top-right button aligned with app label: `Delete Everything`.
- Centered, editable project title near the top.
- Main storyboard region fills remaining viewport and scrolls horizontally.

2. Design 1 (empty state)
- Show only an `Add A Keyframe` control in the storyboard rail.
- Control includes a text label and circular plus button.
- Clicking it opens an image file picker.

3. Design 2 (first keyframe)
- Uploaded image appears in the rail.
- Caption under image: `Keyframe 1`.
- `Add A Keyframe` remains visible to add more.

4. Design 3+ (second keyframe onward)
- Keyframes render in upload order from left to right.
- An `AI Prompt` textarea appears between adjacent keyframes.
- Textarea is fixed height, vertically scrollable, initially empty.
- Newly created prompt textarea auto-focuses and scrolls into centered view.
- Prompt count is always `(number of keyframes) - 1`.
- Pagination appears below the storyboard once prompts exist.
- Pagination is fixed-center in the window and maps to prompt sections.
- Pagination uses compact truncation (`...`) for long ranges per the design guide.
- There is no hard limit on keyframe count.

## Implementation Direction (HTML/CSS)
- Use semantic HTML: `header`, `main`, `section`, `button`, `input`, `textarea`.
- Build a horizontal flex rail with `overflow-x: auto`.
- Represent storyboard items as reusable tile blocks:
- keyframe tile
- prompt tile
- add-keyframe tile
- Use responsive sizing with `clamp(...)` to support desktop/mobile.
- Render keyframe tiles in a fixed 16:9 frame with `object-fit: cover`.
- Keep interactions and rendering in plain JavaScript (no frameworks).
- Keep `Add A Keyframe` as the final tile at all times.

## Persistence
- Persist changes immediately in-browser.
- Use a combination of `localStorage` and Cache API.
- Accept any valid browser-displayable image file.
- Use a small configurable debounce for text persistence writes (default target: `75ms`).
- `Delete Everything` clears serialized app state from `localStorage` and cached storyboard images from Cache API.

## Restore Behavior
- If an image cache entry is missing/corrupt, keep its keyframe position and show a placeholder.

## Future Enhancements
- Deletion/reordering are planned for a future phase.
- Current implementation should keep state structured for that extension (stable IDs over index-only coupling).
