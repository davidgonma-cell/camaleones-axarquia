// ============================================================
// Service Worker — Camaleones Axarquía
// Estrategia: Network-First
// - Siempre intenta descargar la versión nueva del servidor
// - Solo usa la caché como respaldo si NO hay internet
// - Se auto-actualiza al detectar cambios
// ============================================================

// Cambia este número cada vez que subas una versión grande
// para forzar a los móviles a limpiar caché vieja
const CACHE_VERSION = 'camaleones-v' + new Date().toISOString().slice(0, 10);
const CACHE_NAME = CACHE_VERSION;

// Recursos que queremos disponibles sin conexión
const OFFLINE_URLS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// ===== INSTALACIÓN =====
// Precacheamos los archivos básicos y activamos la nueva versión de inmediato
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(OFFLINE_URLS).catch(function(){ /* ignora errores */ });
      })
      .then(function() {
        // No esperar a que se cierren las pestañas abiertas — activar ya
        return self.skipWaiting();
      })
  );
});

// ===== ACTIVACIÓN =====
// Borra cachés viejas y toma control de las pestañas abiertas inmediatamente
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(key) { return key !== CACHE_NAME; })
            .map(function(key) { return caches.delete(key); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

// ===== FETCH — ESTRATEGIA NETWORK-FIRST =====
self.addEventListener('fetch', function(event) {
  const req = event.request;

  // Solo manejamos peticiones GET y del mismo origen
  if (req.method !== 'GET') return;
  if (!req.url.startsWith(self.location.origin)) return;

  // No cacheamos llamadas a Firebase, EmailJS ni otras APIs externas
  if (req.url.indexOf('firebaseio.com') !== -1 ||
      req.url.indexOf('firebaseapp.com') !== -1 ||
      req.url.indexOf('emailjs.com') !== -1 ||
      req.url.indexOf('googleapis.com') !== -1) {
    return; // dejar que el navegador lo maneje normalmente
  }

  event.respondWith(
    // 1) INTENTA RED PRIMERO
    fetch(req)
      .then(function(response) {
        // Si llegó bien → guardar copia en caché y devolver
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(req, copy);
          });
        }
        return response;
      })
      // 2) SI LA RED FALLA → usar caché como respaldo (modo offline)
      .catch(function() {
        return caches.match(req).then(function(cached) {
          if (cached) return cached;
          // Si pide una página HTML y no hay nada, servir el index.html cacheado
          if (req.mode === 'navigate') {
            return caches.match('/index.html');
          }
          // No hay nada que devolver
          return new Response('Sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
  );
});

// ===== MENSAJE DESDE LA APP =====
// Permite a index.html pedir al SW que se actualice manualmente
self.addEventListener('message', function(event) {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
