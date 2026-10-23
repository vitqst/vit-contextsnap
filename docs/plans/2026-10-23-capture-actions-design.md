# Screenshot actions and configurable shortcuts

The desktop editor and tray provide Screenshot and Screenshot & Copy. Both use the existing
native system picker, preserve the document on cancellation or capture failure, and replace
the scene after a successful capture. Screenshot & Copy additionally sends the newly captured
PNG to the native clipboard, with a success toast or an actionable error. Copy failure leaves
the image available in the editor.

A keyboard button opens shortcut settings. The defaults are Ctrl+Shift+4 and
Ctrl+Shift+Alt+4. Native global shortcut registration routes pressed events through the same
tray event path, including while the editor is hidden. Empty fields disable registration.
Validation rejects malformed, unmodified, and equivalent shortcuts. Settings are persisted
atomically in the application's configuration directory. Changes register new keys before
removing old ones, and roll back registration changes if registration or saving fails.

Verification covers frontend actions, cancellation, tray routing, PNG clipboard bytes,
shortcut configuration, and native parsing. Operating-system registration depends on desktop
support and shortcut availability; failures remain visible in the settings dialog.
