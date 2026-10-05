# Vyqenox Axis

Vyqenox Axis is a school operations workspace for finance, staff, attendance, payroll, reporting, and automation.

## Run locally

Requires Node.js 20.12 or newer.

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

## Firebase setup

The browser app uses the Firebase modular web SDK. Set the existing project's web configuration in the local `.env` file using the variable names in `.env.example`. The Node server loads those values and exposes only the Firebase web configuration to the browser through `/firebase-config`; `.env` is not served and is ignored by Git.

Enable Email/Password in Firebase Authentication and create the Cloud Firestore database. The project includes [firestore.rules](firestore.rules) for the user, school, and initial director-membership flows. Review and merge these permissions with any existing rules, then publish them in the Firebase Console before testing signup; do not overwrite rules for other collections without reviewing them.

New accounts create a `users/{uid}` profile, a generated `schools/{schoolId}` document, and `schools/{schoolId}/members/{uid}` in one Firestore batch. Returning users load only the school and role linked from their Firestore profile.

Firebase web configuration is delivered to browsers and is not a server secret. Never put service-account credentials or private keys in this file.
