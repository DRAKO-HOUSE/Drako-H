// Scripts do Firebase Compat 10.8.0
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Configuração pública do Firebase do projeto Drako House
const firebaseConfig = {
  apiKey: 'AIzaSyA9HTcZnV4w0ucqBEGcNCCdZU9lrCsPrMU',
  authDomain: 'drako-house.firebaseapp.com',
  databaseURL: 'https://drako-house-default-rtdb.firebaseio.com',
  projectId: 'drako-house',
  storageBucket: 'drako-house.firebasestorage.app',
  messagingSenderId: '354312625669',
  appId: '1:354312625669:web:b57956572f44cca754466c'
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// Instalação imediata do Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Ativação e controle imediato de todas as abas
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Trata mensagens push em segundo plano (tela bloqueada ou navegador fechado)
messaging.onBackgroundMessage((payload) => {
  const dados = payload.data || {};
  const titulo = dados.titulo || '🍔 Novo Pedido no Drako House!';
  const corpo = dados.corpo || 'Toque para visualizar os detalhes no painel.';
  const pedidoId = dados.pedidoId || '';

  const opcoes = {
    body: corpo,
    icon: '/assets/logo.jpeg',
    badge: '/assets/logo.jpeg',
    tag: `pedido-${pedidoId || Date.now()}`,
    renotify: true,
    requireInteraction: true,
    vibrate: [300, 100, 300, 100, 400],
    data: {
      url: '/admin.html#pedidos',
      pedidoId: pedidoId
    }
  };

  return self.registration.showNotification(titulo, opcoes);
});

// Ao clicar na notificação: foca na aba do admin ou abre direto em /admin.html#pedidos
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const urlDestino = event.notification.data && event.notification.data.url
    ? event.notification.data.url
    : '/admin.html#pedidos';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClientes) => {
      // Procura se já existe uma aba do admin aberta
      for (const cliente of listaClientes) {
        if (cliente.url.includes('admin.html')) {
          // Navega para #pedidos se necessário e foca a janela
          if (!cliente.url.includes('#pedidos')) {
            cliente.navigate(urlDestino);
          }
          return cliente.focus();
        }
      }
      // Se não houver janela aberta do admin, abre uma nova
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlDestino);
      }
    })
  );
});
