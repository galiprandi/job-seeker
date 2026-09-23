# Google Calendar add-event deeplink

A way to pre-fill and open a new Google Calendar event without navigating through the UI.

## URL template

```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=<TITLE>&dates=<START>/<END>&details=<BODY>&location=<LOCATION>&ctz=<TIMEZONE>
```

## Parameters

| Param | Meaning | Format |
|-------|---------|--------|
| `text` | Event title | URL-encoded string |
| `dates` | Start and end time | `YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ` in UTC |
| `details` | Event body | URL-encoded string |
| `location` | Location | URL-encoded string |
| `ctz` | Display time zone | IANA zone, e.g. `America/Argentina/Buenos_Aires` |

## Example

```
https://calendar.google.com/calendar/render?action=TEMPLATE&text=Rotación%20token%20PAT%20GitHub&dates=20260824T170000Z/20260824T180000Z&details=Rotación%20y%20baja%20de%20PAT%20Classic%20de%20GitHub&ctz=America/Argentina/Buenos_Aires
```

This opens Google Calendar with the fields pre-filled. The user still must confirm/save.

## Gotchas

- Times must be in UTC and end with `Z` for reliable conversion to the viewer's local time.
- The event is not saved until the user clicks save in the UI.
- If the user is not signed in, the link redirects to a sign-in page first.
- All day events can use `dates=20260824/20260825` without a time component.

## Verification

After opening the link, the page title and form should reflect the provided title, date, and time.

Validated 2026-08-19 against live Google Calendar.
