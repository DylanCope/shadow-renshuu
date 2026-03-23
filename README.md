# Configuration

## Firebase (Auth + Firestore) — required for login + session persistence

To set up Firebase for authentication and session persistence, follow these steps:

1. **Create a Firebase Project**:  
   - Go to [Firebase Console](https://console.firebase.google.com/).  
   - Click on "Add Project" and follow the setup instructions.

2. **Enable Google and Email Link Authentication**:  
   - In the Firebase console, navigate to "Authentication".  
   - Click on the "Sign-in method" tab.  
   - Enable "Google" and "Email/Password".

3. **Create Firestore**:  
   - Navigate to "Cloud Firestore" in the Firebase console.  
   - Click on "Create Database" and choose the appropriate settings for your app.

4. **Add Authorized Domains**:  
   - In the "Authentication" settings, navigate to "Authorized domains".  
   - Add `localhost` and your Vercel deployment domain.

5. **Create Composite Index on Sessions Collection**:  
   - Go to the Firestore Indexes tab.  
   - Click on "Create Index".  
   - Set the collection to `sessions` and add fields: `userId` (ASC) and `createdAt` (DESC).

6. **Set Environment Variables**:  
   - Create or update the `.env.local` file in the `frontend` directory with the following:
     - `VITE_FIREBASE_API_KEY=your_api_key`
     - `VITE_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com`
     - `VITE_FIREBASE_PROJECT_ID=your_project_id`
     - `VITE_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com`
     - `VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id`
     - `VITE_FIREBASE_APP_ID=your_app_id`
   - Ensure these variables are set also in your Vercel dashboard environment settings.

## Features
- Accounts with persistent sessions are utilized for enhanced user experience.
- Other feature descriptions here...