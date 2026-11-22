// Update helper for this extension.
//
// SillyTavern already exposes the git plumbing the extension manager uses, so
// the button only has to compare versions and call it. When the normal update
// fails (usually because the folder has local edits), "clean reinstall" deletes
// the folder and clones it again, which also throws away any accumulated junk.

const OWNER = 'GlacierCifer';
const REPO = 'ST-Model-Display';
const BRANCH = 'main';

const parse = (value) => String(value || '')
    .split('.')
    .map(part => parseInt(part, 10) || 0);

const isNewer = (candidate, current) => {
    const a = parse(candidate);
    const b = parse(current);
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
        const diff = (a[i] || 0) - (b[i] || 0);
        if (diff !== 0) return diff > 0;
    }
    return false;
};

function directoryName() {
    try {
        const parts = new URL(import.meta.url).pathname.split('/').filter(Boolean);
        const index = parts.indexOf('third-party');
        if (index !== -1 && parts[index + 1]) return parts[index + 1];
    } catch { /* fall through */ }
    return REPO;
}

const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

function requestHeaders() {
    try {
        return typeof globalThis.getRequestHeaders === 'function'
            ? globalThis.getRequestHeaders()
            : { 'Content-Type': 'application/json' };
    } catch {
        return { 'Content-Type': 'application/json' };
    }
}

export const UpdaterModule = {
    name: 'stmd_updater',
    owner: OWNER,
    repo: REPO,
    branch: BRANCH,

    get extensionName() {
        return directoryName();
    },

    get localManifestUrl() {
        return new URL('../manifest.json', import.meta.url).href;
    },

    /** Mirrors used for the version check (read-only, no account needed). */
    get manifestSources() {
        const { owner, repo, branch } = this;
        return [
            `https://gcore.jsdelivr.net/gh/${owner}/${repo}@${branch}/manifest.json`,
            `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/manifest.json`,
            `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/manifest.json`,
        ];
    },

    get remoteManifestUrl() {
        return this.manifestSources[this.manifestSources.length - 1];
    },

    get repoUrl() {
        return `https://github.com/${this.owner}/${this.repo}`;
    },

    async localVersion() {
        try {
            const response = await fetch(this.localManifestUrl, { cache: 'no-store' });
            if (!response.ok) return null;
            const manifest = await response.json();
            return manifest.version || null;
        } catch {
            return null;
        }
    },

    async remoteVersion() {
        for (const url of this.manifestSources) {
            try {
                const response = await fetch(url, { cache: 'no-store' });
                if (!response.ok) continue;
                const manifest = await response.json();
                if (manifest.version) return manifest.version;
            } catch {
                // try the next mirror
            }
        }
        return null;
    },

    async check() {
        const [local, remote] = await Promise.all([this.localVersion(), this.remoteVersion()]);
        return {
            local,
            remote,
            hasUpdate: Boolean(local && remote && isNewer(remote, local)),
            unknown: !local || !remote,
        };
    },

    async post(path, body) {
        const response = await fetch(`/api/extensions/${path}`, {
            method: 'POST',
            headers: requestHeaders(),
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            let detail = '';
            try { detail = (await response.text()).slice(0, 200); } catch { /* ignore */ }
            throw new Error(detail || `HTTP ${response.status}`);
        }
        return true;
    },

    /** Normal git pull, the same call the extension manager makes. */
    update() {
        return this.post('update', { extensionName: this.extensionName, global: false });
    },

    /** Delete + clone again: clears local edits and any accumulated leftovers. */
    async reinstall() {
        await this.post('delete', { extensionName: this.extensionName, global: false });
        await this.post('install', { url: this.repoUrl, global: false });
        return true;
    },

    /**
     * After a successful update: optionally ask the user whether to reload now.
     * The manifest decides — releases that need a refresh set `postUpdate`.
     */
    async promptAfterUpdate() {
        let manifest = null;
        try {
            const response = await fetch(this.localManifestUrl, { cache: 'no-store' });
            manifest = await response.json();
        } catch {
            // no manifest: just reload like before
        }
        const version = manifest?.version || '';
        const info = manifest?.postUpdate;

        if (!info || info.notify === false) {
            location.reload();
            return;
        }

        const seenKey = `stmd.updateNotice.${version}`;
        if (version && localStorage.getItem(seenKey) === '1') {
            location.reload();
            return;
        }

        const lines = [
            info.message || '更新已完成。',
            info.reload === false ? '' : '刷新页面后新功能才会生效。',
            '如果刷新后界面仍是旧的，请强制刷新页面，或在 App 里点「清缓存」再试。',
        ].filter(Boolean);
        const html = `<h3>已更新到 v${version}</h3><p>${lines.map(line => escapeHtml(line)).join('<br>')}</p>`;

        let result = null;
        try {
            const popup = await import('../../../../popup.js');
            result = await popup.callGenericPopup(html, popup.POPUP_TYPE.CONFIRM, '', {
                okButton: '立即刷新',
                cancelButton: '稍后',
            });
        } catch {
            result = window.confirm(`已更新到 v${version}\n\n${lines.join('\n')}\n\n现在刷新吗？`) ? 1 : 0;
        }

        if (version) localStorage.setItem(seenKey, '1');
        if (result === 1) location.reload();
    },

    /** Removes small per-session leftovers this extension keeps. */
    cleanupLocalState() {
        try {
            Object.keys(sessionStorage)
                .filter(key => key.startsWith('stmd.'))
                .forEach(key => sessionStorage.removeItem(key));
        } catch { /* ignore */ }
    },
};
