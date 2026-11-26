// Configuração única do Firebase para o painel (SDK modular 10.8.0, mesma versão do cardápio).
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';

// A apiKey do Firebase é pública por natureza: quem protege os dados são as regras do banco.
const configuracao = {
  apiKey: 'AIzaSyA9HTcZnV4w0ucqBEGcNCCdZU9lrCsPrMU',
  authDomain: 'drako-house.firebaseapp.com',
  databaseURL: 'https://drako-house-default-rtdb.firebaseio.com',
  projectId: 'drako-house',
  storageBucket: 'drako-house.firebasestorage.app',
  messagingSenderId: '354312625669',
  appId: '1:354312625669:web:b57956572f44cca754466c'
};

export const app = initializeApp(configuracao);
export const auth = getAuth(app);
export const db = getDatabase(app);
