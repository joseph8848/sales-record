// ============================================================
//  FIREBASE CONFIGURATION — Sales Record App
// ============================================================

const FIREBASE_ENABLED = true; // ✅ Cloud sync is ON

const firebaseConfig = {
  apiKey:            "AIzaSyDQbR5iYk1hVdE-cnCFBE4zQ8L0bho-8Dg",
  authDomain:        "sales-record-223f8.firebaseapp.com",
  databaseURL:       "https://sales-record-223f8-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "sales-record-223f8",
  storageBucket:     "sales-record-223f8.firebasestorage.app",
  messagingSenderId: "169857825370",
  appId:             "1:169857825370:web:01e5ebf04cac32b40fb663"
};

// Do NOT edit below this line
window.FIREBASE_ENABLED = FIREBASE_ENABLED;
window.firebaseConfig   = firebaseConfig;
