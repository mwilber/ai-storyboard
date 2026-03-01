# AI Storyboard Agent Notes

## Current Scope
- Build a single-page web application using only HTML, CSS, and JavaScript (no frameworks).
- Current phase includes UI and client-side architecture planning based on wireframes in `designs/`.
- Persist requirements and implementation direction in this file and the root `README.md`.
- All user changes are saved immediately and persist in-browser.
- App runs fully client-side after static assets are served.

## Wireframe-Derived UI Requirements
1. Global structure
- Fixed app label at top-left: `AI Storyboard`.
- Top-right control aligned with app label row: `Delete Everything`.
- Centered editable project title below the fixed app label.
- Main content area under the title occupies the remaining viewport height.
- Main content area scrolls horizontally to reveal keyframes and prompt sections.

2. Initial state (Design 1)
- No keyframes yet.
- Show an `Add A Keyframe` control in the horizontal canvas.
- Control includes text label and circular plus button.
- Clicking it opens image upload selection.

3. After first upload (Design 2)
- Display first uploaded image tile to the left of `Add A Keyframe`.
- Render label under image: `Keyframe 1`.
- Keep `Add A Keyframe` visible as the last tile.

4. After second upload and beyond (Design 3 behavior)
- Keyframes continue in upload order left to right.
- Between each adjacent pair of keyframes, render an `AI Prompt` section:
- Section has a label `AI Prompt`.
- Section contains a fixed-height textarea with vertical scrolling for long text.
- Textarea starts empty when first created.
- Newly created textarea receives focus automatically.
- Horizontal scroll position recenters so the newly created prompt area is in view.
- Prompt count must always equal `keyframeCount - 1`.
- Once at least one prompt exists, show pagination under the horizontal canvas.
- Pagination corresponds to prompt sections (one item per prompt gap).
- App supports unlimited keyframes/prompts (bounded only by browser/device resources).

## HTML/CSS Layout Plan
1. App shell
- Use a full-height page container (`min-height: 100vh`) with a simple top region + content region.
- Keep top-left app label fixed using `position: fixed` with responsive offsets.
- Keep project title in normal flow and centered with `text-align: center`.

2. Editable project title
- Use a semantic heading (`h1`) with inline editing mode.
- Default display mode: static text.
- On click, swap to input (or `contenteditable`) and commit on blur/Enter.
- Constrain width and center it consistently across viewports.

3. Horizontal storyboard rail
- Create a main stage wrapper under the title sized to remaining viewport (`calc(...)` or flex).
- Inside it, use a horizontally scrollable rail:
- `display: flex; flex-direction: row; align-items: flex-start;`
- `overflow-x: auto; overflow-y: hidden;`
- Consistent `gap` between tiles.
- Include side padding so centered targeting has visual breathing room.

4. Tile patterns
- Keyframe tile:
- Fixed visual block for image preview (consistent width/height, object-fit cover).
- Caption below: `Keyframe N`.
- Prompt tile:
- Label above textarea.
- Textarea fixed height, resizable disabled, `overflow-y: auto`.
- Add-keyframe tile:
- Text label + circular icon button.
- Hidden file input triggered by button click.

5. Vertical composition
- Use a parent flex column:
- Header/title area at top.
- Scroll rail in middle (dominant space).
- Pagination row at bottom (only shown when prompt count > 0).

6. Pagination styling and behavior
- Render simple numeric buttons for prompt positions.
- Active page has strong contrast fill.
- Keep pagination fixed-center below the rail/window.
- Clicking a page scrolls horizontally to that prompt tile.
- Use compact truncation (`...`) for long page ranges, following Design 3.

7. Responsiveness rules
- On narrow screens, scale tile widths/heights down using CSS clamp values.
- Preserve horizontal scroll behavior at all widths.
- Ensure fixed app label does not overlap editable project title.
- Keyframe media render area uses a fixed 16:9 aspect ratio with `object-fit: cover`.

8. Accessibility baseline
- Use real `button`, `input`, `textarea`, and `label` elements.
- Add clear focus styles and keyboard support for editing title/upload.
- Add descriptive `alt` text for uploaded images.
- Upload validation only checks that selected files are browser-displayable images.

## Persistence Requirements
- Use both `localStorage` and Cache API for browser-side persistence.
- Save changes immediately on every edit/upload.
- Persist at minimum:
- project title
- ordered keyframe list
- prompt text list
- active/selected prompt index (if applicable)
- Store serialized application state as JSON in `localStorage`.
- Store image binary data in Cache API; store only image references/keys in state JSON.
- Keep keyframe and prompt order strictly consistent with rendered storyboard order.
- Add a `Delete Everything` action that clears app `localStorage` state and cached storyboard images in Cache API.

## Add-Keyframe Behavior
- `Add A Keyframe` remains the last tile in the sequence at all times.
- Each upload appends one keyframe to the end.
- After adding the second keyframe and each subsequent keyframe, create exactly one new prompt between the new keyframe and the previous keyframe.

## Future Enhancement Preparation
- Deletion/reordering is out of scope for this phase.
- Prepare state to support future deletion/reordering by storing stable IDs:
- `keyframe.id` separate from array position
- `prompt.id` mapped to adjacent keyframe IDs rather than only index math

## Application Architecture Plan
1. Runtime and delivery model
- Single-page app with static file hosting only (`index.html`, CSS, JS modules, assets).
- No server-side sessions, DB, or API dependencies required for core storyboard behavior.

2. JavaScript module boundaries
- `App` class:
- Bootstraps modules.
- Wires UI events to state updates.
- Handles initial render and re-render triggers.
- Handles `Delete Everything` button click, confirmation, and full reset flow.
- `ImageManager` class:
- Validates selected image files.
- Creates stable image IDs/keys.
- Writes/reads image responses from Cache API.
- Provides object URLs (or blob URLs) for rendering.
- `StorageManager` class:
- Owns JSON serialization/deserialization for `localStorage`.
- Performs atomic `loadState()` and `saveState(state)` operations.
- Handles fallback to default state when persisted state is missing/corrupt.
- `StateManager` class:
- Owns canonical in-memory state object.
- Applies all mutations (`setTitle`, `addKeyframe`, `updatePrompt`, pagination selection).
- Enforces invariants (prompt count = keyframes - 1, ordering rules).
- Calls `StorageManager` and `ImageManager` to persist data after every mutation.

3. Proposed source layout
- `index.html`
- `styles.css`
- `js/main.js` (entry point)
- `js/app.js`
- `js/state-manager.js`
- `js/storage-manager.js`
- `js/image-manager.js`
- `js/ui-renderer.js` (optional pure render helpers if needed)

4. State shape (serialized JSON)
```json
{
  "version": 1,
  "projectTitle": "Project Title",
  "selectedPromptId": null,
  "keyframes": [
    {
      "id": "kf_001",
      "imageKey": "img_kf_001",
      "createdAt": 0
    }
  ],
  "prompts": [
    {
      "id": "pr_001",
      "leftKeyframeId": "kf_001",
      "rightKeyframeId": "kf_002",
      "text": ""
    }
  ]
}
```

5. Mutation and save flow
- On any editable title input event: update in-memory state and immediately call `saveState`.
- On prompt textarea input (every keystroke): update corresponding prompt text and immediately call `saveState`.
- On keyframe upload:
- cache image through `ImageManager`
- append keyframe to state
- if keyframes >= 2, append one new prompt between previous and new keyframe
- persist updated JSON immediately
- re-render rail and pagination
- center/focus the new prompt tile

6. Render flow
- Render is state-driven from `StateManager.getState()`.
- Rail order pattern:
- `keyframe(1)`, `prompt(1-2)`, `keyframe(2)`, `prompt(2-3)`, ..., `keyframe(n)`, `add-button`.
- Pagination items map to prompt IDs in order.

7. Data consistency guarantees
- Enforce deterministic IDs for new entities at creation time.
- Validate invariants after each mutation before save.
- If cache entry missing for a keyframe, keep keyframe metadata but show a recoverable image-missing placeholder.

8. Immediate persistence requirements
- No explicit "Save" action exists.
- Every user-initiated state change writes through to persistence immediately.
- Use a small configurable debounce constant for text-input persistence.
- Proposed constant: `const SAVE_DEBOUNCE_MS = 75;` in a shared config module.

## Restore and Recovery Rules
- If a cached image is missing/corrupt during restore, preserve storyboard order with a placeholder tile.
- Placeholder remains linked to its keyframe metadata for future re-upload/repair workflows.

## Commit Message Format
- Commit messages must start with a single sentence that summarizes all changes in the commit.
- After the summary sentence, include a bullet list describing the changes.
- Each bullet must be exactly one sentence.
- Keep bullet descriptions high-level rather than line-by-line details.
- Group similar changes into one bullet when possible.
