# Task Master Pro - Cloud Sync PWA

A Progressive Web App with real-time cloud synchronization across multiple browsers and devices.

## Features

- **Cloud Synchronization**: Tasks are synced to Firebase Firestore in real-time
- **Multi-Browser Support**: Access your tasks from any browser using your Sync ID
- **Offline Mode**: Full functionality even without internet connection
- **Background Sync**: Offline changes sync automatically when connection is restored
- **Personalized Profile**: Customizable user profile with initials avatar
- **Dark Mode**: Eye-friendly dark theme option
- **Push Notifications**: Get notified when tasks are added

## Setup Instructions

### 1. Create a Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project" and follow the setup wizard
3. Once created, click the web icon (</>) to add a web app
4. Copy your Firebase configuration

### 2. Configure the App

Open `app.js` and replace the placeholder Firebase config with your actual keys:

```javascript
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
};
```

### 3. Set Up Firestore

1. In Firebase Console, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" for development
4. Select your preferred region

### 4. Deploy or Serve

**Local Development:**
- Use VS Code's "Live Server" extension
- Or run: `npx serve .`

**Production Deployment:**
- Firebase Hosting: `firebase deploy`
- GitHub Pages
- Netlify / Vercel

## Syncing Across Browsers

1. Open the app in your first browser
2. Go to **Settings** and note your **Sync ID**
3. Open the app in another browser
4. Go to **Settings** → Click on **Sync ID**
5. Enter the Sync ID from the first browser
6. Your tasks will now sync across both browsers!

## File Structure

```
task-app/
├── index.html      # Main HTML structure
├── style.css       # Styling and themes
├── app.js          # Application logic & Firebase
├── sw.js           # Service Worker for offline
├── manifest.json   # PWA manifest
└── README.md       # This file
```

## Technologies Used

- HTML5 / CSS3 / Vanilla JavaScript
- Firebase Firestore (Cloud Database)
- Service Workers (Offline Support)
- Web App Manifest (PWA)
- Geolocation API
- Notifications API

## Sync System

The app uses a robust sync system:

1. **Local-First**: All changes are saved locally immediately
2. **Pending Queue**: Offline changes are queued for later sync
3. **Realtime Listener**: Firebase onSnapshot for instant updates
4. **Auto-Sync**: Pending changes sync automatically when online

## Troubleshooting

- **Tasks not syncing?** Check Firebase config in app.js
- **Offline indicator not showing?** Refresh the page
- **Data not appearing on other device?** Use the same Sync ID

## Version

3.2.0 (Cloud Sync Edition)
