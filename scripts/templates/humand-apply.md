# Humand.co ATS Application Template

## Flow for applying to jobs on Humand.co

### 1. GET job page
```
GET https://jobs.humand.co/<company>/jobs/<job_id>
```

### 2. GET application form
```
GET https://jobs.humand.co/<company>/jobs/<job_id>/apply
```

### 3. Create guest session for file upload
```
POST https://jobs.humand.co/api/file-assets/guest-session
=> returns session token
```

### 4. Upload CV
```
POST https://jobs.humand.co/api/file-assets/public
=> returns S3 presigned URL for PUT upload

PUT https://hu-multimedia-prod.s3-accelerate.amazonaws.com/public/pending/<id>/<filename>.pdf?AWSAccessKeyId=...
=> returns 200 OK
```

### 5. Submit application
```
POST https://jobs.humand.co/api/jobs/apply
Content-Type: application/json
```

### 6. Response
```
200 OK with { success: true, message: "Application received" }
```
Redirects to `/disbyte/jobs/<job_id>/apply?success=true`

## Required fields

| Field | DB source | Notes |
|---|---|---|
| first_name | `users.data.profile.full_name` (first) | |
| last_name | `users.data.profile.full_name` (last) | |
| phone | `users.data.profile.phone` | Country code selected separately |
| email | `users.data.profile.email` | |
| birth_date | `users.data.personal_info.date_of_birth` | Format: MM/DD/YYYY |
| resume | `users.data.personal_info.cv_pdf_path` | Upload to S3 via guest session |
| linkedin_url | `users.data.profile.linkedin_profile` | |
| consent | `true` | Privacy checkbox |

## Notes

- Humand uses JSON API (not form-encoded like Teamtailor)
- File upload requires a guest session token
- CV is uploaded to S3 directly with a presigned PUT URL
- The application endpoint is always `https://jobs.humand.co/api/jobs/apply`
- After successful apply, the page shows "Thank you for your application"
