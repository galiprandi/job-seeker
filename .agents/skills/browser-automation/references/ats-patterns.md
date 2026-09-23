# ATS Patterns

Platform-specific patterns for applying via career pages and reading scheduling links.

## Ashby

Ashby powers career pages (`jobs.ashbyhq.com/<company>`) and recruiter scheduling links (`you.ashbyhq.com/meeting/<id>`).

### Application form

**URL pattern:** `https://jobs.ashbyhq.com/<company>/<job-id>/application`

**Form structure (standard fields):**

| Field | Input type | Selector | Notes |
|---|---|---|---|
| Name | text | `#_systemfield_name` | |
| Email | email | `#_systemfield_email` | |
| Phone | tel | `#<uuid>` (no stable id) | Use `input[type=tel]` |
| Resume | file | `#_systemfield_resume` | PDF/DOCX/RTF |
| Expected Salary | number | `#<uuid>` (no stable id) | Use `input[type=number]` |
| Custom questions | radio/text | `#<uuid>-labeled-radio-0/1` | Yes/No radios |

**File upload flow:**

The form has two file inputs: an autofill one (index 0, for resume parsing) and the actual resume field (`#_systemfield_resume`). The autofill input is optional.

To upload the resume:
1. Click the "Upload File" button (there are two, target the one inside the resume section, not the autofill section). The resume section button has class `._button_10xk4_106`.
2. A file chooser modal opens.
3. Upload via: `playwright-cli -s=<session> upload "<path-to-cv>"`
4. The file chooser is handled automatically.

**Filling fields:**

Use `playwright-cli -s=<session> fill "<selector>" "<value>"` for text/email/tel/number fields. For selectors without stable ids, use attribute selectors: `input[type=tel]`, `input[type=number]`.

For radio buttons (Yes/No questions), use eval to click:
```js
document.getElementById('<radio-id>-labeled-radio-0').click()  // Yes
document.getElementById('<radio-id>-labeled-radio-1').click()  // No
```

**Submit:**

The submit button is `button[type=submit]` or a button containing text "Submit Application". Click via eval:
```js
document.querySelector('button[type=submit]').click()
```

**Confirmation:**

After successful submission, the page shows: "Your application was successfully submitted. We'll contact you if there are next steps."

**Notes:**
- The form loads asynchronously ("Fetching application form" text appears). Wait 5-10 seconds after navigating to the application URL before interacting.
- Snapshot may not reflect the loaded form. Use `eval` with `document.body.innerText` or `document.querySelector('[role=tabpanel]')?.innerText` to verify form state.
- Some postings are region-restricted (e.g: "Remote - USA"). The form still accepts submissions from other regions, but the application may be auto-rejected.

### Scheduling links

**URL pattern:** `https://you.ashbyhq.com/meeting/<meeting-id>`

**Reading available slots:**

1. Navigate to the scheduling URL. The page shows "Loading Meeting Request..." then renders a calendar.
2. Set the timezone: find the `<select>` element and set its value to the user's timezone (e.g: `America/Argentina/Buenos_Aires`). React requires the native setter:
   ```js
   const select = document.querySelector('select');
   const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
   setter.call(select, 'America/Argentina/Buenos_Aires');
   select.dispatchEvent(new Event('change', { bubbles: true }));
   ```
3. Available days have class `_available` (e.g: `_available_gc9ve_220`). Extract them:
   ```js
   document.querySelectorAll('._available_gc9ve_220')
   ```
4. Click a day to load time slots for that day.
5. Time slots appear in elements with class `_selectableTime_14u5w_286`. Extract text:
   ```js
   Array.from(document.querySelectorAll('._selectableTime_14u5w_286')).map(el => el.textContent.trim())
   ```
   Slots are in the selected timezone format (e.g: "1:00pm - 1:30pm").

**Filtering by user availability:**

After extracting slots, filter by the user's `availability` preferences from DB (`users.data.availability`):
- `preferred_hours`: keep only slots within this range
- `blocked`: exclude specific day/time combinations (e.g: `tuesday: "14:00-15:00"`)
- `timezone`: convert slots if the page timezone doesn't match

**Notes:**
- The calendar shows ~6 weeks. Days outside the current month may have class `react-datepicker__day--outside-`.
- The page may open with a specific week pre-selected (URL: `/availability/calendar/<YYYY-MM-DD>/`).
- Do NOT book slots programmatically. Only extract and present filtered options to the user.
