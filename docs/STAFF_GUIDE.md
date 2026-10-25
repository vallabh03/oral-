# Staff guide (draft)

## Signing in
Go to `/workspace/login`. Enter your work email and password ("Show" reveals it), then the 6-digit code
from your authenticator app. First sign-in: use the one-time setup link, choose a password (12+ characters)
and scan the QR code to set up two-step verification. Shared camp devices sign out after 15 minutes idle.

## Admin (Doctor)
1. **Find the participant** — Participants → search by ID (`HAOC-DS-0012`), 10-digit mobile, exact full
   name, or **Scan QR** from the participant's phone. Partial names never match (privacy).
   Use **Privacy screen** on shared displays.
2. **Confirm identity** — compare the person with the photo on the record.
3. **Check in** — press *Check in*.
4. **Photo** — if photo consent is given and no photo exists (or it is poor), press *Take photo*.
5. **Questionnaire** — if incomplete, read each question aloud and record the participant's answers.
6. **Examination** — record findings, lesion site, *Lesion present* and clinical impression; *Save draft*.
7. **Verify** — press *Verify examination* and confirm. Verified exams are locked; changes need
   *Record a correction* with a reason. The screening group is calculated only after verification;
   "Uncertain" lesions are not grouped and need specialist referral.
8. **Report** — *Generate report*, open it, *Print / save as PDF*.
9. **Follow-up** — record referral, due date and cessation outcome.

Camp-assisted registration: *Register participant* → details → read each consent aloud and tick only
what the person agrees to → take the identity photo → *Open record*.

## Super Admin
Staff & roles (create accounts, change roles, deactivate, reset MFA — you cannot change your own
role), Camps (public camps appear on `/camps`), Sessions (end a session immediately), Audit & errors
(the overview shows whether the tamper-evident audit chain verifies).

## Assistant
Analytics only: filter by camp/date and download the de-identified CSV (no names, phones, IDs or notes).

## Never
Share screenshots or exports of records on WhatsApp/personal devices, photograph lesions in this
system, or use a colleague's account.
