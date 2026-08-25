# Outlook 365 add-event deeplink

A way to pre-fill and open a new Outlook 365 / Microsoft 365 calendar event without navigating through the UI.

## URL template

```
https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=<TITLE>&startdt=<START>&enddt=<END>&body=<BODY>&location=<LOCATION>
```

## Parameters

| Param | Meaning | Format |
|-------|---------|--------|
| `subject` | Event title | URL-encoded string |
| `startdt` | Start date/time | ISO 8601, e.g. `2026-08-24T14:00:00` |
| `enddt` | End date/time | ISO 8601, e.g. `2026-08-24T15:00:00` |
| `body` | Event body | URL-encoded string |
| `location` | Location | URL-encoded string |
| `rru` | Required | Must be `addevent` |
| `path` | Required | Must be `/calendar/action/compose` |

## Example

```
https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent&subject=Rotación%20token%20PAT%20GitHub&startdt=2026-08-24T14:00:00&enddt=2026-08-24T15:00:00&body=Rotación%20y%20baja%20de%20PAT%20Classic%20de%20GitHub
```

This opens Outlook in compose mode with the event fields pre-filled. The user must still click **Guardar/Save**.

## Gotchas

- The tenant domain may differ (`outlook.office.com`, `outlook.cloud.microsoft`, or an organizational URL). Use the tenant that matches the signed-in account.
- If the session is not authenticated, the link redirects to a Microsoft sign-in.
- Outlook sometimes appends `rdata=` or other query params after redirect; this does not affect the pre-filled data.
- Times without a trailing `Z` are interpreted in the user's local time zone, which is usually the desired behavior.
- The deeplink ignores the calendar date query (`date=`); the `startdt` and `enddt` parameters determine the event date.

## Verification

After opening the link, the event compose form shows the provided title and the date/time range. After saving, the event appears in the target calendar on the correct day.

Validated 2026-08-19 against live Outlook 365 (corporate tenant).
