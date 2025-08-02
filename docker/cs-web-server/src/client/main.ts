import {loadAsync} from 'jszip'
import filesystemURL from 'xash3d-fwgs/filesystem_stdio.wasm?url'
import xashURL from 'xash3d-fwgs/xash.wasm?url'
import menuURL from 'cs16-client/cl_dll/menu_emscripten_wasm32.wasm?url'
import clientURL from 'cs16-client/cl_dll/client_emscripten_wasm32.wasm?url'
import serverURL from 'cs16-client/dlls/cs_emscripten_wasm32.so?url'
import gles3URL from 'xash3d-fwgs/libref_gles3compat.wasm?url'
import {Xash3DWebRTC} from "./webrtc";

let usernamePromiseResolve: (name: string) => void
const usernamePromise = new Promise<string>(resolve => {
    usernamePromiseResolve = resolve
})

async function main() {
    const x = new Xash3DWebRTC({
        canvas: document.getElementById('canvas') as HTMLCanvasElement,
        module: {
            arguments: ['-windowed', '-game', 'cstrike'],
        },
        libraries: {
            filesystem: filesystemURL,
            xash: xashURL,
            menu: menuURL,
            server: serverURL,
            client: clientURL,
            render: {
                gles3compat: gles3URL,
            }
        },
        filesMap: {
            'dlls/cs_emscripten_wasm32.so': serverURL,
            '/rwdir/filesystem_stdio.so': filesystemURL,
        },
    });

    const [zip] = await Promise.all([
    (async () => {
        const cache = await caches.open('cs16-cache');
        let response = await cache.match('valve.zip');
        let buffer: ArrayBuffer;

        if (!response) {
            response = await fetch('valve.zip');
            const clone = response.clone();

            const reader = response.body!.getReader();
            const total = parseInt(response.headers.get('Content-Length') || '0', 10);
            let loaded = 0;
            const chunks = [];

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks.push(value);
                loaded += value.length;
                const percent = total ? Math.floor((loaded / total) * 100) : 0;
                const el = document.getElementById('progress');
                if (el) el.textContent = `Downloading ${percent}%`;
            }

            const all = new Uint8Array(loaded);
            let offset = 0;
            for (const chunk of chunks) {
                all.set(chunk, offset);
                offset += chunk.length;
            }

            buffer = all.buffer;
            await cache.put('valve.zip', clone);
        } else {
            buffer = await response.arrayBuffer();
            const el = document.getElementById('progress');
            if (el) el.textContent = `Downloading 100%`;
        }

        return await loadAsync(buffer);
    })(),
        x.init(),
    ]);

    const files = Object.entries(zip.files).filter(([, file]) => !file.dir);
    const totalFiles = files.length;
    let loadedFiles = 0;

    await Promise.all(files.map(async ([filename, file]) => {
        const path = '/rodir/' + filename;
        const dir = path.split('/').slice(0, -1).join('/');

        x.em.FS.mkdirTree(dir);
        x.em.FS.writeFile(path, await file.async("uint8array"));

        loadedFiles++;
        const progressEl = document.getElementById('progress');
        if (progressEl) {
            progressEl.textContent = `Loading: ${Math.floor((loadedFiles / totalFiles) * 100)}%`;
        }
    }));


    x.em.FS.chdir('/rodir')
    // Enable the start button after loading all files
    document.getElementById('start-button')!.removeAttribute('disabled');

    document.getElementById('logo')!.style.animationName = 'pulsate-end'
    document.getElementById('logo')!.style.animationFillMode = 'forwards'
    document.getElementById('logo')!.style.animationIterationCount = '1'
    document.getElementById('logo')!.style.animationDirection = 'normal'

    const username = await usernamePromise
    x.main()
    x.Cmd_ExecuteString('_vgui_menus 0')
    if (!window.matchMedia('(hover: hover)').matches) {
        x.Cmd_ExecuteString('touch_enable 1')
    }
    x.Cmd_ExecuteString(`name "${username}"`)
    x.Cmd_ExecuteString('connect 127.0.0.1:8080')

    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = '';
        return '';
    });
}

const username = localStorage.getItem('username')
if (username) {
    (document.getElementById('username') as HTMLInputElement).value = username
}

(document.getElementById('form') as HTMLFormElement).addEventListener('submit', (e) => {
    e.preventDefault()
    const username = (document.getElementById('username') as HTMLInputElement).value
    localStorage.setItem('username', username);
    (document.getElementById('form') as HTMLFormElement).style.display = 'none'
    const progressEl = document.getElementById('progress');
    if (progressEl) {
        progressEl.style.transition = 'opacity 0.5s ease';
        progressEl.style.opacity = '0';
        setTimeout(() => progressEl.remove(), 500);
    }
    usernamePromiseResolve(username)
})

main()