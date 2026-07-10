const firebaseConfig = {
  apiKey: "AIzaSyAlqUrvIQSrZnptFkUX4DX1-vCNm5LDNtc",
  authDomain: "atlas-trading-dbfd7.firebaseapp.com",
  projectId: "atlas-trading-dbfd7",
  storageBucket: "atlas-trading-dbfd7.firebasestorage.app",
  messagingSenderId: "729186830862",
  appId: "1:729186830862:web:afae5f2fdae69d2c9f8a5f"
};

firebase.initializeApp(firebaseConfig);
window.atlasFirebase = {
  auth: firebase.auth(),
  db: firebase.firestore()
};
