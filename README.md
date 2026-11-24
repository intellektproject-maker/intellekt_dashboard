# Intellekt Academy Dashboard

A web-based tuition-centre management platform for students, faculty and administrators. It centralizes student records, academic performance, attendance, fees, enquiries, faculty tasks and notifications.

> **Project status:** Academic/operational project. The current source snapshot needs authentication, authorization and password-storage hardening before it should be treated as production-secure. Do not publish real credentials or student records.

## Project overview

Intellekt provides role-oriented dashboards for a coaching centre. Students can view their academic information, while faculty and administrators manage academic and operational workflows through a web interface.

The repository contains a Next.js/React frontend and a Node.js/Express API backed by PostgreSQL. Firebase Admin is used by backend notification services when its service-account configuration is supplied.

## System architecture

~~~mermaid
flowchart LR
  A[Browser] --> B[Next.js and React UI]
  B -->|HTTP / JSON| C[Express API]
  C --> D[PostgreSQL]
  C --> E[Firebase Admin SDK]
  E --> F[Push notifications]
  D --> C
  C -->|JSON responses| B
~~~

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React, JavaScript/JSX |
| Styling | Tailwind CSS |
| Charts and reporting | Chart.js, react-chartjs-2, jsPDF, html2pdf.js |
| Backend | Node.js, Express |
| Database | PostgreSQL, node-postgres (pg) |
| Notifications | Firebase Admin SDK |
| Configuration | dotenv |

## Key features

- Role-based user journeys for students, faculty and administrators.
- Student profiles and records.
- Marks entry, marks management and academic reports.
- Attendance entry, viewing and reporting.
- Test scheduling, test posting and test-batch workflows.
- Fee information and faculty fee-management tools.
- Student enquiries and admission-related workflows.
- Faculty task assignment and task tracking.
- Faculty and student notification inboxes, including push-notification integration.
- Syllabus and student answer-sheet request workflows.
- PDF/report generation in the frontend.

## Repository structure

~~~text
intellekt-dashboard/
  app/
    login/                  # Login screen
    reset-password/         # Password reset flow
    student/                # Student dashboard and pages
    faculty-dashboard/      # Faculty/admin workflows
    test-batch/              # Test-batch student UI
    components/              # Shared UI components
  backend/
    server.js                # Express routes and server startup
    db.js                    # PostgreSQL connection pool
    faculty-notification-service.js
    student-notification-service.js
    test-batch-push-worker.js
    record_edit_requests.js
    test_batch_edit_requests.js
  package.json
  .env.example
~~~

## Setup and installation

### Prerequisites

- Node.js (use an active LTS release)
- npm
- PostgreSQL database
- Firebase service-account credentials if push notifications are required

### 1. Install dependencies

~~~bash
git clone https://github.com/intellektproject-maker/intellekt_dashboard.git
cd intellekt_dashboard/intellekt-dashboard
npm install
~~~

### 2. Configure the backend

Create backend/.env because backend/db.js loads the environment file from the backend directory:

~~~dotenv
DATABASE_URL=postgresql://DB_USER:DB_PASSWORD@DB_HOST:5432/DB_NAME
PORT=5050
NODE_ENV=development
FIREBASE_SERVICE_ACCOUNT_JSON=
~~~

If Firebase push notifications are enabled, set FIREBASE_SERVICE_ACCOUNT_JSON to the service-account JSON securely in the backend environment. Do not commit the JSON or its private key.

### 3. Configure the frontend

Create .env.local in the intellekt-dashboard project root:

~~~dotenv
NEXT_PUBLIC_API_URL=http://localhost:5050
NEXT_PUBLIC_API_BASE=http://localhost:5050
~~~

Variables prefixed with NEXT_PUBLIC_ are bundled for browser use and must never contain secrets. The checked-in .env.local in the current repository contains API endpoint configuration, not a private API credential; it should still be ignored as a local environment file.

### 4. Start the backend and frontend

In terminal 1, from the intellekt-dashboard directory:

~~~bash
npm run backend
~~~

In terminal 2:

~~~bash
npm run dev
~~~

Open the local Next.js address printed by the development server (normally http://localhost:3000). The API listens on the configured PORT (normally 5050).

## API documentation

The Express API is implemented primarily in backend/server.js. The current repository does not include a generated OpenAPI/Swagger specification, so use the route handlers and request validation in that file as the source of truth.

| Method | Endpoint | Purpose |
|---|---|---|
| POST | /login | Authenticate a student, faculty member or admin |
| PUT | /reset-password | Update a user's password |
| GET | /student/:rollNo | Retrieve a student profile |
| GET | /attendance/:rollNo | Retrieve attendance for a student |
| GET | /marks/:roll | Retrieve marks for a student |
| GET | /test-schedule/:roll | Retrieve a student's test schedule |
| GET | /fees/:roll | Retrieve student fee information |
| POST | /marks | Create marks records |
| PUT | /update-marks | Update marks |
| POST | /attendance | Create attendance records |
| PUT | /attendance | Update attendance records |
| GET/POST | /enquiries | List or submit enquiries |
| GET/POST/PUT/DELETE | /faculty-tasks | Manage faculty tasks |
| GET/POST | /test-batch/tests | Manage test-batch tests (some routes have route-level access checks) |

The backend also exposes routes for faculty/student notifications, fees, student/faculty management, syllabus, edit requests and test-batch marks/attendance. Check backend/server.js for the complete route list and exact payloads.

## Security and deployment notes

The current source snapshot has issues that should be addressed before production use:

- Passwords are compared and written as plaintext in the login and reset-password flows. Migrate to Argon2id/bcrypt hashes and force password resets after migration.
- The main Express app enables permissive CORS with cors(); restrict allowed origins.
- Many regular student/faculty/admin routes appear to rely on identifiers supplied by the client. Add server-side authentication and role/record-level authorization to every protected route; do not rely on hiding UI pages.
- Keep database and Firebase service-account credentials only in backend deployment secrets or ignored local files.
- Ignore .env.local and all environment variants in Git, while retaining a sanitized .env.example.
- Use HTTPS, request validation, rate limiting, secure session/token handling, audit logging and database backups.

## API environment variables

- DATABASE_URL: PostgreSQL connection string (backend only).
- PORT: Express server port.
- NODE_ENV: runtime environment.
- FIREBASE_SERVICE_ACCOUNT_JSON: optional Firebase Admin service-account JSON (backend only).
- NEXT_PUBLIC_API_URL / NEXT_PUBLIC_API_BASE: browser-visible API base URL; these are not secrets.
