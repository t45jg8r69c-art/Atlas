import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import { getFirestore, doc, setDoc, onSnapshot, serverTimestamp, enableIndexedDbPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js';

const firebaseConfig = {
  apiKey: "AIzaSyAlqUrvIQSrZnptFkUX4DX1-vCNm5LDNtc",
  authDomain: "atlas-trading-dbfd7.firebaseapp.com",
  projectId: "atlas-trading-dbfd7",
  storageBucket: "atlas-trading-dbfd7.firebasestorage.app",
  messagingSenderId: "729186830862",
  appId: "1:729186830862:web:afae5f2fdae69d2c9f8a5f"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

enableIndexedDbPersistence(db).catch(() => {});

window.AtlasCloud = {
  auth,
  db,
  register(email, password){ return createUserWithEmailAndPassword(auth, email, password); },
  login(email, password){ return signInWithEmailAndPassword(auth, email, password); },
  logout(){ return signOut(auth); },
  onAuth(cb){ return onAuthStateChanged(auth, cb); },
  stateRef(uid){ return doc(db, 'users', uid, 'atlas', 'state'); },
  saveState(uid, state){ return setDoc(doc(db, 'users', uid, 'atlas', 'state'), {...state, updatedAt: serverTimestamp()}, {merge:true}); },
  watchState(uid, cb){ return onSnapshot(doc(db, 'users', uid, 'atlas', 'state'), snap => cb(snap.exists() ? snap.data() : null)); }
};

window.dispatchEvent(new Event('atlas-cloud-ready'));
