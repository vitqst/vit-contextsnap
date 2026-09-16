# Card-based note sizing and Vietnamese input

## Requested behavior

- Automatic sticky-note text sizing should use the available card, growing short text
  and shrinking longer text without changing card dimensions.
- Vietnamese intermediate composition should paint on the card before Enter.
- Notes and labels need visible font-size presets and a slider instead of a dropdown.

## Design

Notes default to automatic sizing. Fit the largest font within the padded card using the
existing bounded search and position-independent cache. A manual slider/preset chooses a
preferred size while retaining shrink-to-fit for overflow; an Auto button restores card
sizing. Existing notes without an explicit mode use Auto. Text boxes retain their wrapping
width and automatic height. Label size stays independent of its owning shape.

A shared properties control provides a labeled slider, current size, and visible numeric
presets. Drag changes preview immediately and commit one undo step on release; canceled
gestures restore the prior value. Discrete keyboard steps/presets remain undoable.

The installed Wry 0.55.1 Linux backend explicitly disables WebKitGTK input preedit. The
system is using IBus Bamboo with embedded preedit enabled, so change the desktop webview
setting rather than the user's input-method settings. Leave macOS unchanged. The existing
canvas preview already handles standard composition input; avoid manually reconstructing
or writing unfinished IME text into the native buffer.

## Verification

Add failing core sizing and browser control tests before implementation. Verify font
growth/shrink/recovery, width/height changes, manual settings, undo/cancel, cache reuse,
and safe truncation. Exercise real Chromium IME composition plus cross-engine input and
composition shortcut regressions. Verify the Linux preedit override with native tests,
then run unit, Chromium/WebKit interaction/performance suites and a Linux package build.
