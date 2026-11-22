import { saveSettingsDebounced } from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';
import { power_user } from '../../../../../scripts/power-user.js';

// Screenshot privacy: mask sensitive names/avatars in the visible viewport.
//
// Rules are explicit rows (pattern + replacement) and only run when the user
// presses 应用 — typing a half-finished pattern must never repaint the page.
// Only elements currently on screen are processed; the pass re-runs after the
// page settles (entering a character, switching chats, scrolling, ...).

const STYLE_CLASS = {
    blur: 'stmd-mask-blur',
    bar: 'stmd-mask-bar',
};

const AVATAR_CLASS = 'stmd-mask-avatar';
const CONTAINER_SELECTOR = '.recentChat, .mes, .character-card, .stmd-folder-head, #chat .mes';

const originalText = new Map();
const wrappedNodes = new Map();
const maskedImages = new Set();

const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const escapeHtml = (value) => String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

function buildRegex(pattern) {
    const raw = String(pattern || '').trim();
    if (!raw) return null;
    try {
        if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
            const body = raw.slice(1, raw.lastIndexOf('/'));
            const flags = raw.slice(raw.lastIndexOf('/') + 1) || 'g';
            return new RegExp(body, flags.includes('g') ? flags : `${flags}g`);
        }
        return new RegExp(raw, 'g');
    } catch {
        return new RegExp(escapeRegExp(raw), 'g');
    }
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
        rules: [],
        style: 'replace',
        avatarMode: 'rule',
        token: '***',
    }),

    _observer: null,
    _timer: null,
    _settleTimer: null,
    _running: false,
    _applied: null,

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings, rules: [] };
        }
        const settings = extension_settings[this.name];
        for (const key of Object.keys(this.defaultSettings)) {
            if (settings[key] === undefined) settings[key] = this.defaultSettings[key];
        }
        // Migrate the old free-text format once.
        if (typeof settings.rules === 'string') {
            settings.rules = settings.rules
                .split('\n')
                .map(line => line.trim())
                .filter(Boolean)
                .map(line => {
                    const arrow = line.indexOf('=>');
                    return arrow === -1
                        ? { match: line, replace: '' }
                        : { match: line.slice(0, arrow).trim(), replace: line.slice(arrow + 2).trim() };
                });
        }
        if (!Array.isArray(settings.rules)) settings.rules = [];
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
        this._observer = new MutationObserver(() => {
            // Nothing to do until the user confirms a mask.
            if (!this._applied) return;
            this.schedule(300);
        });
        // Expanding/collapsing a folder only flips classes; that path uses this.
        document.addEventListener('stmd:layout-changed', () => {
            if (!this._applied) return;
            this.schedule(120);
        });
        // Expanding a folder only flips a class (display:none -> block), which
        // produces no childList mutation — watch attributes as well.
        this._observer.observe(target, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
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

    /** Applies the last confirmed snapshot; editing rules alone changes nothing. */
    apply() {
        const settings = this._applied;
        if (!settings || !settings.enabled) return;
        if (this._running) return;
        this._running = true;
        try {
            const rules = (settings.rules || [])
                .map(rule => ({ regex: buildRegex(this.expandMacros(rule.match)), replacement: rule.replace }))
                .filter(rule => rule.regex);
            if (rules.length > 0) this.maskText(settings, rules);
            if (settings.avatarMode === 'all') this.maskAllAvatars();
        } catch (error) {
            console.warn('[模块-打码] 执行失败:', error);
        } finally {
            this._running = false;
        }
    },

    /** Expands {{char}} / {{user}} into the real names before matching. */
    expandMacros(pattern) {
        const source = String(pattern || '');
        if (!source.includes('{{char}}') && !source.includes('{{user}}')) return source;
        const context = window.SillyTavern?.getContext?.() || {};
        const names = (context.characters || []).map(item => item?.name).filter(Boolean);
        const isMacro = (value) => !value || /^\{\{.*\}\}$/.test(String(value));
        const personaNames = Object.values(power_user?.personas || {})
            .map(value => String(value).trim())
            .filter(value => value && !isMacro(value));
        const userName = isMacro(context.name1) ? '' : String(context.name1).trim();
        const userNames = [...new Set([userName, ...personaNames].filter(Boolean))];

        let output = source;
        if (output.includes('{{char}}')) {
            const alternatives = names.length
                ? names.map(name => escapeRegExp(name)).sort((a, b) => b.length - a.length).join('|')
                : escapeRegExp('{{char}}');
            output = output.split('{{char}}').join(`(?:${alternatives})`);
        }
        if (output.includes('{{user}}')) {
            const alternatives = userNames.length
                ? userNames.map(name => escapeRegExp(name)).sort((a, b) => b.length - a.length).join('|')
                : escapeRegExp('{{user}}');
            output = output.split('{{user}}').join(`(?:${alternatives})`);
        }
        return output;
    },

    maskText(settings, rules) {
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
            if (originalText.has(node)) continue; // already masked once
            const text = node.nodeValue;
            if (!text || !text.trim()) continue;

            let replaced = text;
            let hit = false;
            for (const rule of rules) {
                rule.regex.lastIndex = 0;
                if (!rule.regex.test(replaced)) continue;
                hit = true;
                replaced = replaced.replace(rule.regex, rule.replacement || settings.token);
            }
            if (!hit) continue;

            if (settings.style === 'replace') {
                originalText.set(node, text);
                node.nodeValue = replaced;
                if (settings.avatarMode === 'rule') this.maskAvatarsNear(node.parentElement);
            } else {
                // Only the matched slice gets blurred / barred, not the whole node.
                this.wrapRanges(node, text, rules, settings);
            }
        }
    },

    /** Wraps only the matched slices, leaving the rest of the text readable. */
    wrapRanges(node, text, rules, settings) {
        const parent = node.parentElement;
        if (!parent) return;

        const ranges = [];
        for (const rule of rules) {
            rule.regex.lastIndex = 0;
            let match;
            while ((match = rule.regex.exec(text)) !== null) {
                if (match[0].length === 0) break;
                ranges.push([match.index, match.index + match[0].length]);
                if (!rule.regex.global) break;
            }
        }
        if (ranges.length === 0) return;

        ranges.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const [start, end] of ranges) {
            const last = merged[merged.length - 1];
            if (last && start <= last[1]) last[1] = Math.max(last[1], end);
            else merged.push([start, end]);
        }

        const className = STYLE_CLASS[settings.style] || STYLE_CLASS.blur;
        const fragment = document.createDocumentFragment();
        let cursor = 0;
        for (const [start, end] of merged) {
            if (start > cursor) fragment.appendChild(document.createTextNode(text.slice(cursor, start)));
            const wrapper = document.createElement('span');
            wrapper.className = className;
            wrapper.textContent = text.slice(start, end);
            wrappedNodes.set(wrapper, text.slice(start, end));
            fragment.appendChild(wrapper);
            cursor = end;
        }
        if (cursor < text.length) fragment.appendChild(document.createTextNode(text.slice(cursor)));
        parent.replaceChild(fragment, node);

        // The spans only get a usable closest() once they are in the document.
        if (settings.avatarMode === 'rule') this.maskAvatarsNear(parent);
    },

    /** Blurs avatars inside the same card as a masked name. */
    maskAvatarsNear(element) {
        const container = element?.closest?.(CONTAINER_SELECTOR);
        if (!container) return;
        container.querySelectorAll('img').forEach(img => {
            if (!/\/characters\/|\/thumbnail\?type=avatar|\/avatar-display\//.test(img.getAttribute('src') || '')) return;
            img.classList.add(AVATAR_CLASS);
            maskedImages.add(img);
        });
    },

    maskAllAvatars() {
        document.querySelectorAll('img').forEach(img => {
            if (maskedImages.has(img)) return;
            if (!/\/characters\/|\/thumbnail\?type=avatar|\/avatar-display\//.test(img.getAttribute('src') || '')) return;
            if (!isVisible(img)) return;
            img.classList.add(AVATAR_CLASS);
            maskedImages.add(img);
        });
    },

    restore() {
        for (const [node, text] of originalText) {
            if (node.isConnected) node.nodeValue = text;
        }
        originalText.clear();
        for (const [wrapper, text] of wrappedNodes) {
            if (wrapper.isConnected && wrapper.parentElement) {
                wrapper.replaceWith(document.createTextNode(text));
            }
        }
        wrappedNodes.clear();
        for (const img of maskedImages) img.classList.remove(AVATAR_CLASS);
        maskedImages.clear();
    },

    renderSeg(field, options, current) {
        return `<div class="stmd-seg" data-field="${field}">` + options.map(([value, label]) =>
            `<button type="button" class="stmd-seg-btn ${value === current ? 'active' : ''}" data-field="${field}" data-value="${value}">${label}</button>`
        ).join('') + '</div>';
    },

    renderRuleRow(rule = { match: '', replace: '' }, index = 0) {
        return `
            <div class="stmd-mask-rule-row" data-index="${index}" style="display: flex; gap: 6px; align-items: center; margin-bottom: 6px;">
                <input class="text_pole stmd-mask-match" placeholder="要打码的内容 / 正则" value="${escapeHtml(rule.match)}" style="flex: 1 1 auto; min-width: 0;">
                <span style="opacity: 0.6;">→</span>
                <input class="text_pole stmd-mask-replace" placeholder="替换为（留空=***）" value="${escapeHtml(rule.replace)}" style="flex: 0 0 38%; min-width: 0;">
                <button class="menu_button menu_button_icon stmd-mask-del" title="删除这条规则" type="button">
                    <i class="fa-solid fa-trash fa-fw"></i>
                </button>
            </div>`;
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        const rows = settings.rules.map((rule, index) => this.renderRuleRow(rule, index)).join('');
        const styleSeg = this.renderSeg('style', [
            ['replace', '替换 ***'],
            ['blur', '模糊'],
            ['bar', '黑条'],
        ], settings.style);
        const avatarSeg = this.renderSeg('avatarMode', [
            ['rule', '跟随规则'],
            ['all', '全局'],
            ['none', '不打码'],
        ], settings.avatarMode);

        return `
            <div class="stmd-mask-settings">
                <div class="sub-setting-description">
                    只处理当前屏幕可见的内容。规则写完后点「应用」才会生效。
                </div>

                <div id="stmd_mask_rules_container">${rows}</div>
                <button id="stmd_mask_add_rule" class="menu_button" type="button" style="width: 100%; margin-bottom: 10px;">
                    <i class="fa-solid fa-plus fa-fw"></i> 添加规则
                </button>

                <div class="form-group">
                    <label>打码方式</label>
                    ${styleSeg}
                </div>

                <div class="form-group">
                    <label>头像处理</label>
                    ${avatarSeg}
                    <div class="sub-setting-description">跟随规则：只有名字被屏蔽的角色头像才模糊。</div>
                </div>

                <div style="display: flex; gap: 8px; margin-top: 10px;">
                    <button id="stmd_mask_apply" class="menu_button" type="button" style="flex: 1 1 auto;">
                        <i class="fa-solid fa-check fa-fw"></i> 应用
                    </button>
                    <button id="stmd_mask_clear" class="menu_button" type="button" style="flex: 0 0 auto;">
                        还原
                    </button>
                </div>
            </div>`;
    },

    updateRulesFromUI() {
        const rules = [];
        document.querySelectorAll('.stmd-mask-rule-row').forEach(row => {
            const match = row.querySelector('.stmd-mask-match')?.value?.trim() || '';
            const replace = row.querySelector('.stmd-mask-replace')?.value ?? '';
            if (match) rules.push({ match, replace });
        });
        this.getSettings().rules = rules;
        this.save();
    },

    bindSettingsEvents() {
        $(document)
            .off('click.stmdMask')
            .on('click.stmdMask', '#stmd_mask_add_rule', () => {
                const container = document.getElementById('stmd_mask_rules_container');
                if (!container) return;
                const index = container.querySelectorAll('.stmd-mask-rule-row').length;
                container.insertAdjacentHTML('beforeend', this.renderRuleRow({ match: '', replace: '' }, index));
            })
            .on('click.stmdMask', '.stmd-mask-del', (event) => {
                $(event.currentTarget).closest('.stmd-mask-rule-row').remove();
                this.updateRulesFromUI();
                this.restore();
                this.schedule(50);
            })
            .on('input.stmdMask', '.stmd-mask-rule-row input', () => {
                this.updateRulesFromUI();
            })
            .on('click.stmdMask', '.stmd-seg-btn', (event) => {
                const button = event.currentTarget;
                const field = button.dataset.field;
                if (field !== 'style' && field !== 'avatarMode') return;
                this.getSettings()[field] = button.dataset.value;
                if (this._applied) this._applied[field] = button.dataset.value;
                button.closest('.stmd-seg')?.querySelectorAll('.stmd-seg-btn').forEach(item => {
                    item.classList.toggle('active', item === button);
                });
                this.save();
                this.restore();
                this.schedule(50);
            })
            .on('click.stmdMask', '#stmd_mask_apply', () => {
                this.updateRulesFromUI();
                this._applied = JSON.parse(JSON.stringify(this.getSettings()));
                this.restore();
                this.apply();
                const toast = window.toastr || { success() {} };
                toast.success('打码已应用');
            })
            .on('click.stmdMask', '#stmd_mask_clear', () => {
                this._applied = null;
                this.restore();
            });
    },
};
