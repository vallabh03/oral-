# Cross-device acceptance checklist

What the automated tests already prove on every build (Chromium, Linux):

- No sideways scrolling or overflow on the public site, the staff workspace, the virtual-screening
  journey and the doctor's review screens at 320×568, 375×667, 390×844, 430×932, 844×390,
  768×1024, 1024×768, 1180×820, 1366×768, 1440×900, 1920×1080 and 2560×1440
  (`tests/e2e/responsive.spec.ts`, `tests/e2e/responsive-virtual.spec.ts`).
- Every button, field and tappable control is at least 40 px tall and wide; fixed elements and the
  full-size photo viewer stay inside the screen; no console errors or failed requests.
- Accessibility (axe, WCAG 2.1 AA serious/critical) in light and dark mode on desktop, tablet and
  Pixel 7 emulation (`tests/e2e/a11y.spec.ts`).
- The camera and the photo flow with a fake camera; the identity photo, the clinical close-up and
  the five virtual views; the doctor's review and the participant's result.

What only a real device can prove. Do this once per release that touches the camera, the photo
pages or the layout, and record the result in the table.

## Devices and browsers

| # | Device | Browser | Tester | Date | Result |
|---|---|---|---|---|---|
| 1 | iPhone (any recent) | Safari | | | |
| 2 | Android phone | Chrome | | | |
| 3 | Android phone (Samsung) | Samsung Internet | | | |
| 4 | iPad | Safari | | | |
| 5 | Android tablet | Chrome | | | |
| 6 | Windows laptop | Chrome | | | |
| 7 | Windows laptop | Edge | | | |
| 8 | Desktop | Firefox | | | |
| 9 | macOS laptop | Safari | | | |

## Steps on each device

Use synthetic details (a test name, your own mobile) and delete the test participant afterwards
from the workspace.

1. **Register virtually**: `/register?mode=virtual`. Every field is reachable, the keyboard does not
   hide the field being typed in, and the Continue/Register buttons are visible above the keyboard
   and the browser's bottom bar. Turn the phone sideways once; nothing is cut off.
2. **Questionnaire**: each option is selectable with a thumb; the Submit answers button works.
3. **Guide video**: plays inline (no full-screen takeover on iPhone), sound works after a tap, the
   language buttons switch the video, and "Start taking photos" enables only at the end.
4. **Camera, phone held normally**: "Take photo" opens the camera (front for "I am", back for
   "Someone is helping me"). Deny the permission once: the message offers the gallery instead.
   Allow it: the preview shows the live image, not a black box; the captured photo appears in the
   card with "Looks clear" or a warning.
5. **Gallery**: "Choose from gallery" accepts a photo from the camera roll. On iPhone with HEIC
   photos the browser converts to JPEG; if a photo is refused, the message tells the person what
   to change (Camera › Formats › Most Compatible).
6. **Save and submit**: the progress bar runs, "Added ✓" appears, and after at least one photo the
   Submit button works. Put the phone in airplane mode mid-upload once: "The connection dropped"
   appears, and "Try again" completes the same photo without retaking it.
7. **Result page**: the status and timeline are readable; the resume link reopens the page.
8. **Doctor (tablet and laptop)**: sign in, open Virtual review, open the case. Photos load, the
   full-size viewer opens, pinch-zooms on touch, and closes with the X and with Escape. Record a
   decision with a lesion location; the confirmation reads correctly; the outcome appears below.
9. **Patient record (phone)**: the record page scrolls without sideways movement; the identity photo
   loads; menus open from the compact navigation.
10. **Dark mode and large text**: switch the system to dark mode and the largest text size; all
    pages stay readable and nothing overlaps.

Anything that fails: note the device, browser, step, and a screenshot in the issue tracker.
