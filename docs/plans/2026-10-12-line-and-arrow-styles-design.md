# Line Tool and Arrow Styles Design

## Goal

Add a precise editable line tool and expand arrows with one-way/two-way direction plus standard/bold visual styles on desktop and in the shared editor.

## Line behavior

**Line (L)** creates a plain segment with no arrowhead or label. It uses the shared color, thickness, sketch, and shadow settings and participates in selection, movement, endpoint resizing, duplication, layer ordering, undo/redo, magnifiers, privacy protection, document expansion, and export. Holding Shift during creation or endpoint editing snaps the moving endpoint to the nearest multiple of 45 degrees around the fixed endpoint. Releasing Shift returns to free-angle placement.

## Arrow behavior

Selected arrows expose independent **Direction** (`One-way` or `Two-way`) and **Arrow style** (`Standard` or `Bold`) controls. Existing and newly created arrows default to one-way Standard, preserving current documents pixel-for-pixel unless the user changes the controls.

Standard arrows keep the existing open stroked head; Two-way adds a matching head at the start. Bold arrows use a filled tapered silhouette: a sharp tail widens toward a large filled head, matching the supplied reference. Bold Two-way arrows have filled heads at both endpoints and a narrower center. Both styles follow the current quadratic bend and retain the existing endpoint, middle bend, label, shadow, and layer behavior.

## Architecture

The document model gains a first-class two-point `LineObject` and optional arrow appearance fields for backward compatibility. Pure core helpers own 45-degree snapping, endpoint tangents, standard head geometry, and sampled bold silhouettes. Rendering, hit testing, visual bounds, selection handles, and document bounds consume those shared helpers so preview and export agree.

## Testing

Unit tests cover snapping, line movement/hit testing/bounds, legacy arrow defaults, two-way heads, and bold straight/curved silhouettes. Desktop Playwright tests cover the toolbar and `L` shortcut, free and Shift-snapped gestures, endpoint editing, arrow property controls, undo/redo, and exported pixels. Existing arrow tests protect legacy behavior.
