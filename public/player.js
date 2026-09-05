const $ = s => document.querySelector(s);
const stage = $('#stage');

const DEVICE_ID_KEY = 'coastloopDeviceId';
const DEVICE_SECRET_KEY = 'coastloopDeviceKey';
const CONFIG_KEY = 'coastloopCachedConfig';
const PLAYER_VERSION = '0.15.1';

const deviceId = localStorage.getItem(DEVICE_ID_KEY) || crypto.randomUUID();
localStorage.setItem(DEVICE_ID_KEY, deviceId);

let deviceKey = localStorage.getItem(DEVICE_SECRET_KEY) || '';
let config = null;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function post(path, data) {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(data)
    });
  } catch {
    return null;
  }
}

async function boot() {
  const res = await post('/api/player/boot', {
    device_id: deviceId,
    device_key: deviceKey || null,
    app_version: PLAYER_VERSION,
    width: Math.round(screen.width * (window.devicePixelRatio || 1)),
    height: Math.round(screen.height * (window.devicePixelRatio || 1))
  });

  if (!res?.ok) return null;
  const data = await res.json();

  if (data.device_key) {
    deviceKey = data.device_key;
    localStorage.setItem(DEVICE_SECRET_KEY, deviceKey);
  }
  return data;
}

async function fetchConfig() {
  if (!deviceKey) return null;
  try {
    const res = await fetch('/api/player/config', {
      method: 'POST',
      cache: 'no-store',
      headers: {'content-type':'application/json'},
      body: JSON.stringify({
        device_id: deviceId,
        device_key: deviceKey
      })
    });
    if (!res.ok) throw new Error('config');
    const next = await res.json();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  } catch {
    try { return JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null'); }
    catch { return null; }
  }
}

async function cachedResponse(url) {
  const cache = await caches.open('coastloop-media-v1');
  const hit = await cache.match(url);
  if (hit) return hit;
  try {
    const net = await fetch(url);
    if (net.ok) await cache.put(url, net.clone());
    return net;
  } catch {
    return null;
  }
}

async function warm(items = []) {
  for (const item of items) {
    if (item.url) await cachedResponse(item.url);
  }
}

function brandedState(label, detail='') {
  stage.innerHTML = `
    <div class="pair">
      <img class="player-mark" src="/brand/coastloop-mark.svg" alt="">
      <div class="player-wordmark">COASTLOOP</div>
      <div class="pair-rule"></div>
      <div class="pair-label">${label}</div>
      ${detail ? `<div class="muted" style="margin-top:2.5vh">${detail}</div>` : ''}
      <div class="pair-foot">LOCAL MEDIA · VERIFIED DELIVERY</div>
    </div>`;
}

function showPair(code) {
  stage.innerHTML = `
    <div class="pair">
      <img class="player-mark" src="/brand/coastloop-mark.svg" alt="">
      <div class="player-wordmark">COASTLOOP</div>
      <div class="pair-rule"></div>
      <div class="pair-label">PAIR THIS SCREEN</div>
      <div class="code">${code || '------'}</div>
      <div class="muted">Enter this code in CoastLoop Admin to activate this display.</div>
      <div class="pair-foot">LOCAL MEDIA · VERIFIED DELIVERY</div>
    </div>`;
}

async function playItem(item) {
  let mediaId = item.media_id;
  let mediaUrl = item.url;
  let response = await cachedResponse(mediaUrl);

  if (!response && item.fallback_url) {
    mediaId = item.fallback_media_id || mediaId;
    mediaUrl = item.fallback_url;
    response = await cachedResponse(mediaUrl);
  }

  if (!response) {
    await sleep(1500);
    return;
  }

  let blob = await response.blob();
  let objectUrl = URL.createObjectURL(blob);
  const started = Date.now();
  const seconds = Math.max(1, Number(item.duration_seconds || 15));
  let delivered = false;

  try {
    if (item.media_type === 'video') {
      async function runVideo(url) {
        stage.innerHTML = '';
        const video = document.createElement('video');
        video.src = url;
        video.autoplay = true;
        video.muted = true;
        video.playsInline = true;
        video.style.cssText = 'width:100%;height:100%;object-fit:cover';
        stage.appendChild(video);

        return await new Promise(resolve => {
          let startedPlayback = false;
          const timer = setTimeout(() => resolve(startedPlayback), Math.max(seconds * 1000, 30000));

          video.onplaying = () => { startedPlayback = true; };
          video.onended = () => { clearTimeout(timer); resolve(startedPlayback); };
          video.onerror = () => { clearTimeout(timer); resolve(false); };

          video.play().catch(() => {
            clearTimeout(timer);
            resolve(false);
          });
        });
      }

      delivered = await runVideo(objectUrl);

      if (!delivered && item.fallback_url && mediaUrl !== item.fallback_url) {
        URL.revokeObjectURL(objectUrl);

        const fallback = await cachedResponse(item.fallback_url);
        if (fallback) {
          blob = await fallback.blob();
          objectUrl = URL.createObjectURL(blob);
          mediaId = item.fallback_media_id || mediaId;
          mediaUrl = item.fallback_url;
          delivered = await runVideo(objectUrl);
        }
      }
    } else {
      stage.innerHTML = `<img src="${objectUrl}" style="width:100%;height:100%;object-fit:contain">`;
      await sleep(seconds * 1000);
      delivered = true;
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  if (delivered) {
    post('/api/player/proof', {
      device_id: deviceId,
      device_key: deviceKey,
      media_id: mediaId,
      campaign_id: item.campaign_id || null,
      seconds: Math.max(1, (Date.now() - started) / 1000)
    });
  }
}

async function loop() {
  while (true) {
    if (!config?.paired) {
      showPair(config?.pair_code);
      await sleep(4000);
      continue;
    }

    if (!config?.items?.length) {
      brandedState('READY', 'Preparing this screen’s CoastLoop media.');
      await sleep(4000);
      continue;
    }

    for (const item of config.items) await playItem(item);
  }
}

async function refresh() {
  const next = await fetchConfig();
  if (next) {
    const changed = JSON.stringify(next) !== JSON.stringify(config);
    config = next;
    if (changed) warm(config.items);
  }
}

(async () => {
  const b = await boot();

  if (!b) {
    brandedState('OFFLINE', 'Continuing locally when cached media is available.');
    return;
  }

  if (!b.paired) showPair(b.pair_code);

  await refresh();
  loop();

  setInterval(refresh, 30000);
  setInterval(() => {
    if (deviceKey) post('/api/player/heartbeat', {
      device_id: deviceId,
      device_key: deviceKey
    });
  }, 30000);
})();
