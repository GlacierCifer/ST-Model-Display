import {
    characters,
    selectCharacterById,
    setActiveCharacter,
    getCurrentChatId,
    openCharacterChat,
    saveSettingsDebounced,
    getRequestHeaders,
} from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

// Turns the home screen's "recent chats" list into character folders:
// one row per character (newest activity first), expanding into every chat of
// that character. The default list spends its three slots on three chats, even
// when they all belong to the same character.
const NAME = 'recent_folders';
const OPEN_KEY = 'stmd.folders.open';

const escape = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** Same source SillyTavern uses for character thumbnails. */
const thumbnailUrl = (avatar) => `/thumbnail?type=avatar&file=${encodeURIComponent(avatar || '')}`;

const formatDate = (value, long = false) => {
    const stamp = typeof value === 'number' ? value : Date.parse(String(value));
    if (!Number.isFinite(stamp)) return '';
    const date = new Date(stamp);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    if (long) {
        return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    }
    return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
};

export const RecentFoldersModule = {
    name: NAME,

    defaultSettings: Object.freeze({
        enabled: false,
        maxFolders: 3,
        maxChats: 200,
    }),

    _observer: null,
    _timer: null,
    _applying: false,

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];
        for (const key of Object.keys(this.defaultSettings)) {
            if (settings[key] === undefined) settings[key] = this.defaultSettings[key];
        }
        return settings;
    },

    save() {
        saveSettingsDebounced();
    },

    init() {
        this.watch();
        this.run();
    },

    /** Re-runs whenever the home screen is rebuilt by SillyTavern. */
    watch() {
        if (this._observer) return;
        const chat = document.getElementById('chat');
        if (!chat) {
            setTimeout(() => this.watch(), 1500);
            return;
        }
        this._observer = new MutationObserver(() => {
            if (this._applying) return;
            this.schedule();
        });
        this._observer.observe(chat, { childList: true, subtree: true });
    },

    schedule() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.run(), 150);
    },

    async run() {
        if (!this.getSettings().enabled) return;
        const list = document.querySelector('.welcomePanel .recentChatList');
        if (!list || list.dataset.stmdBuilt === '1') return;
        if (list.querySelector('.stmd-folder')) return;

        let chats;
        try {
            chats = await this.fetchRecent();
        } catch (e) {
            console.warn('[模块-主页文件夹] 拉取最近聊天失败:', e);
            return;
        }
        if (!Array.isArray(chats) || chats.length === 0) return;

        const folders = this.buildFolders(chats);
        if (folders.length === 0) return;

        this._applying = true;
        try {
            const fragment = document.createDocumentFragment();
            for (const folder of folders) {
                fragment.appendChild(this.renderFolder(folder));
            }
            list.replaceChildren(fragment);
            list.dataset.stmdBuilt = '1';
        } finally {
            setTimeout(() => { this._applying = false; }, 0);
        }
    },

    async fetchRecent() {
        const settings = this.getSettings();
        const response = await fetch('/api/chats/recent', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ max: Math.max(20, Number(settings.maxChats) || 200), pinned: [] }),
            cache: 'no-cache',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    },

    /** Groups chats by character, newest activity first. */
    buildFolders(chats) {
        const settings = this.getSettings();
        const byAvatar = new Map();
        for (const chat of chats) {
            if (!chat || !chat.avatar) continue; // group chats keep their own row
            if (!byAvatar.has(chat.avatar)) byAvatar.set(chat.avatar, []);
            byAvatar.get(chat.avatar).push(chat);
        }

        const folders = [...byAvatar.entries()]
            .map(([avatar, items]) => {
                const info = characters?.find(c => c.avatar === avatar);
                return {
                    avatar,
                    name: info?.name || items[0].char_name || avatar.replace(/\.png$/i, ''),
                    thumbnail: thumbnailUrl(avatar),
                    chats: items,
                };
            })
            // The API already returns chats newest first, so the first chat of a
            // character carries that character's most recent activity.
            .sort((a, b) => this.indexOfChat(chats, a.chats[0]) - this.indexOfChat(chats, b.chats[0]));

        const limit = Math.max(1, Number(settings.maxFolders) || 3);
        return folders.slice(0, limit);
    },

    indexOfChat(chats, target) {
        return chats.indexOf(target);
    },

    renderFolder(folder) {
        const open = this.isOpen(folder.avatar);
        const wrapper = document.createElement('div');
        wrapper.className = `stmd-folder${open ? ' stmd-open' : ''}`;
        wrapper.dataset.avatar = folder.avatar;

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'stmd-folder-head';
        head.title = `${folder.name} · ${folder.chats.length}`;
        head.innerHTML = `
            <img class="stmd-folder-avatar" src="${escape(folder.thumbnail)}" alt="" loading="lazy" decoding="async">
            <span class="stmd-folder-name">${escape(folder.name)}</span>
            <span class="stmd-folder-count">${folder.chats.length}</span>
            <i class="fa-solid fa-chevron-down stmd-folder-chevron"></i>`;
        head.addEventListener('click', (event) => {
            event.stopPropagation();
            const next = !wrapper.classList.contains('stmd-open');
            wrapper.classList.toggle('stmd-open', next);
            this.setOpen(folder.avatar, next);
        });

        const body = document.createElement('div');
        body.className = 'stmd-folder-body';
        for (const chat of folder.chats) {
            body.appendChild(this.renderChatRow(chat));
        }

        wrapper.append(head, body);
        return wrapper;
    },

    renderChatRow(chat) {
        const fileName = String(chat.file_name || chat.chat_name || '');
        const chatName = String(chat.chat_name || fileName.replace(/\.jsonl$/i, ''));
        const row = document.createElement('div');
        row.className = 'recentChat stmd-folder-row';
        row.dataset.avatar = chat.avatar || '';
        row.dataset.file = chatName;
        row.title = fileName;
        const thumb = thumbnailUrl(chat.avatar);
        const message = String(chat.mes || '').slice(0, 300);
        const dateLong = formatDate(chat.last_mes, true);
        const dateShort = formatDate(chat.last_mes);
        const info = characters?.find(c => c.avatar === chat.avatar);
        const charName = info?.name || chat.char_name || '';
        const count = Number(chat.chat_items) || 0;
        row.innerHTML = `
            <div class="avatar"><img src="${escape(thumb)}" alt="" loading="lazy" decoding="async"></div>
            <div class="recentChatInfo">
                <div class="chatNameContainer">
                    <div class="chatName" title="${escape(fileName)}">
                        <strong class="characterName">${escape(charName)}</strong>
                        <span>–</span>
                        <span>${escape(chatName)}</span>
                    </div>
                    <small class="chatDate" title="${escape(dateLong)}">${escape(dateShort)}</small>
                </div>
                <div class="chatMessageContainer">
                    <div class="chatMessage" title="${escape(message)}">${escape(message)}</div>
                    <div class="chatStats">
                        <div class="counterBlock">
                            <i class="fa-solid fa-comment fa-xs"></i>
                            <small>${count}</small>
                        </div>
                        <small class="fileSize">${escape(chat.file_size || '')}</small>
                    </div>
                </div>
            </div>`;
        row.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.openChat(chat.avatar, fileName);
        });
        return row;
    },

    async openChat(avatar, fileName) {
        const id = characters?.findIndex(c => c.avatar === avatar) ?? -1;
        if (id === -1) return;
        try {
            await selectCharacterById(id);
            setActiveCharacter(avatar);
            saveSettingsDebounced();
            const bare = String(fileName).replace(/\.jsonl$/i, '');
            if (getCurrentChatId() !== bare) {
                await openCharacterChat(bare);
            }
        } catch (e) {
            console.error('[模块-主页文件夹] 打开聊天失败:', e);
        }
    },

    isOpen(avatar) {
        try {
            const map = JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}');
            return !!map[avatar];
        } catch {
            return false;
        }
    },

    setOpen(avatar, open) {
        try {
            const map = JSON.parse(sessionStorage.getItem(OPEN_KEY) || '{}');
            map[avatar] = open;
            sessionStorage.setItem(OPEN_KEY, JSON.stringify(map));
        } catch { /* sessionStorage unavailable */ }
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div class="stmd-folders-settings">
                <div class="sub-setting-description">
                    把主页的「最近聊天」改成按角色分组：每个角色一个文件夹，展开后可以看到该角色的全部聊天。
                </div>
                <label class="checkbox_label" for="stmd_folders_max">
                    <span>显示的角色数量</span>
                </label>
                <input id="stmd_folders_max" class="text_pole" type="number" min="1" max="20" step="1" value="${Number(settings.maxFolders) || 3}">
                <div class="sub-setting-description">
                    每个文件夹里最多能看到的聊天数量：
                </div>
                <input id="stmd_folders_chats" class="text_pole" type="number" min="20" max="1000" step="10" value="${Number(settings.maxChats) || 200}">
            </div>`;
    },

    bindSettingsEvents() {
        $('#stmd_folders_max').off('input.stmdFolders').on('input.stmdFolders', (e) => {
            const value = parseInt(String($(e.currentTarget).val()), 10);
            this.getSettings().maxFolders = Number.isFinite(value) && value > 0 ? value : 3;
            this.save();
            this.refresh();
        });
        $('#stmd_folders_chats').off('input.stmdFolders').on('input.stmdFolders', (e) => {
            const value = parseInt(String($(e.currentTarget).val()), 10);
            this.getSettings().maxChats = Number.isFinite(value) && value >= 20 ? value : 200;
            this.save();
            this.refresh();
        });
    },

    /** Forces a rebuild on the next tick (settings changed or re-enabled). */
    refresh() {
        document.querySelectorAll('.recentChatList').forEach(list => { delete list.dataset.stmdBuilt; });
        this.schedule();
    },
};
