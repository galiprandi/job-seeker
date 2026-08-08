# Teamtailor Application POST Template

## Flow for auto-applying to Teamtailor jobs

### 1. GET job page to extract tokens
```
GET https://<company>.teamtailor.com/jobs/<slug>
```
Extract from HTML:
- `authenticity_token` (CSRF token, changes per session)
- `verify_token` (changes per session)
- Question IDs: `question_id` and `picked_question_id` for each custom field
- `job_id` (numeric, from the job URL or form)

### 2. Upload CV to S3
```
POST https://<company>.teamtailor.com/uploads/presigned_data
=> returns S3 presigned URL

POST https://<bucket>.s3.<region>.amazonaws.com/
=> returns 201 Created with the file URL
```
The resulting URL goes into `candidate[resume_remote_url]`.

### 3. Submit application
```
POST https://<company>.teamtailor.com/applications
Content-Type: application/x-www-form-urlencoded;charset=UTF-8
Headers: x-csrf-token, cookie (_tt_session), turbo-frame: application_form
```

### 4. Email verification
Teamtailor sends a verification email. The link is:
```
https://<company>.teamtailor.com/jobs/<slug>/applications/verify_email/<token>?candidate_uuid=<uuid>
```
Clicking it confirms the application and redirects to `/thanks`.

### 5. Connect profile (optional, recommended)
After first application, click "Connect" to create a reusable profile.
Future applications auto-fill from Connect, skipping step 2 (CV already on file).

## POST body structure (URL-encoded)

```
authenticity_token=<CSRF>&
verify_token=<TOKEN>&
ctoken=&
candidate[referrer]=&
candidate[linkedin_uid]=<from_linkedin_auth_or_empty>&
candidate[linkedin_url]=&
candidate[linkedin_profile]=&
candidate[facebook_id]=&
candidate[social_image_url]=<linkedin_photo_url_or_empty>&
candidate[answers_attributes][0][question_id]=<QID>&
candidate[answers_attributes][0][picked_question_id]=<PID>&
candidate[answers_attributes][0][text]=<answer>&
candidate[answers_attributes][1][question_id]=<QID>&
candidate[answers_attributes][1][picked_question_id]=<PID>&
candidate[answers_attributes][1][text]=<answer>&
... (repeat per custom question) ...
candidate[first_name]=<from_db_profile>&
candidate[last_name]=<from_db_profile>&
candidate[email]=<from_db_profile>&
candidate[phone]=<from_db_profile>&
candidate[location][query]=&
candidate[location][place_id]=&
candidate[location][address]=&
candidate[location][administrative_area]=&
candidate[location][city]=&
candidate[location][country]=&
candidate[location][lat]=&
candidate[location][long]=&
candidate[location][state]=&
candidate[location][zip]=&
candidate[resume_remote_url]=<S3_URL>&
candidate[job_applications_attributes][0][job_id]=<JOB_ID>&
candidate[consent_given]=0&
candidate[consent_given]=1&
commit=Enviar+solicitud
```

## Answer types

Custom questions can have different answer field types:
- `text`: for text answers (LinkedIn URL, GitHub URL, AWS services, yes/no questions)
- `number`: for numeric answers (years of experience, salary expectation)

The `question_id` and `picked_question_id` are per-job and per-company. They must be extracted from the job page HTML before submitting.

## Data sources (all from DB, never hardcoded)

| Field | DB path |
|---|---|
| first_name | `users.data.profile.full_name` (first part) |
| last_name | `users.data.profile.full_name` (last part) |
| email | `users.data.profile.email` |
| phone | `users.data.profile.phone` |
| linkedin_url | `users.data.profile.linkedin_profile` |
| github_url | `users.data.profile.github` |
| years_node | `users.data.profile.years_node_experience` |
| salary_expectation | `users.data.profile.salary_min_usd` converted to ARS |
| CV path | `users.data.profile.cv_path` or `users.data.personal_info.cv_pdf_path` |

## Notes

- The `authenticity_token` and `verify_token` are session-specific and must be fetched fresh for each application
- The `x-csrf-token` header is different from the `authenticity_token` form field
- Teamtailor uses Turbo (Hotwire) for form submissions, so the response is `text/vnd.turbo-stream.html`
- After submission, an email verification is required. The agent should check Gmail for the verification link and click it automatically
- Connect profile eliminates the need to re-upload CV and re-fill basic info for future applications at the same company
