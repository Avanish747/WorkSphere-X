# WorkSphere X User Guide

This guide describes the current application, not planned functionality. Some modules have only basic CRUD support or are not connected to the UI; those limitations are called out explicitly.

## 1. Introduction and technology

WorkSphere X is an enterprise HRMS/workforce application. Its frontend uses React, Vite, Redux Toolkit, React Router, Tailwind CSS, Axios, and Recharts. The backend uses Node.js, Express, Mongoose, and MongoDB.

## 2. Installation requirements

- Node.js and npm
- MongoDB 7 or a compatible local MongoDB installation
- Docker Compose is optional

## 3. MongoDB setup

Start a local MongoDB service, or from the project root run:

```powershell
docker compose up -d mongodb
```

The provided Compose configuration maps MongoDB to port 27017 and uses a named volume. It does not configure MongoDB authentication.

## 4. Environment configuration

Create `Backend/.env` from `Backend/.env.example`. Configure:

- `PORT` (local default: `5000`)
- `NODE_ENV=development` for the local-only demo seeder
- `MONGO_URI` (local example: `mongodb://127.0.0.1:27017/workspherex`)
- `JWT_SECRET` and `JWT_REFRESH_SECRET` (unique, strong values; production must provide both)
- `CLIENT_URL` (local frontend origin: `http://localhost:5173`)
- Optional SMTP settings for email delivery

Never share or commit `.env` values. SMTP is needed to deliver verification and password-reset email. Without SMTP, password-reset tokens are returned only in non-production mode; email verification cannot be delivered.

## 5. Start the application

In separate terminals:

```powershell
cd Backend
npm install
npm start
```

```powershell
cd Frontend
npm install
npm run dev
```

The frontend defaults to `http://localhost:5173`; Vite proxies `/api` to the backend at `http://localhost:5000`. Check `http://localhost:5000/api/health` for backend/database status.

## 6. Login and registration

The registration form creates a company workspace and company-admin account. For local development, create the initial Super Admin and Company Admin with the development-only seeder from the `Backend` directory:

```powershell
$env:NODE_ENV = 'development'
npm run seed:demo
```

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@workspherex.local` | `<SET_LOCALLY> |
| Company Admin | `admin@workspherex.local` | `<SET_LOCALLY> |
| HR Manager | `hr@workspherex.local` | `<SET_LOCALLY> |
| Department Manager | `manager@workspherex.local` | `<SET_LOCALLY> |
| Finance Manager | `finance@workspherex.local` | `<SET_LOCALLY> |
| Recruiter | `recruiter@workspherex.local` | `<SET_LOCALLY> |
| Employee | `employee@workspherex.local` | `<SET_LOCALLY> |

These are shared local-development credentials, not production credentials. The seeder refuses to run unless `NODE_ENV=development`, does not reset or overwrite an existing account, and is safe to rerun. Set `DEMO_SUPER_ADMIN_*`, `DEMO_COMPANY_ADMIN_*`, role-specific `DEMO_<ROLE>_*`, and `DEMO_COMPANY_NAME` environment variables to use different development credentials. After sign-in, users open the overview appropriate to their scope; the Super Admin overview includes platform-wide active-company totals. Forgot-password and reset flows are present; email delivery depends on SMTP configuration.

## 7. Super Admin

The backend recognizes a `super_admin` role and provides privileged API access to selected platform-wide operations. A complete company-management, admin-management, platform-settings, and subscription-billing console is not currently implemented in the frontend.

## 8. Company Admin

Company admins can use employee management, department/designation and shift maintenance, attendance, leave approvals, payroll, recruitment, workspace tools, and company settings endpoints where exposed. A comprehensive company reporting suite is not present.

## 9. HR Manager

HR managers can access authorized HR workflows, including employee records, attendance, leave, recruitment, documents, and approvals. Exact access varies by API route and role.

## 10. Employee

Employees can access available personal attendance, leave, payroll, task, asset, and notification views. The backend filters many records by the employee identity associated with the account. Profile editing and account-settings screens are not fully implemented.

## 11. Employee management

Authorized HR users can search/filter employee records, add and edit employees, view employee profiles, export CSV, and deactivate employee records. Deactivation retains the employee record. Employee documents can be listed and downloaded from the profile where available.

## 12. Department and designation management

The Workspace page provides basic department and designation creation/listing. These are backed by tenant-scoped APIs. Full safe deletion and department-wise reporting workflows are not currently exposed.

## 13. Attendance

The Attendance page supports check-in/check-out, history, and calendar views. The backend includes attendance reports and shift-aware calculations. Automated absence recording and a full shift assignment workflow are not exposed in the current UI.

## 14. Leave

Employees can submit leave requests and view their balance/history. Authorized reviewers can approve or reject requests through the approvals page. Pending requests can be cancelled by eligible users. Balance categories and weekday/date rules are enforced by the backend.

## 15. Payroll

Authorized finance/admin users can maintain salary structures, generate payroll, review approval workflows, lock approved payroll, record payment status, and download PDF payslips. This is not a payment-provider integration and does not transfer funds.

## 16. Recruitment

Authorized recruiters/HR users can manage jobs, candidates, applications, stages, interviews, and recruitment analytics. Public job listings are provided by the backend; application and interview workflows should be validated against organizational requirements before production use.

## 17. Performance management

A performance schema and basic API CRUD definition exist, but there is no complete performance-review UI or end-to-end goals/review/report workflow.

## 18. Tasks and projects

The Workspace page provides basic project/task creation and task-status updates. It is not a complete project-progress, collaboration, or task-notification system.

## 19. Assets

Basic asset records and assignment fields are available through the Workspace module. A complete asset return/history workflow is not implemented.

## 20. Documents

The backend accepts PDF, JPEG, and PNG uploads up to 10 MB, checks file signatures, stores files locally, and provides tenant-scoped list/download and review endpoints. The frontend has a reusable upload helper, but the normal UI does not currently expose a complete upload workflow. Configure protected storage and retention policies before production use.

## 21. Expenses

Employees and authorized roles can submit expenses. Approval workflows exist. A complete settlement/payment and expense-reporting workflow is not implemented.

## 22. Notifications

Notifications are stored and can be listed and marked read. The current UI refreshes notifications on demand; real-time push delivery is not implemented.

## 23. Reports and analytics

Dashboard overview, attendance reports, and recruitment analytics endpoints exist. The available reports are not a complete HR, leave, payroll, or expense reporting suite.

## 24. Profile and settings

Company administrators have a company-settings API. Theme preference is stored in the browser. User profile editing, profile photos, notification preferences, and password-change screens are not fully implemented.

## 25. Audit logs, subscriptions, approvals, AI, and communication

- Audit events are written for selected operations and can be listed for authorized roles; audit coverage is not comprehensive.
- Subscription records can be read, but billing-provider integration and subscription lifecycle management are absent.
- Approval workflows cover leave, expenses, and payroll.
- The frontend includes an HR-assistant screen, but the backend `/assistant/ask` endpoint is not implemented; do not rely on it as a working service.
- A message model exists, but internal chat routes and real-time socket functionality are not implemented.

## 26. Common errors

- **Backend reports `MONGO_URI is required`:** create/configure `Backend/.env` and restart the backend.
- **Database unavailable:** ensure the MongoDB service is running and `MONGO_URI` points to it.
- **Frontend API requests fail:** verify backend port 5000 and the Vite `/api` proxy configuration.
- **Email not delivered:** configure SMTP variables; never expose SMTP credentials.
- **Port already in use:** stop the process using that port or use the alternate port printed by the server.

## Data and account safety

Do not use destructive cleanup against an existing database without first inspecting records, taking a verified backup, and obtaining explicit approval for deletions. The project does not ship with default login credentials.
