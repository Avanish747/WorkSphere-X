# WorkSphere X

WorkSphere X is an existing MERN workforce management application. The repository contains a React/Vite frontend and an Express/Mongoose backend. Features described here reflect the current source code; see [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md) for verified gaps and test results, and [USER_GUIDE.md](./USER_GUIDE.md) for usage instructions.

## Requirements

- Node.js and npm
- MongoDB 7 or a compatible local MongoDB server
- Docker Compose is optional if MongoDB is not installed locally

## Local setup

1. Configure `Backend/.env` using `Backend/.env.example` as a reference. For local work, keep `NODE_ENV=development`; set `PORT`, `MONGO_URI`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `CLIENT_URL`. Use unique, strong secrets; never commit `.env`.
2. Start MongoDB. With Docker Compose: `docker compose up -d mongodb`. Alternatively, start your local MongoDB service.
3. In a terminal, create the development-only demo accounts and then run the backend:

   ```powershell
   cd Backend
   npm install
   $env:NODE_ENV = 'development'
   npm run seed:demo
   npm start
   ```

4. In a second terminal, run the frontend:

   ```powershell
   cd Frontend
   npm install
   npm run dev
   ```

Vite serves the frontend on port 5173 by default and proxies `/api` requests to `http://localhost:5000`. If the port is occupied, Vite selects another port and reports it in the terminal.

Development login credentials (only for a local development database):

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@workspherex.local` | `<SET_LOCALLY> |
| Company Admin | `admin@workspherex.local` | `<SET_LOCALLY> |
| HR Manager | `hr@workspherex.local` | `<SET_LOCALLY> |
| Department Manager | `manager@workspherex.local` | `<SET_LOCALLY> |
| Finance Manager | `finance@workspherex.local` | `<SET_LOCALLY> |
| Recruiter | `recruiter@workspherex.local` | `<SET_LOCALLY> |
| Employee | `employee@workspherex.local` | `<SET_LOCALLY> |

The seeder refuses to run unless `NODE_ENV=development`, does not overwrite existing accounts, and can be run again safely. Override account values with `DEMO_SUPER_ADMIN_*`, `DEMO_COMPANY_ADMIN_*`, role-specific `DEMO_<ROLE>_*`, and `DEMO_COMPANY_NAME` environment variables when needed. Never use these credentials outside local development.

## Useful commands

- Backend tests: `cd Backend; npm test`
- Frontend lint: `cd Frontend; npm run lint`
- Frontend production build: `cd Frontend; npm run build`
- Optional MongoDB container status: `docker compose ps mongodb`

The backend health endpoint is `http://localhost:5000/api/health`. It returns an unavailable status if the database is disconnected.

## Current limitations

Core authentication, employee, attendance, leave, payroll, recruitment, and approval flows have source implementations. Several other areas remain partial or unimplemented; do not treat model definitions or generic CRUD as a complete business workflow. See [DEVELOPMENT_STATUS.md](./DEVELOPMENT_STATUS.md).
