# 🔥 Firebase Setup Guide (5 minutes, free)

Follow these steps to enable cloud sync across all your devices.

---

## Step 1 — Create a free Firebase project

1. Go to **https://console.firebase.google.com**
2. Sign in with your Google account
3. Click **"Add project"**
4. Name it: `sales-record` → click Continue → Disable Google Analytics → click **Create project**

---

## Step 2 — Enable Email/Password login

1. In your project, click **Authentication** in the left menu
2. Click **Get started**
3. Under "Sign-in method", click **Email/Password**
4. Toggle the first switch **ON** → click **Save**

---

## Step 3 — Create the database (Realtime Database — FREE, no billing needed)

> ✅ Unlike Firestore, **Realtime Database** is 100% free on Firebase's Spark plan — no credit card required!

1. Look in the **left menu** for **"Realtime Database"** and click it
   - If you don't see it directly, scroll down the left menu and click **"All products"** — then find and click **Realtime Database**
2. Click **Create database**
3. Choose your database location → click **Next**
4. On the security rules screen, select **"Start in test mode"** → click **Enable**

That's it! Your free database is ready.

---

## Step 4 — Get your config keys

1. Click the **gear icon** (⚙️) next to "Project Overview" → **Project settings**
2. Scroll to **"Your apps"** → click the **`</>`** (web) icon
3. Enter a nickname (e.g. `sales-app`) → click **Register app**
4. You'll see a code block that looks like this:

```js
const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "your-project.firebaseapp.com",
  projectId: "your-project",
  storageBucket: "your-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc..."
};
```

> ⚠️ You also need one extra value: the **Database URL**. Go to **Build → Realtime Database** in the Firebase console — you'll see a URL like `https://your-project-default-rtdb.firebaseio.com`. Copy it.

---

## Step 5 — Paste config into the app

1. Open **`firebase-config.js`** in the `sales record` folder
2. Replace all the placeholder values with your real values from Step 4
3. Also replace `YOUR_PROJECT_ID` in the `databaseURL` line with your real project ID
4. Change line 4 to: `const FIREBASE_ENABLED = true;`
5. Save the file — done! ✅

---

## ✅ You're done!

Open `index.html` on any device. Sign up with your email, and all sales data will sync instantly across all your devices whenever you're connected to the internet.
