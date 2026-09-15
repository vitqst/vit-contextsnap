# Security policy

## Supported versions

Security fixes target the latest release on the default branch. Older releases do not
have a separate maintenance policy. This is an early-stage project; reports are handled
on a best-effort basis without a guaranteed response time.

## Report a vulnerability privately

Use GitHub's [Report a vulnerability](https://github.com/vitqst/vit-contextsnap/security/advisories/new)
form. Do not publish exploit details, private screenshots, or access tokens in public
issues or pull requests.

Include the affected version, Chrome/OS versions, impact, and minimal reproduction
steps using synthetic data. Attach only sanitized logs and images. Browser traces can
include page contents, URLs, and screenshots; review them before sharing.

If the private-reporting form is unavailable, open an issue titled "Private security
contact requested" without vulnerability details and wait for a private reporting route.
Never post credentials or sensitive data to obtain support.

## Privacy boundaries

- Screenshot capture can include anything visible on the page. There is no automatic
  detection or exclusion of passwords, personal details, or tokens.
- Use solid **Redact**, not Blur, for sensitive content. Review the final exported image
  before sharing it. Exported PNGs contain flattened pixels, not editable scene data.
- An open editor retains its original screenshot and undo history in memory. Undo may
  restore covered details until the session closes. Recent stores flattened exports only.
- Source titles and full URLs (including query parameters and fragments) are stored
  locally with captures/Recent and can themselves be sensitive. Clear Recent or remove
  the extension when appropriate.
- The extension does not upload screenshots or include telemetry. Clipboard contents,
  downloaded files, and software you paste into are outside the extension's control.

See the [README](README.md#privacy-and-data-lifetime) for storage lifetimes and limits.
