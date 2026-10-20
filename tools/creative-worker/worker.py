#!/usr/bin/env python3
import html, json, mimetypes, os, subprocess, sys, time, urllib.request, urllib.error, uuid
from pathlib import Path

def load_env_file():
    envfile = Path(__file__).with_name(".env")
    if not envfile.exists():
        return
    for line in envfile.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())

load_env_file()

API = os.environ.get("COASTLOOP_API", "https://coastloop.site").rstrip("/")
TOKEN = os.environ.get("COASTLOOP_WORKER_TOKEN", "")
WORKER_ID = os.environ.get("COASTLOOP_WORKER_ID", "seneca-mac")
LOCALGEN = os.environ.get("LOCALGEN_BIN", str(Path.home()/".local/bin/localgen"))
RENDER_ROOT = str(Path.home()/ "Downloads/local_generator/renders")

def die(msg):
    print(f"creative-worker: {msg}", file=sys.stderr, flush=True)
    raise SystemExit(1)

def run_with_heartbeat(job, cmd):
    err=Path(RENDER_ROOT)/f".ffmpeg-{job['id']}-{uuid.uuid4().hex}.log"
    with err.open("wb") as ef:
        proc=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=ef,stdin=subprocess.DEVNULL)
        next_heartbeat=time.monotonic()+60
        while proc.poll() is None:
            time.sleep(2)
            if time.monotonic()>=next_heartbeat:
                hb=api_json(f"/api/creative-worker/{job['id']}/heartbeat",{
                    "lease_token":job["lease_token"],
                })
                if not hb.get("ok"):
                    proc.terminate()
                    raise RuntimeError("creative lease lost during render")
                next_heartbeat=time.monotonic()+60
    if proc.returncode:
        try:
            tail=err.read_text(errors="replace")[-3000:].strip()
        except Exception:
            tail=""
        err.unlink(missing_ok=True)
        raise RuntimeError(f"render command failed ({proc.returncode}): {tail}")
    err.unlink(missing_ok=True)

def valid_video(path, width=None, height=None):
    path=Path(path)
    if not path.exists() or path.stat().st_size < 1024:
        return False
    try:
        raw=subprocess.check_output([
            "/opt/homebrew/bin/ffprobe","-v","error",
            "-select_streams","v:0",
            "-show_entries","stream=width,height",
            "-show_entries","format=duration",
            "-of","json",str(path)
        ],stderr=subprocess.DEVNULL,timeout=20)
        data=json.loads(raw)
        stream=(data.get("streams") or [{}])[0]
        duration=float((data.get("format") or {}).get("duration") or 0)
        if duration < 14.5:
            return False
        if width and int(stream.get("width") or 0)!=width:
            return False
        if height and int(stream.get("height") or 0)!=height:
            return False
        return True
    except Exception:
        return False

def find_render(name):
    hits=[]
    hits=[x for x in Path(RENDER_ROOT).rglob(name+"*")
          if x.is_file() and x.suffix.lower() in {".png",".jpg",".jpeg",".webp"}]
    if not hits:
        raise RuntimeError("render output not found")
    return max(hits,key=lambda x:x.stat().st_mtime)

def render_still(job, prompt=None, suffix=""):
    meta=job.get("metadata") or {}
    name=f"coastloop-{job['id']}{suffix}"
    cmd=[LOCALGEN,prompt or job["prompt"],"--w","1536","--h","864","--out",name+".png",
         "--render-root",RENDER_ROOT]
    if meta.get("negative_prompt"):
        cmd+=["--negative",str(meta["negative_prompt"])]
    if meta.get("steps") is not None:
        cmd+=["--steps",str(meta["steps"])]
    refs=[p for a,p in job.get("_sources",[]) if a.get("asset_type") in {"photo","reference"} and p.suffix.lower() in {".png",".jpg",".jpeg",".webp"}]
    if refs: cmd+=["--image",str(refs[0]),"--strength","0.35"]
    run_with_heartbeat(job,cmd)
    return find_render(name)

def compose_board(job, background, scene=1):
    meta=job.get("metadata") or {}
    business=html.escape(str(meta.get("business_name") or ""))
    promotion=html.escape(str(meta.get("promotion") or "")[:140])
    cta=html.escape(str(meta.get("cta") or "")[:80])
    website=html.escape(str(meta.get("website_url") or "").replace("https://","").replace("http://","")[:100])

    logos=[p for a,p in job.get("_sources",[]) if a.get("asset_type")=="logo"
           and p.suffix.lower() in {".png",".jpg",".jpeg",".svg",".webp"}]
    logo=(f'<img class="logo" src="{logos[0].resolve().as_uri()}">' if logos
          else f'<div class="brand">{business}</div>')

    if scene==1:
        copy=f'<div class="headline">{promotion or business}</div>'
    elif scene==2:
        copy=f'<div class="brand-only">{business}</div>'
    else:
        copy=f'<div class="headline">{cta or business}</div><div class="url">{website}</div>'

    out=Path(RENDER_ROOT)/f"coastloop-{job['id']}-board-{scene}-4k.png"
    page=Path(RENDER_ROOT)/f"coastloop-{job['id']}-board-{scene}.html"
    bg=background.resolve().as_uri()

    doc=f'''<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box}}html,body{{margin:0;width:3840px;height:2160px;overflow:hidden;background:#111}}
body{{font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;color:#fff}}
.frame{{position:absolute;inset:0;background:url("{bg}") center/cover no-repeat}}
.frame:after{{content:"";position:absolute;inset:0;background:linear-gradient(90deg,rgba(10,8,7,.82),rgba(10,8,7,.35) 48%,rgba(10,8,7,.05) 75%)}}
.content{{position:absolute;z-index:2;left:250px;bottom:230px;width:1750px}}
.logo{{display:block;max-width:720px;max-height:260px;object-fit:contain;object-position:left center;margin-bottom:80px}}
.brand{{font-size:92px;font-weight:750;letter-spacing:.04em;margin-bottom:80px}}
.brand-only{{font-size:118px;font-weight:720;letter-spacing:-.03em;max-width:1700px}}
.headline{{font-size:142px;line-height:1.02;letter-spacing:-.045em;font-weight:650;max-width:1700px}}
.url{{margin-top:55px;font-size:52px;letter-spacing:.02em;color:#e8d8b8}}
.rule{{position:absolute;z-index:2;left:250px;top:190px;width:180px;height:7px;background:#b8924a}}
</style></head><body><div class="frame"></div><div class="rule"></div><div class="content">{logo}{copy}</div></body></html>'''

    page.write_text(doc)
    chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    run_with_heartbeat(job,[chrome,"--headless=new","--disable-gpu","--hide-scrollbars",
        "--allow-file-access-from-files","--window-size=3840,2160",
        f"--screenshot={out}",page.resolve().as_uri()])
    return out

def render_video(job):
    scenes=[
        " Establishing hero scene. Premium wide commercial composition.",
        " Second distinct editorial scene. New angle and visual story.",
        " Final aspirational hero scene with strong negative space for branding."
    ]
    cached=[Path(RENDER_ROOT)/f"coastloop-{job['id']}-board-{i}-4k.png" for i in (1,2,3)]
    if all(x.exists() for x in cached):
        frames=cached
    else:
        raw=[render_still(job,job["prompt"]+scene,f"-scene-{i+1}")
             for i,scene in enumerate(scenes)]
        frames=[compose_board(job,img,i+1) for i,img in enumerate(raw)]
    out=Path(RENDER_ROOT)/f"coastloop-{job['id']}-master-4k.mp4"
    filt=(
      "[0:v]scale=3840:2160:force_original_aspect_ratio=increase,"
      "crop=3840:2160,setsar=1[v0];"
      "[1:v]scale=3840:2160:force_original_aspect_ratio=increase,"
      "crop=3840:2160,setsar=1[v1];"
      "[2:v]scale=3840:2160:force_original_aspect_ratio=increase,"
      "crop=3840:2160,setsar=1[v2];"
      "[v0][v1]xfade=transition=fade:duration=0.6:offset=4.8[x1];"
      "[x1][v2]xfade=transition=fade:duration=0.6:offset=9.6[v]"
    )
    cmd=["/opt/homebrew/bin/ffmpeg","-y",
         "-loop","1","-t","5.4","-i",str(frames[0]),
         "-loop","1","-t","5.4","-i",str(frames[1]),
         "-loop","1","-t","5.4","-i",str(frames[2]),
         "-filter_complex",filt,"-map","[v]","-t","15","-r","30",
         "-c:v","libx264","-preset","slow","-crf","16",
         "-pix_fmt","yuv420p","-movflags","+faststart",str(out)]
    if not valid_video(out,3840,2160):
        out.unlink(missing_ok=True)
        tmp=out.with_name(out.stem+".partial.mp4")
        tmp.unlink(missing_ok=True)
        cmd[-1]=str(tmp)
        run_with_heartbeat(job,cmd)
        if not valid_video(tmp,3840,2160):
            tmp.unlink(missing_ok=True)
            raise RuntimeError("invalid 4K master after render")
        tmp.replace(out)
    delivery=Path(RENDER_ROOT)/f"coastloop-{job['id']}-delivery-1080p.mp4"
    if not valid_video(delivery,1920,1080):
        delivery.unlink(missing_ok=True)
        tmp=delivery.with_name(delivery.stem+".partial.mp4")
        tmp.unlink(missing_ok=True)
        run_with_heartbeat(job,["/opt/homebrew/bin/ffmpeg","-y","-hide_banner","-loglevel","error",
            "-i",str(out),"-vf","scale=1920:1080","-c:v","libx264","-preset","medium","-crf","20",
            "-pix_fmt","yuv420p","-movflags","+faststart",str(tmp)])
        if not valid_video(tmp,1920,1080):
            tmp.unlink(missing_ok=True)
            raise RuntimeError("invalid 1080p delivery after render")
        tmp.replace(delivery)
    return out

def render(job):
    job["_sources"]=download_sources(job)
    if job.get("job_type")=="video":
        return render_video(job)
    return compose_board(job,render_still(job),1)


def api_get(path, lease=None):
    headers={"Authorization":f"Bearer {TOKEN}","User-Agent":"CoastLoop-Creative-Worker/1.0"}
    if lease: headers["X-Creative-Lease"]=lease
    req=urllib.request.Request(API+path,headers=headers)
    with urllib.request.urlopen(req,timeout=30) as res:
        return json.loads(res.read() or b"{}")

def download_sources(job):
    data=api_get(f"/api/creative-worker/{job['id']}/sources",job["lease_token"])
    root=Path(RENDER_ROOT)/"sources"/job["id"]; root.mkdir(parents=True,exist_ok=True)
    out=[]
    for a in data.get("sources",[]):
        name=Path(a.get("original_filename") or a["id"]).name
        dest=root/f"{a['id']}-{name}"
        req=urllib.request.Request(
            API+f"/api/creative-worker/{job['id']}/source/{a['id']}",
            headers={"Authorization":f"Bearer {TOKEN}","X-Creative-Lease":job["lease_token"],
                     "User-Agent":"CoastLoop-Creative-Worker/1.0"})
        with urllib.request.urlopen(req,timeout=60) as r: dest.write_bytes(r.read())
        out.append((a,dest))
    return out

def api_json(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        API + path, data=data, method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": "application/json",
            "User-Agent": "CoastLoop-Creative-Worker/1.0",
        })
    with urllib.request.urlopen(req, timeout=30) as res:
        return json.loads(res.read() or b"{}")

def upload_result(job, image):
    boundary = "----coastloop" + uuid.uuid4().hex
    mime = mimetypes.guess_type(image.name)[0] or "image/png"
    fields = {
        "lease_token": job["lease_token"],
        "title": f"CoastLoop creative {job['id']}",
        "duration_seconds": "15",
        "width": "3840",
        "height": "2160",
    }

    body = bytearray()
    for k, v in fields.items():
        body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
    body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{image.name}\"\r\nContent-Type: {mime}\r\n\r\n".encode()
    body += image.read_bytes()
    delivery=Path(RENDER_ROOT)/f"coastloop-{job['id']}-delivery-1080p.mp4"
    if job.get("job_type")=="video" and delivery.exists():
        body += f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"delivery_file\"; filename=\"{delivery.name}\"\r\nContent-Type: video/mp4\r\n\r\n".encode()
        body += delivery.read_bytes()
    body += f"\r\n--{boundary}--\r\n".encode()

    req = urllib.request.Request(
        API + f"/api/creative-worker/{job['id']}/result",
        data=bytes(body), method="POST",
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "User-Agent": "CoastLoop-Creative-Worker/1.0",
        })
    with urllib.request.urlopen(req, timeout=120) as res:
        return json.loads(res.read() or b"{}")

def run_once():
    claimed = api_json("/api/creative-worker/claim", {"worker_id": WORKER_ID})
    job = claimed.get("job")
    if not job:
        return False

    print(f"creative-worker: claimed {job['id']}", flush=True)
    try:
        image = render(job)
        print(f"creative-worker: rendered {job['id']} file={image.name}", flush=True)
        result = upload_result(job, image)
        print(f"creative-worker: uploaded {job['id']}", flush=True)
        print(f"creative-worker: completed {job['id']} asset={result.get('asset_id')}", flush=True)
        return True
    except Exception as exc:
        try:
            api_json(f"/api/creative-worker/{job['id']}/fail", {
                "lease_token": job["lease_token"],
                "error": str(exc)[:2000],
            })
        except Exception:
            pass
        print(f"creative-worker: failed {job['id']} err={str(exc)[:160]}", flush=True)
        return True

def main():
    if not TOKEN:
        die("COASTLOOP_WORKER_TOKEN is not configured")

    once = "--once" in sys.argv
    if once:
        run_once()
        return

    print(f"creative-worker: online as {WORKER_ID}", flush=True)
    while True:
        try:
            worked = run_once()
            time.sleep(2 if worked else 30)
        except (urllib.error.URLError, TimeoutError) as exc:
            print(f"creative-worker: offline ({exc}); retrying", file=sys.stderr, flush=True)
            time.sleep(30)
        except Exception as exc:
            print(f"creative-worker: job error ({str(exc)[:240]}); continuing", file=sys.stderr, flush=True)
            time.sleep(5)
        except KeyboardInterrupt:
            return

if __name__ == "__main__":
    main()
