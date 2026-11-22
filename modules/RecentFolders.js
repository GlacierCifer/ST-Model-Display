import {
    characters,
    selectCharacterById,
    setActiveCharacter,
    getCurrentChatId,
    openCharacterChat,
    saveSettingsDebounced,
    getRequestHeaders,
    renameGroupOrCharacterChat,
    deleteCharacterChatByName,
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

/** Direct avatar file, used when the thumbnail endpoint cannot serve one. */
const characterImage = (avatar) => /characters/;

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
        pinnedFolders: [],
        pinnedChats: {},
    }),

    _observer: null,
    _timer: null,
    _applying: false,
    _force: false,
    _totals: new Map(),
    _allChats: new Map(),
    _loading: new Set(),
    _pageSize: 20,

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
            // Chat streaming mutates #chat constantly; only the home screen matters.
            if (!document.querySelector('.welcomePanel')) return;
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
        if (!list) return;
        if (list.dataset.stmdBuilt === '1' && !this._force) return;
        if (!this._force && list.querySelector('.stmd-folder-head')) return;
        this._force = false;

        let chats;
        try {
            chats = await this.fetchRecent();
        } catch (e) {
            console.warn('[模块-主页文件夹] 拉取最近聊天失败:', e);
            return;
        }
        if (!Array.isArray(chats) || chats.length === 0) return;

        const { folders, initial } = this.buildFolders(chats);
        if (folders.length === 0) return;

        // Group chats keep SillyTavern's own rows (their click handlers stay
        // attached), so we only rebuild the character portion.
        const groupRows = [...list.querySelectorAll(':scope > .recentChat')]
            .filter(row => row.dataset.group);

        this._applying = true;
        try {
            const fragment = document.createDocumentFragment();
            folders.forEach((folder, index) => {
                const entry = this.renderFolder(folder);
                if (index >= initial) entry.head.classList.add('stmd-hidden');
                fragment.appendChild(entry.node);
            });
            if (folders.length > initial) {
                fragment.appendChild(this.renderShowMore(folders.length - initial));
            }
            for (const row of groupRows) {
                fragment.appendChild(row);
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

    /** Groups character chats by character; group chats stay as plain rows. */
    buildFolders(chats) {
        const settings = this.getSettings();
        const byAvatar = new Map();
        const others = [];
        for (const chat of chats) {
            const isGroup = Boolean(chat && (chat.is_group || chat.group));
            if (!chat || isGroup || !chat.avatar) {
                if (chat) others.push(chat);
                continue;
            }
            if (!byAvatar.has(chat.avatar)) byAvatar.set(chat.avatar, []);
            byAvatar.get(chat.avatar).push(chat);
        }

        const folders = [...byAvatar.entries()]
            .map(([avatar, items]) => {
                const info = characters?.find(c => c.avatar === avatar);
                const pinned = this.isFolderPinned(avatar);
                return {
                    avatar,
                    name: info?.name || items[0].char_name || avatar.replace(/\.png$/i, ''),
                    thumbnail: thumbnailUrl(avatar),
                    chats: this.sortChats(avatar, items),
                    pinned,
                    newest: this.indexOfChat(chats, items[0]),
                };
            })
            // Pinned folders float; otherwise the API order (newest first) wins.
            .sort((a, b) => {
                if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
                return a.newest - b.newest;
            });

        const limit = Math.max(1, Number(settings.maxFolders) || 3);
        return { folders, others, initial: limit };
    },

    chatKey(chat) {
        return String(chat?.chat_name || chat?.file_name || '').replace(/\.jsonl$/i, '');
    },

    isChatPinned(avatar, chatName) {
        const map = this.getSettings().pinnedChats || {};
        return (map[avatar] || []).includes(String(chatName || '').replace(/\.jsonl$/i, ''));
    },

    /** Pinned chats first (in pin order), then the rest in API order. */
    sortChats(avatar, chats) {
        const pinned = (this.getSettings().pinnedChats || {})[avatar] || [];
        if (pinned.length === 0) return chats;
        const rank = (chat) => {
            const index = pinned.indexOf(this.chatKey(chat));
            return index === -1 ? Number.MAX_SAFE_INTEGER : index;
        };
        return [...chats].sort((a, b) => rank(a) - rank(b));
    },

    isFolderPinned(avatar) {
        return (this.getSettings().pinnedFolders || []).includes(avatar);
    },

    toggleFolderPin(avatar) {
        const settings = this.getSettings();
        const list = settings.pinnedFolders || [];
        settings.pinnedFolders = list.includes(avatar)
            ? list.filter(item => item !== avatar)
            : [...list, avatar];
        this.save();
        this.refresh();
    },

    toggleChatPin(avatar, chatName) {
        const settings = this.getSettings();
        const map = settings.pinnedChats || {};
        const key = String(chatName || '').replace(/\.jsonl$/i, '');
        const list = map[avatar] || [];
        map[avatar] = list.includes(key) ? list.filter(item => item !== key) : [...list, key];
        settings.pinnedChats = map;
        this.save();
        this.refresh();
    },

    async renameChat(chat, chatName, avatarOverride) {
        const avatar = chat.avatar || avatarOverride || '';
        const index = characters?.findIndex(c => c.avatar === avatar) ?? -1;
        if (index === -1) return;
        const next = window.prompt('重命名聊天', chatName);
        if (!next || next.trim() === '' || next === chatName) return;
        try {
            await renameGroupOrCharacterChat({
                characterId: String(index),
                oldFileName: chatName,
                newFileName: String(next).trim(),
                loader: false,
            });
            this.forgetCache(avatar);
            this.refresh();
        } catch (e) {
            console.error('[模块-主页文件夹] 重命名失败:', e);
        }
    },

    async deleteChat(chat, chatName, avatarOverride) {
        const avatar = chat.avatar || avatarOverride || '';
        const index = characters?.findIndex(c => c.avatar === avatar) ?? -1;
        if (index === -1) return;
        if (!window.confirm(`确定要删除聊天「${chatName}」吗？`)) return;
        try {
            await deleteCharacterChatByName(index, chatName);
            this.forgetCache(avatar);
            this.refresh();
        } catch (e) {
            console.error('[模块-主页文件夹] 删除失败:', e);
        }
    },

    /** Deletes every chat inside one character folder, after confirmation. */
    async deleteFolderChats(folder) {
        const index = characters?.findIndex(c => c.avatar === folder.avatar) ?? -1;
        if (index === -1) return;
        const count = folder.chats.length;
        const message = `确定要删除「${folder.name}」的全部聊天记录吗？\n共 ${count} 个聊天，删除后无法恢复。`;
        if (!window.confirm(message)) return;

        const results = await Promise.allSettled(
            folder.chats.map(chat => deleteCharacterChatByName(index, this.chatKey(chat)))
        );
        this.forgetCache(folder.avatar);
        const failed = results.filter(item => item.status === 'rejected').length;
        if (failed > 0) {
            console.warn(`[模块-主页文件夹] ${failed} 个聊天删除失败`);
        }
        this.refresh();
    },

    indexOfChat(chats, target) {
        return chats.indexOf(target);
    },

    /** Same markup as SillyTavern's own "show more" toggle. */
    renderShowMore(count) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'menu_button menu_button_icon showMoreChats stmd-show-more';
        button.title = `还有 ${count} 个角色`;
        button.innerHTML = '<small class="fa-solid fa-chevron-down fa-fw fa-1x"></small>';
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const list = button.closest('.recentChatList');
            const rotated = button.classList.contains('rotated');
            list?.querySelectorAll('.stmd-folder-head.stmd-hidden, .stmd-folder-head.stmd-revealed').forEach(head => {
                head.classList.toggle('stmd-hidden', rotated);
                head.classList.toggle('stmd-revealed', !rotated);
                // Revealed folders get their total count only now.
                if (!rotated) {
                    this.ensureFolderTotal(head, head.dataset.avatar);
                }
            });
            button.classList.toggle('rotated', !rotated);
            button.title = rotated ? `还有 ${count} 个角色` : '收起';
        });
        return button;
    },

    renderFolder(folder) {
        const open = this.isOpen(folder.avatar);

        // Flat structure: the header is a direct child of .recentChatList, just
        // like SillyTavern's own rows, so selectors such as `> .recentChat` and
        // sibling rules keep working. Only the expanded body needs a wrapper.
        const head = document.createElement('div');
        head.className = `recentChat stmd-folder-head${open ? ' stmd-open' : ''}`;
        head.dataset.avatar = folder.avatar;
        head.setAttribute('role', 'button');
        head.tabIndex = 0;
        head.title = folder.name;
        head.innerHTML = `
            <div class="avatar"><img src="${escape(folder.thumbnail)}" data-fallback="${escape(characterImage(folder.avatar))}" alt="" loading="lazy" decoding="async" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}"></div>
            <div class="recentChatInfo">
                <div class="chatNameContainer">
                    <div class="chatName">
                        <strong class="characterName">${escape(folder.name)}</strong>
                    </div>
                    <div class="chatActions">
                        <button class="menu_button menu_button_icon pinChat stmd-folder-pin ${folder.pinned ? 'active' : ''}" title="置顶角色" type="button">
                            <i class="fa-solid fa-thumbtack fa-fw"></i>
                        </button>
                        <button class="menu_button menu_button_icon deleteChat stmd-folder-delete" title="删除该角色的全部聊天" type="button">
                            <i class="fa-solid fa-trash fa-fw"></i>
                        </button>
                    </div>
                </div>
                <div class="stmd-folder-meta">
                    <span class="stmd-folder-count">${folder.chats.length} 个聊天</span>
                    <span class="stmd-folder-progress"></span>
                </div>
            </div>
            <i class="fa-solid fa-chevron-down stmd-folder-chevron"></i>`;

        const body = document.createElement('div');
        body.className = `stmd-folder-body${open ? ' stmd-open' : ''}`;
        for (const chat of folder.chats) {
            body.appendChild(this.renderChatRow(chat, folder.avatar));
        }

        const toggle = (event) => {
            event.stopPropagation();
            const next = !head.classList.contains('stmd-open');
            head.classList.toggle('stmd-open', next);
            body.classList.toggle('stmd-open', next);
            this.setOpen(folder.avatar, next);
        };
        head.addEventListener('click', toggle);
        head.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggle(event);
            }
        });

        // Reaching the bottom keeps pulling that character's older chats.
        body.addEventListener('scroll', () => {
            if (body.scrollTop + body.clientHeight >= body.scrollHeight - 32) {
                void this.loadMore(head, body, folder);
            }
        });

        this.ensureFolderTotal(head, folder.avatar);

        const pinButton = head.querySelector('.stmd-folder-pin');
        pinButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleFolderPin(folder.avatar);
        });

        const deleteButton = head.querySelector('.stmd-folder-delete');
        deleteButton?.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.deleteFolderChats(folder);
        });

        const fragment = document.createDocumentFragment();
        fragment.append(head, body);
        return { node: fragment, head, body };
    },

    /** Total chats of a character; cheap (file names only) and cached. */
    async fetchTotal(avatar) {
        if (this._totals.has(avatar)) return this._totals.get(avatar);
        try {
            const response = await fetch('/api/characters/chats', {
                method: 'POST',
                headers: getRequestHeaders(),
                body: JSON.stringify({ avatar_url: avatar, simple: true }),
            });
            const list = await response.json();
            const total = Array.isArray(list) ? list.length : 0;
            this._totals.set(avatar, total);
            return total;
        } catch (e) {
            return null;
        }
    },

    async ensureFolderTotal(head, avatar) {
        const total = await this.fetchTotal(avatar);
        if (total === null || !head?.isConnected) return;
        const span = head.querySelector('.stmd-folder-count');
        if (span) span.textContent = `${total} 个聊天`;
    },

    /** Full chat list (with metadata) for one character; fetched on demand. */
    async fetchAllChats(avatar) {
        if (this._allChats.has(avatar)) return this._allChats.get(avatar);
        const response = await fetch('/api/characters/chats', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify({ avatar_url: avatar, metadata: true }),
        });
        const list = await response.json();
        const chats = (Array.isArray(list) ? list : [])
            .filter(chat => chat && chat.file_name)
            .sort((a, b) => Number(b.last_mes || 0) - Number(a.last_mes || 0));
        this._allChats.set(avatar, chats);
        this._totals.set(avatar, chats.length);
        return chats;
    },

    async loadMore(head, body, folder) {
        const avatar = folder.avatar;
        if (this._loading.has(avatar)) return;
        if (!body) return;

        this._loading.add(avatar);
        const spinner = document.createElement('div');
        spinner.className = 'stmd-loading';
        spinner.innerHTML = '<span></span><span></span><span></span>';
        body.appendChild(spinner);
        try {
            const all = await this.fetchAllChats(avatar);
            const rendered = new Set([...body.querySelectorAll('.recentChat')].map(row => row.dataset.file));
            const next = all
                .filter(chat => !rendered.has(String(chat.file_name || '').replace(/\.jsonl$/i, '')))
                .slice(0, this._pageSize);
            for (const chat of next) {
                body.insertBefore(this.renderChatRow(chat, avatar), spinner);
            }
            const shown = body.querySelectorAll('.recentChat').length;
            this.showProgress(head, shown, all.length);
            const countSpan = head.querySelector('.stmd-folder-count');
            if (countSpan) countSpan.textContent = `${all.length} 个聊天`;
        } catch (e) {
            console.warn('[模块-主页文件夹] 加载更多失败:', e);
        } finally {
            spinner.remove();
            this._loading.delete(avatar);
        }
    },

    /** Drops cached counts so the next render reads fresh data. */
    forgetCache(avatar) {
        this._totals.delete(avatar);
        this._allChats.delete(avatar);
    },

    showProgress(head, shown, total) {
        const el = head.querySelector('.stmd-folder-progress');
        if (!el) return;
        el.textContent = `${shown}/${total}`;
        el.classList.add('visible');
        clearTimeout(el._hideTimer);
        el._hideTimer = setTimeout(() => el.classList.remove('visible'), 2500);
    },

    renderChatRow(chat, avatarOverride = '') {
        const fileName = String(chat.file_name || chat.chat_name || '');
        const chatName = String(chat.chat_name || fileName.replace(/\.jsonl$/i, ''));
        const avatar = chat.avatar || avatarOverride || '';
        const row = document.createElement('div');
        row.className = 'recentChat stmd-folder-row';
        row.dataset.avatar = avatar;
        row.dataset.file = chatName;
        row.title = fileName;
        const thumb = thumbnailUrl(avatar);
        const message = String(chat.mes || '').slice(0, 300);
        const dateLong = formatDate(chat.last_mes, true);
        const dateShort = formatDate(chat.last_mes);
        const info = characters?.find(c => c.avatar === avatar);
        const charName = info?.name || chat.char_name || '';
        const count = Number(chat.chat_items) || 0;
        const pinned = this.isChatPinned(avatar, chatName);
        row.innerHTML = `
            <div class="avatar"><img src="${escape(thumb)}" data-fallback="${escape(characterImage(avatar))}" alt="" loading="lazy" decoding="async" onerror="if(this.dataset.fallback&&this.src!==this.dataset.fallback){this.src=this.dataset.fallback}"></div>
            <div class="recentChatInfo">
                <div class="chatNameContainer">
                    <div class="chatName" title="${escape(fileName)}">
                        <strong class="characterName">${escape(charName)}</strong>
                        <span>–</span>
                        <span>${escape(chatName)}</span>
                    </div>
                    <small class="chatDate" title="${escape(dateLong)}">${escape(dateShort)}</small>
                    <div class="chatActions">
                        <button class="menu_button menu_button_icon pinChat ${pinned ? 'active' : ''}" title="置顶聊天" type="button">
                            <i class="fa-solid fa-thumbtack fa-fw"></i>
                        </button>
                        <button class="menu_button menu_button_icon renameChat" title="重命名聊天" type="button">
                            <i class="fa-solid fa-pen-to-square fa-fw"></i>
                        </button>
                        <button class="menu_button menu_button_icon deleteChat" title="删除聊天" type="button">
                            <i class="fa-solid fa-trash fa-fw"></i>
                        </button>
                    </div>
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

        row.querySelector('.pinChat')?.addEventListener('click', (event) => {
            event.stopPropagation();
            this.toggleChatPin(avatar, chatName);
        });
        row.querySelector('.renameChat')?.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.renameChat(chat, chatName, avatar);
        });
        row.querySelector('.deleteChat')?.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.deleteChat(chat, chatName, avatar);
        });
        row.addEventListener('click', (event) => {
            event.stopPropagation();
            void this.openChat(avatar, fileName);
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
                <label class="stmd-field-label" for="stmd_folders_max">初始显示的角色数量（其余点「展开更多」显示）</label>
                <input id="stmd_folders_max" class="text_pole" type="number" min="1" max="20" step="1" value="${Number(settings.maxFolders) || 3}">
                <div class="sub-setting-description">
                    每次拉取的最近聊天条数（决定能覆盖多少旧聊天）：
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
        this._force = true;
        document.querySelectorAll('.recentChatList').forEach(list => { delete list.dataset.stmdBuilt; });
        this.schedule();
    },
};
