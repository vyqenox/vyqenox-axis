# Vyqenox Axis

Vyqenox Axis is a modern school operations workspace designed for managing finance, staff records, attendance, payroll, reporting, and automation from a single dashboard.

The project combines a static front-end interface with a lightweight Node.js server and Firebase services for authentication and Firestore-backed data storage.

## Overview

This app is built for education and school-management workflows, with a single sign-on experience and role-based access for members of a school workspace. It includes:

- Overview dashboard with key operational metrics
- Finance tracking and balances
- Staff management views
- Attendance monitoring
- Payroll workflows
- Reporting and automation modules
- Settings and configuration screens
- Firebase-based account creation and school workspace setup

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js HTTP server
- Authentication: Firebase Authentication
- Database: Firestore
- Hosting: compatible with static hosting + a Node.js server

## Project Structure

```text
.
├── app.js                 # Frontend app logic and Firebase initialization
├── config.js              # Browser-side config loaded from the server
├── index.html             # Main application shell and dashboard UI
├── server.js              # Local static file server and Firebase config endpoint
├── styles.css             # Core styling
├── vyqenox-theme.css      # Theme styles for the product UI
├── auth-check.css         # Authentication loading styles
├── firestore.rules        # Firestore security rules
├── .env.example           # Firebase environment variable template
├── .env                   # Local secrets and Firebase config (not committed)
├── package.json           # Node.js project metadata and scripts
├── assets/                # Brand and UI assets
├── README-VYQENOX.md      # Existing project notes and setup summary
└── sitemap.xml            # SEO sitemap
```

## Features

### School workspace flow

- User sign-up and login with email/password
- School creation during first-time onboarding
- Firestore user profile and school membership setup
- Workspace loading based on the active school and user role

### Dashboard experience

- Overview screen with KPI cards and operational summaries
- Cash-flow and reporting panels
- Navigation for key operational modules
- Workspace branding for VYQENOX and school-specific details

### Secure local configuration

- Firebase web settings are loaded from a local `.env` file
- The Node server exposes only `/firebase-config` to the browser
- Sensitive values are never served directly from the app source

## Prerequisites

- Node.js 20.12 or newer
- A Firebase project with:
  - Authentication enabled
  - Email/Password sign-in enabled
  - Firestore database created

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Copy the example environment file and fill in your Firebase values:

```bash
copy .env.example .env
```

Then update `.env` with your Firebase project configuration:

```env
FIREBASE_API_KEY=your_api_key
FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_STORAGE_BUCKET=your_project.appspot.com
FIREBASE_MESSAGING_SENDER_ID=your_sender_id
FIREBASE_APP_ID=your_app_id
FIREBASE_MEASUREMENT_ID=your_measurement_id
```

3. Start the app locally:

```bash
npm run dev
```

4. Open the app in your browser:

```text
http://localhost:4173
```

## Firebase Setup Notes

Before testing sign-up flows:

- Enable Email/Password authentication in the Firebase Console
- Create and initialize Firestore
- Review and publish the rules from `firestore.rules`
- Ensure the project allows the app to create user, school, and membership documents

The app creates records such as:

- `users/{uid}`
- `schools/{schoolId}`
- `schools/{schoolId}/members/{uid}`

## Local Development

The application is served with the included Node.js server. This server:

- serves the static front-end files
- blocks access to `.env` files
- exposes Firebase config only through `/firebase-config`
- runs on port `4173` by default

You can change the port by setting:

```env
PORT=4173
```

## Security Notes

- Never commit `.env` to source control
- Do not place service-account credentials or private keys in the frontend config
- Treat Firestore rules as part of your security setup and review them before production use

## License

This project does not currently declare an explicit license in the repository. If you plan to distribute or reuse it, confirm the licensing terms before doing so.

## Credits

The product is branded as VYQENOX and the app references the official website:

- https://vyqenox-official.netlify.app/

