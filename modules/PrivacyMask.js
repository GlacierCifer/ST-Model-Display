import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

// Screenshot privacy: mask sensitive names/avatars in the visible viewport.
//
// Rules are plain lines of `匹配 => 替换`; a bare pattern replaces matches with
// the mask token. Only elements currently on screen are processed, and the pass
// re-runs after the page settles (entering a character, switching chats, ...).

const STYLE_CLASS = {
    blur: 'stmd-mask-blur',
    bar: 'stmd-mask-bar',
};

const AVATAR_CLASS = 'stmd-mask-avatar';

const originalText = new Map();
const wrappedNodes = new Set();
const maskedImages = new Set();

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseRules(text) {
    return String(text || '')
        .split('\n')
        .map(line => line.trim())
        .filter(Boolean)
        .map(line => {
            const arrow = line.indexOf('=>');
            const pattern = arrow === -1 ? line : line.slice(0, arrow).trim();
            const replacement = arrow === -1 ? null : line.slice(arrow + 2).trim();
            if (!pattern) return null;
            try {
                const source = pattern.startsWith('/') && pattern.lastIndexOf('/') > 0
                    ? pattern.slice(1, pattern.lastIndexOf('/'))
                    : pattern;
                const flags = pattern.startsWith('/') && pattern.lastIndexOf('/') > 0
                    ? pattern.slice(pattern.lastIndexOf('/') + 1) || 'g'
                    : 'g';
                return { regex: new RegExp(source, flags.includes('g') ? flags : `${flags}g`), replacement };
            } catch {
                return { regex: new RegExp(escapeRegExp(pattern), 'g'), replacement };
            }
        })
        .filter(Boolean);
}

function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    return rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth;
}

export const PrivacyMaskModule = {
    name: 'privacy_mask',
    defaultSettings: Object.freeze({
        enabled: false,
        rules: '',
        style: 'replace',
        maskAvatars: true,
        token: '***',
    }),

    _observer: null,
    _timer: null,
    _settleTimer: null,
    _running: false,

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
        this.schedule(0);
    },

    watch() {
        if (this._observer) return;
        const target = document.getElementById('chat') || document.body;
        this._observer = new MutationObserver(() => this.schedule(300));
        this._observer.observe(target, { childList: true, subtree: true, characterData: true });
        window.addEventListener('scroll', () => this.schedule(250), { passive: true });
        window.addEventListener('resize', () => this.schedule(250), { passive: true });
    },

    /** Debounced pass, plus one extra run once the page stops changing. */
    schedule(delay = 300) {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this.apply(), delay);
        clearTimeout(this._settleTimer);
        this._settleTimer = setTimeout(() => this.apply(), delay + 1200);
    },

    apply() {
        const settings = this.getSettings();
        if (!settings.enabled) {
            this.restore();
            return;
        }
        if (this._running) return;
        this._running = true;
        try {
            this.maskText(settings);
            if (settings.maskAvatars) this.maskAvatars();
        } catch (error) {
            console.warn('[模块-打码] 执行失败:', error);
        } finally {
            this._running = false;
        }
    },

    maskText(settings) {
        const rules = parseRules(settings.rules);
        if (rules.length === 0) return;

        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                const tag = parent.tagName;
                if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'TEXTAREA' || tag === 'INPUT') return NodeFilter.FILTER_REJECT;
                if (parent.closest('.stmd-mask-blur, .stmd-mask-bar')) return NodeFilter.FILTER_REJECT;
                return isVisible(parent) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });

        const nodes = [];
        while (walker.nextNode()) nodes.push(walker.currentNode);

        for (const node of nodes) {
            const text = node.nodeValue;
            if (!text || text.trim().length < 1) continue;

            let replaced = text;
            let hit = false;
            for (const rule of rules) {
                if (!rule.regex.test(replaced)) continue;
                hit = true;
                replaced = replaced.replace(rule.regex, rule.replacement ?? settings.token);
            }
            if (!hit) continue;

            if (settings.style === 'replace') {
                if (!originalText.has(node)) originalText.set(node, text);
                node.nodeValue = replaced;
            } else {
                const className = STYLE_CLASS[settings.style] || STYLE_CLASS.blur;
                const wrapper = document.createElement('span');
                wrapper.className = className;
                wrapper.textContent = replaced;
                const parent = node.parentElement;
                if (!parent) continue;
                parent.insertBefore(wrapper, node);
                parent.removeChild(node);
                wrappedNodes.add(wrapper);
            }
        }
    },

    maskAvatars() {
        const images = document.querySelectorAll('img');
        for (const img of images) {
            if (maskedImages.has(img)) continue;
            const src = img.getAttribute('src') || '';
            if (!/\/characters\/|\/thumbnail\?type=avatar|\/avatar-display\//.test(src)) continue;
            if (!isVisible(img)) continue;
            img.classList.add(AVATAR_CLASS);
            maskedImages.add(img);
        }
    },

    restore() {
        for (const [node, text] of originalText) {
            if (node.isConnected) node.nodeValue = text;
        }
        originalText.clear();
        for (const wrapper of wrappedNodes) {
            if (wrapper.isConnected && wrapper.parentElement) {
                wrapper.replaceWith(document.createTextNode(wrapper.textContent));
            }
        }
        wrappedNodes.clear();
        for (const img of maskedImages) {
            img.classList.remove(AVATAR_CLASS);
        }
        maskedImages.clear();
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        const styleOptions = [
            ['replace', '替换为 ***'],
            ['blur', '模糊'],
            ['bar', '黑条'],
        ].map(([value, label]) => `<option value="${value}" ${settings.style === value ? 'selected' : ''}>${label}</option>`).join('');

        return `
            <div class="stmd-mask-settings">
                <div class="sub-setting-description">
                    只处理当前屏幕可见的内容。每行一条规则，格式：<code>匹配 => 替换</code>，省略替换则用 ***。
                </div>
                <textarea id="stmd_mask_rules" class="text_pole" rows="4" placeholder="例如：&#10;测试专用 => 测试角色&#10;^某个名字$"></textarea>
                <div class="form-group">
                    <label for="stmd_mask_style">打码方式</label>
                    <select id="stmd_mask_style" class="text_pole">${styleOptions}</select>
                </div>
                <label class="checkbox_label">
                    <input type="checkbox" id="stmd_mask_avatars" ${settings.maskAvatars ? 'checked' : ''}>
                    <span>同时模糊头像</span>
                </label>
            </div>`;
    },

    bindSettingsEvents() {
        $('#stmd_mask_rules')
            .off('input.stmdMask')
            .on('input.stmdMask', (event) => {
                this.getSettings().rules = String($(event.currentTarget).val());
                this.save();
                this.schedule(400);
            })
            .each((_, element) => { element.value = this.getSettings().rules || ''; });

        $('#stmd_mask_style')
            .off('change.stmdMask')
            .on('change.stmdMask', (event) => {
                this.getSettings().style = String($(event.currentTarget).val());
                this.save();
                this.restore();
                this.schedule(100);
            });

        $('#stmd_mask_avatars')
            .off('change.stmdMask')
            .on('change.stmdMask', (event) => {
                this.getSettings().maskAvatars = $(event.currentTarget).is(':checked');
                this.save();
                this.schedule(100);
            });
    },
};
