const $ = s => document.querySelector(s);
const stage = $('#stage');

const DEVICE_ID_KEY = 'coastloopDeviceId';
const DEVICE_SECRET_KEY = 'coastloopDeviceKey';
const CONFIG_KEY = 'coastloopCachedConfig';

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
    app_version: '0.2.0',
    width: screen.width,
    height: screen.height
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

function showPair(code) {
  stage.innerHTML = `
    <div class="pair">
      <div class="muted">PAIR THIS SCREEN</div>
      <div class="code">${code || '------'}</div>
      <div class="muted">Open the CoastLoop admin dashboard and name this display.</div>
    </div>`;
}

async function playItem(item) {
  const response = await cachedResponse(item.url);
  if (!response) {
    await sleep(1500);
    return;
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const started = Date.now();
  const seconds = Math.max(1, Number(item.duration_seconds || 15));

  try {
    if (item.media_type === 'video') {
      stage.innerHTML = '';
      const video = document.createElement('video');
      video.src = objectUrl;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.style.cssText = 'width:100%;height:100%;object-fit:cover';
      stage.appendChild(video);

      await new Promise(resolve => {
        const timer = setTimeout(resolve, Math.max(seconds * 1000, 30000));
        video.onended = () => { clearTimeout(timer); resolve(); };
        video.onerror = () => { clearTimeout(timer); resolve(); };
        video.play().catch(() => {});
      });
    } else {
      stage.innerHTML = `<img src="${objectUrl}" style="width:100%;height:100%;object-fit:contain">`;
      await sleep(seconds * 1000);
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  post('/api/player/proof', {
    device_id: deviceId,
    device_key: deviceKey,
    media_id: item.media_id,
    campaign_id: item.campaign_id || null,
    seconds: Math.max(1, (Date.now() - started) / 1000)
  });
}

async function loop() {
  while (true) {
    if (!config?.paired) {
      showPair(config?.pair_code);
      await sleep(4000);
      continue;
    }

    if (!config?.items?.length) {
      stage.innerHTML = '<div class="pair"><h1>Ready.</h1><div class="muted">No ads assigned yet.</div></div>';
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
    stage.innerHTML = '<div class="pair"><h1>CoastLoop</h1><div class="muted">Unable to reach control plane.</div></div>';
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
