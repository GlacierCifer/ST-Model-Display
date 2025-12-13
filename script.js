import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//  小杂物集 (Misc Utilities) v1.4.0
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
//  - 模块2-1: 标语注入 (Slogan Injection)
//  - 模块3: 全局字体替换 (Global Font)
//  - 模块4: 聊天截图 (Screenshot)
// ===================================================================


// ###################################################################
//
//  模块 1: 模型名称显示 (Model Display)
//
// ###################################################################
const ModelDisplayModule = {
    name: 'model_display',
    CURRENT_SCRIPT_VERSION: '1.4.0',
    modelHistory: {},
    chatContentObserver: null,
    chatContainerObserver: null,
    processingMessages: new Set(),
    pendingProcessing: new Map(),
    defaultSettings: Object.freeze({
        enabled: true,
        fontSize: '0.85em',
        prefix: '|',
        suffix: '|',
        modelNameOverrides: {},
    }),
    init() {
        if (this.getSettings().enabled) {
            this.startObservers();
            this.restoreAllFromHistory();
        }
        this.checkForUpdates();
        console.log('[模块-模型显示] 初始化成功。');
    },
    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];
        for (const key of Object.keys(this.defaultSettings)) {
            if (!Object.hasOwnProperty.call(settings, key)) {
                settings[key] = this.defaultSettings[key];
            }
        }
        if (typeof settings.modelNameOverrides !== 'object' || settings.modelNameOverrides === null) {
            settings.modelNameOverrides = {};
        }
        return settings;
    },
    saveSettings() {
        script.saveSettingsDebounced();
        this.rerenderAllModelNames();
    },
    renderSettingsHtml() {
        const settings = this.getSettings();
        const overridesHtml = Object.entries(settings.modelNameOverrides)
            .map(([original, custom], index) => this.renderOverrideRow(original, custom, index))
            .join('');

        return `
        <div id="model_display_options_wrapper">
            <h3 class="sub-header">模型名称显示</h3>
            <div class="form-group">
                <label for="model_display_font_size">字体大小:</label>
                <div><input type="text" id="model_display_font_size" class="text_pole" placeholder="例如: 0.85em" value="${settings.fontSize}"></div>
            </div>
            <div class="form-group">
                <label for="model_display_prefix">前缀:</label>
                <div><input type="text" id="model_display_prefix" class="text_pole" placeholder="输入前缀..." value="${settings.prefix}"></div>
            </div>
            <div class="form-group">
                <label for="model_display_suffix">后缀:</label>
                <div><input type="text" id="model_display_suffix" class="text_pole" placeholder="输入后缀..." value="${settings.suffix}"></div>
            </div>
            <h4 class="sub-header" style="margin-top: 15px;">模型名称覆盖</h4>
            <div id="model_name_overrides_container">${overridesHtml}</div>
            <button id="add_model_override_btn" class="menu_button fa-solid fa-plus" style="margin-top: 5px;"> </button>
            <hr>
        </div>`;
    },
    renderOverrideRow(original, custom, index) {
        return `
        <div class="form-group model-override-row" data-index="${index}">
            <input type="text" class="text_pole original-name" placeholder="原始模型名称" value="${original}">
            <span style="margin: 0 5px;">→</span>
            <input type="text" class="text_pole custom-name" placeholder="自定义显示名称" value="${custom}">
            <button class="menu_button fa-solid fa-trash-can delete-override-btn" style="margin-left: 5px;"></button>
        </div>`;
    },
    bindSettingsEvents() {
        const settings = this.getSettings();
        $(document).on('input', '#model_display_font_size', (e) => { settings.fontSize = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_prefix', (e) => { settings.prefix = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_suffix', (e) => { settings.suffix = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('click', '#add_model_override_btn', () => {
            const newIndex = $('#model_name_overrides_container .model-override-row').length;
            $('#model_name_overrides_container').append(this.renderOverrideRow('', '', newIndex));
        });
        $(document).on('click', '.delete-override-btn', (e) => {
            $(e.currentTarget).closest('.model-override-row').remove();
            this.updateOverridesFromUI();
        });
        $(document).on('input', '.model-override-row .text_pole', () => { this.updateOverridesFromUI(); });
    },
    updateOverridesFromUI() {
        const newOverrides = {};
        $('.model-override-row').each(function() {
            const original = $(this).find('.original-name').val().trim();
            const custom = $(this).find('.custom-name').val().trim();
            if (original) {
                newOverrides[original] = custom;
            }
        });
        this.getSettings().modelNameOverrides = newOverrides;
        this.saveSettings();
    },
    rerenderAllModelNames(revert = false) {
        document.querySelectorAll('#chat .mes .timestamp-icon[data-model-injected="true"]').forEach(icon => {
            if (revert) {
                icon.innerHTML = '';
                icon.style.width = '';
                icon.style.height = '';
                icon.removeAttribute('data-model-injected');
            } else {
                icon.dataset.modelInjected = 'false';
            }
        });
        if (!revert && this.getSettings().enabled) {
            this.restoreAllFromHistory();
        }
    },
    deepQuerySelector(selector, root = document) {
        try {
            const found = root.querySelector(selector);
            if (found) return found;
            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) {
                    const foundInShadow = element.shadowRoot.querySelector(selector);
                    if (foundInShadow) return foundInShadow;
                }
            }
        } catch (e) { console.warn('[模块-模型显示] 深度查询出错:', e); }
        return null;
    },
    getCurrentModelName(messageElement) {
        const iconSvg = this.deepQuerySelector('.timestamp-icon', messageElement);
        if (!iconSvg) return null;
        const svgTitle = iconSvg.querySelector('title');
        if (svgTitle && svgTitle.textContent.includes(' - ')) {
            return svgTitle.textContent.split(' - ')[1];
        }
        return null;
    },
    getDisplayName(originalModelName) {
        if (!originalModelName) return '';
        const overrides = this.getSettings().modelNameOverrides;
        return overrides[originalModelName] || originalModelName;
    },
    processIcon(iconSvg, modelName) {
        if (iconSvg.dataset.modelInjected === 'true') return;

        const settings = this.getSettings();
        const displayName = this.getDisplayName(modelName);
        const fullText = `${settings.prefix}${displayName}${settings.suffix}`;
        const originalHeight = iconSvg.getBoundingClientRect().height || 22;

        iconSvg.innerHTML = '';
        iconSvg.removeAttribute('viewBox');

        const textElement = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        textElement.textContent = fullText;
        textElement.setAttribute('y', '50%');
        textElement.setAttribute('dominant-baseline', 'middle');
        textElement.style.fill = 'var(--underline_text_color)';
        textElement.style.fontSize = settings.fontSize;
        iconSvg.appendChild(textElement);

        requestAnimationFrame(() => {
            try {
                const textWidth = textElement.getBBox().width;
                iconSvg.style.width = `${textWidth}px`;
                iconSvg.style.height = `${originalHeight}px`;
                iconSvg.setAttribute('viewBox', `0 0 ${textWidth} ${originalHeight}`);
                iconSvg.dataset.modelInjected = 'true';
            } catch (e) { console.error("[模块-模型显示] 渲染SVG时出错:", e); }
        });
    },
    waitForElementAndProcess(messageElement, timeout = 8000) {
        if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;
        const messageId = this.getMessageId(messageElement);
        if (!messageId || messageId === '0' || messageId === '1' || this.processingMessages.has(messageId)) return;
        this.processingMessages.add(messageId);
        const startTime = Date.now();
        const checkIcon = () => {
            if (Date.now() - startTime > timeout) {
                this.processingMessages.delete(messageId);
                return;
            }
            const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
            if (!iconSvg) { setTimeout(checkIcon, 100); return; }
            const modelName = this.getCurrentModelName(messageElement);
            if (modelName) {
                this.processingMessages.delete(messageId);
                this.modelHistory[messageId] = modelName;
                this.processIcon(iconSvg, modelName);
            } else { setTimeout(checkIcon, 200); }
        };
        setTimeout(checkIcon, 100);
    },
    getMessageId(messageElement) {
        const idElement = messageElement.querySelector('.mesIDDisplay');
        return idElement ? idElement.textContent.replace('#', '') : null;
    },
    processAndRecordMessage(messageElement) {
        const messageId = this.getMessageId(messageElement);
        if (!messageId) return;
        if (this.pendingProcessing.has(messageId)) clearTimeout(this.pendingProcessing.get(messageId));
        const timeoutId = setTimeout(() => {
            this.pendingProcessing.delete(messageId);
            this.waitForElementAndProcess(messageElement);
        }, 50);
        this.pendingProcessing.set(messageId, timeoutId);
    },
    restoreAllFromHistory() {
        if (!this.getSettings().enabled) return;
        setTimeout(() => {
            document.querySelectorAll('#chat .mes:not([is_user="true"])').forEach(message => {
                const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', message);
                const messageId = this.getMessageId(message);
                if (iconSvg && messageId && iconSvg.dataset.modelInjected !== 'true') {
                    if (this.modelHistory[messageId]) {
                        this.processIcon(iconSvg, this.modelHistory[messageId]);
                    } else { this.processAndRecordMessage(message); }
                }
            });
        }, 500);
    },
    startObservers() {
        this.stopObservers();
        const chatNode = document.getElementById('chat');
        if (chatNode) {
            this.chatContentObserver = new MutationObserver(mutations => {
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        const added = Array.from(mutation.addedNodes).filter(n => n.nodeType === 1).flatMap(n => n.matches('.mes') ? [n] : Array.from(n.querySelectorAll('.mes')));
                        if (added.length > 0) { requestAnimationFrame(() => added.forEach(m => this.processAndRecordMessage(m))); }
                    }
                }
            });
            this.chatContentObserver.observe(chatNode, { childList: true });
        }
        this.chatContainerObserver = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && node.id === 'chat') { this.restoreAllFromHistory(); this.startObservers(); break; }
                    }
                }
            }
        });
        this.chatContainerObserver.observe(document.body, { childList: true });
    },
    stopObservers() {
        if (this.chatContentObserver) this.chatContentObserver.disconnect();
        if (this.chatContainerObserver) this.chatContainerObserver.disconnect();
        this.chatContentObserver = null;
        this.chatContainerObserver = null;
        this.pendingProcessing.forEach(clearTimeout);
        this.pendingProcessing.clear();
        this.processingMessages.clear();
    },
    async checkForUpdates() {
        const indicator = $('#model_display_version_indicator');
        if (!indicator.length) return;
        indicator.text(`v${this.CURRENT_SCRIPT_VERSION}`).css('cursor', 'default').attr('title', '这是一个修改版，无法自动检查更新。');
    }
};

// ###################################################################
//
//  模块 2: 输入框美化模块 (Placeholder Beautifier)
//
// ###################################################################
const PlaceholderModule = {
    name: 'worldbook_placeholder',
    iframeWindow: null,
    TEXTAREA_ID: 'send_textarea',
    _modifiedRuleState: {
        rule: null,
        originalContent: '',
    },
    defaultSettings: Object.freeze({
        enabled: true,
        customPlaceholder: '',
        placeholderSource: 'custom',
        sloganPrompt: ['元素内仅包含当前角色极具个人风格的语录，格式模仿座右铭、网络用语、另类名言、爱语、吐槽等形式，具备黑色幽默感，最长 15 个汉字。','语录不要重复，也不要额外解释。'].join('\n'),
    }),
    currentSlogan: null,
    isSwitchingCharacter: false,
    worldbookUpdateDebounce: null,

    init() {
        if (!this.getSettings().enabled) {
            this.cleanup();
            return;
        }
        this.waitForIframe().then(() => {
            if (script.eventSource && script.event_types) {
                script.eventSource.on(script.event_types.CHAT_CHANGED, this.onCharacterSwitch.bind(this));
            } else { console.error('[模块-输入框] 致命错误：无法访问 script.eventSource。'); }
            this.applyLogic();
            console.log('[模块-输入框] 初始化成功。');
        });
    },

    cleanup() {
        if (this._modifiedRuleState.rule) {
            try {
                this._modifiedRuleState.rule.style.setProperty('content', this._modifiedRuleState.originalContent);
            } catch (e) {
                // Ignore errors during cleanup
            }
        }
        this._modifiedRuleState = { rule: null, originalContent: '' };

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (textarea) {
            textarea.placeholder = this.resolveFallbackPlaceholder(textarea);
        }
    },

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
    setAutoSlogan(text) {
        const slogan = (text || '').trim();
        if (!slogan) return;
        this.currentSlogan = slogan;
        if (this.getSettings().enabled && this.getSettings().placeholderSource === 'auto') this.applyLogic();
    },
    getCurrentAutoSlogan() { return this.currentSlogan || ''; },

    async applyLogic() {
        this.cleanup();

        if (!this.getSettings().enabled) return;

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        if (textarea.value.trim().length > 0) {
            return;
        }

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        let effectivePlaceholderText = '';

        if (mode === 'custom') {
            effectivePlaceholderText = settings.customPlaceholder.trim();
        } else if (mode === 'auto') {
            effectivePlaceholderText = this.getCurrentAutoSlogan();
        } else if (mode === 'worldbook') {
            effectivePlaceholderText = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
        }

        if (!effectivePlaceholderText) {
            textarea.placeholder = this.resolveFallbackPlaceholder(textarea);
            return;
        }

        this.handlePlaceholderDisplay(effectivePlaceholderText, textarea);
    },

    handlePlaceholderDisplay(placeholderText, textarea) {
        const contentEscaped = CSS.escape(placeholderText);

        const beforeRule = this.findPlaceholderBeforeRule();

        if (beforeRule) {
            this._modifiedRuleState.rule = beforeRule;
            this._modifiedRuleState.originalContent = beforeRule.style.getPropertyValue('content');

            beforeRule.style.setProperty('content', `"${contentEscaped}"`, 'important');

            textarea.placeholder = ' ';
        } else {
            textarea.placeholder = placeholderText;
        }
    },

    findPlaceholderBeforeRule() {
        const selectorFragment = 'send_textarea:placeholder-shown)::before';
        for (const sheet of document.styleSheets) {
            try {
                if (!sheet.cssRules) continue;
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && rule.selectorText.includes(selectorFragment)) {
                        if (rule.style.getPropertyValue('content').trim() !== '') {
                            return rule;
                        }
                    }
                }
            } catch (e) {
                continue;
            }
        }
        return null;
    },

    async onCharacterSwitch() {
        if (this.isSwitchingCharacter) return;
        this.isSwitchingCharacter = true;
        try {
            this.currentSlogan = null;
            await new Promise(r => setTimeout(r, 300));
            const settings = this.getSettings();
            if (settings.placeholderSource === 'worldbook') await this.loadWorldBookContentToPanel();
            if (settings.placeholderSource === 'auto') await this.tryExtractSloganFromLatestMessage();
            await this.applyLogic();
        } finally { this.isSwitchingCharacter = false; }
    },
    async tryExtractSloganFromLatestMessage() {
        try {
            const messages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            for (let i = messages.length - 1; i >= 0; i--) {
                const sloganEl = messages[i].querySelector('.mes_text div[hidden]');
                if (sloganEl) {
                    const slogan = sloganEl.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) { this.setAutoSlogan(slogan); return; }
                }
            }
        } catch (error) { console.error('[Placeholder] 检测最新消息时出错:', error); }
    },
    renderSettingsHtml() {
        const s = this.getSettings();
        return `
            <div id="placeholder_options_wrapper"><h3 class="sub-header">输入框文字替换</h3><p class="sub-label">选择提示来源，对应配置项会动态显示。</p>
                <div class="form-group placeholder-radio-group">
                    <label><input type="radio" name="placeholder_source_radio" value="custom" ${s.placeholderSource === 'custom' ? 'checked' : ''}><span>自定义</span></label>
                    <label><input type="radio" name="placeholder_source_radio" value="auto" ${s.placeholderSource === 'auto' ? 'checked' : ''}><span>AI摘录</span></label>
                    <label><input type="radio" name="placeholder_source_radio" value="worldbook" ${s.placeholderSource === 'worldbook' ? 'checked' : ''}><span>世界书</span></label>
                </div>
                <div id="placeholder_panel_custom" class="placeholder-panel" style="${s.placeholderSource === 'custom' ? '' : 'display: none;'}"><input type="text" id="custom_placeholder_input" class="text_pole" placeholder="输入自定义全局提示..." value="${s.customPlaceholder}"></div>
                <div id="placeholder_panel_auto" class="placeholder-panel" style="${s.placeholderSource === 'auto' ? '' : 'display: none;'}"><p class="sub-label">注入的提示词（别忘记限制回复字数）：</p><textarea id="slogan_prompt_input" class="text_pole" rows="4">${s.sloganPrompt}</textarea></div>
                <div id="placeholder_panel_worldbook" class="placeholder-panel" style="${s.placeholderSource === 'worldbook' ? '' : 'display: none;'}"><p class="sub-label">当前角色世界书中的“输入框”条目：</p><textarea id="worldbook_placeholder_input" class="text_pole" rows="3" placeholder="正在从世界书加载..."></textarea></div>
            <hr></div>`;
    },
    bindSettingsEvents() {
        $(document).on('change', 'input[name="placeholder_source_radio"]', e => {
            const selected = $(e.currentTarget).val();
            this.getSettings().placeholderSource = selected;
            script.saveSettingsDebounced();
            $('.placeholder-panel').hide();
            $(`#placeholder_panel_${selected}`).show();
            if (selected === 'worldbook') this.loadWorldBookContentToPanel();
            this.applyLogic();
        });
        $(document).on('input', '#custom_placeholder_input', e => {
            this.getSettings().customPlaceholder = $(e.currentTarget).val();
            script.saveSettingsDebounced();
            this.applyLogic();
        });
        $(document).on('input', '#slogan_prompt_input', e => {
            this.getSettings().sloganPrompt = $(e.currentTarget).val();
            script.saveSettingsDebounced();
        });
        $(document).on('input', '#worldbook_placeholder_input', e => {
            const content = $(e.currentTarget).val();
            clearTimeout(this.worldbookUpdateDebounce);
            this.worldbookUpdateDebounce = setTimeout(() => {
                this.updateWorldBookFromPanel(content).then(() => { if (this.getSettings().placeholderSource === 'worldbook') this.applyLogic(); });
            }, 500);
        });
        $(document).on('input', `#${this.TEXTAREA_ID}`, e => {
            if ($(e.currentTarget).val().trim().length > 0) {
                this.cleanup();
            } else {
                this.applyLogic();
            }
        });
    },
    async loadWorldBookContentToPanel() {
        const textarea = $('#worldbook_placeholder_input');
        if (!textarea.length) return;
        textarea.val('').attr('placeholder', '正在读取世界书...');
        try {
            const content = await this.applyWorldBookLogic(document.getElementById(this.TEXTAREA_ID), { setPlaceholder: false });
            if (content && content !== this.resolveFallbackPlaceholder(document.getElementById(this.TEXTAREA_ID))) {
                textarea.val(content).attr('placeholder', '修改此处可同步更新世界书条目...');
            } else { textarea.val('').attr('placeholder', '未找到“输入框”条目，输入内容可创建。'); }
        } catch (error) { textarea.attr('placeholder', '加载失败，请检查控制台。'); }
    },
    async updateWorldBookFromPanel(content) {
        if (!this.iframeWindow) return;
        try {
            const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
            if (!lorebookName) return;
            await this.iframeWindow.updateLorebookEntriesWith(lorebookName, entries => {
                let found = false;
                const updated = entries.map(entry => {
                    if (entry.comment === '输入框') { found = true; return { ...entry, content: content }; } return entry;
                });
                if (!found && content.trim()) updated.push({ key: ['输入框'], comment: '输入框', content: content, enabled: false, insertionorder: 100, selective: false, secondarykeys: [], constant: false, position: 'before_char' });
                return updated.filter(entry => !(entry.comment === '输入框' && !content.trim()));
            });
        } catch (error) { console.error('[Placeholder] 更新世界书时发生错误:', error); }
    },
    resolveFallbackPlaceholder(textarea) { return textarea?.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助'; },
    async applyWorldBookLogic(textarea, { setPlaceholder = true } = {}) {
        let finalPlaceholder = this.resolveFallbackPlaceholder(textarea);
        try {
            if (this.iframeWindow?.getCurrentCharPrimaryLorebook) {
                const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
                if (lorebookName) {
                    const entries = await this.iframeWindow.getLorebookEntries(lorebookName);
                    const targetEntry = entries.find(e => e.comment === '输入框');
                    if (targetEntry?.content.trim()) finalPlaceholder = targetEntry.content;
                }
            }
        } catch (error) { console.error('[模块-输入框] 读取世界书时出错:', error); }
        if (setPlaceholder && textarea) textarea.placeholder = finalPlaceholder;
        return finalPlaceholder;
    },
    waitForIframe() {
        return new Promise(resolve => {
            const check = () => {
                const iframe = document.querySelector('iframe');
                if (iframe?.contentWindow) { this.iframeWindow = iframe.contentWindow; resolve(); }
                else { setTimeout(check, 100); }
            };
            check();
        });
    },
};

// ###################################################################
//
//  模块 2-1: 标语注入 (Slogan Injection)
//
// ###################################################################
const SloganInjectionModule = {
    initialized: false,
    PROMPT_PREFIX: '请在每次正文的末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋内容</div>`。',
    extractionDebounceTimer: null,
    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;
        const ev = script.event_types;
        script.eventSource.on(ev.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(ev.CHARACTER_MESSAGE_RENDERED, this.onMessageEvent.bind(this));
        script.eventSource.on(ev.MESSAGE_SWIPED, this.onMessageEvent.bind(this));
        script.eventSource.on(ev.MESSAGE_DELETED, this.onMessageEvent.bind(this));
        this.initialized = true;
        console.log('[Slogan] 模块初始化完成。');
    },
    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;
        const ps = PlaceholderModule.getSettings();
        if (!ps.enabled || ps.placeholderSource !== 'auto') return;
        eventData.chat.push({ role: 'system', content: `${this.PROMPT_PREFIX}\n${ps.sloganPrompt || ''}` });
    },
    onMessageEvent() {
        clearTimeout(this.extractionDebounceTimer);
        this.extractionDebounceTimer = setTimeout(() => this.extractSlogan(), 500);
    },
    extractSlogan() {
        PlaceholderModule.setAutoSlogan(this.extractSloganFromLatestAIMessage());
    },
    extractSloganFromLatestAIMessage() {
        try {
            const messages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            for (let i = messages.length - 1; i >= 0; i--) {
                const sloganEl = messages[i].querySelector('.mes_text div[hidden]');
                if (sloganEl) {
                    const slogan = sloganEl.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) return slogan;
                }
            }
        } catch (error) { console.error('[Slogan] DOM查询失败:', error); }
        return null;
    },
};

// ###################################################################
//
//  模块 3: 全局字体管理
//
// ###################################################################
const GlobalFontModule = {
    name: 'global_font',
    STYLE_ID: 'global_font_style_tag',
    FAUX_BOLD_STYLE_ID: 'faux_bold_style_tag',
    docContext: null,
    pendingFileData: null,
    _cssNameUpdateTimeout: null,

    defaultSettings: Object.freeze({
        enabled: false,
        storedFonts: [],
        activeFontId: 'default',
        fauxBold: {
            enabled: false,
            width: 0.0,
        },
    }),

    getActiveFontName() {
        const settings = this.getSettings();
        if (!settings.enabled || settings.activeFontId === 'default') return null;
        const activeFont = settings.storedFonts.find(f => f.id === settings.activeFontId);
        return activeFont ? this.extractFontName(activeFont.rules) : null;
    },

    init() {
        try {
            this.docContext = (window.parent && window.parent.document !== document) ? window.parent.document : document;
        } catch (e) {
            this.docContext = document;
        }
        this.applyAllStyles();
        console.log('[模块-全局字体] 初始化成功。');
    },

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = JSON.parse(JSON.stringify(this.defaultSettings));
        }
        const settings = extension_settings[this.name];
        if (settings.fauxBold === undefined) {
            settings.fauxBold = { ...this.defaultSettings.fauxBold };
        }
        return settings;
    },

    saveSettings(rerender = false) {
        script.saveSettingsDebounced();
        this.applyAllStyles();
        if (rerender) {
            const panel = $('#global_font_settings_panel');
            if (panel.is(':visible')) {
                panel.html(this.renderSettingsHtml());
            }
        }
    },

    applyAllStyles() {
        if (!this.docContext) this.init();

        const settings = this.getSettings();

        if (!settings.enabled) {
            this.cleanup();
            return;
        }

        const fontName = this.getActiveFontName();
        if (fontName) {
            this.applyFontStyles(fontName);
            if (typeof FontObserverModule !== 'undefined') FontObserverModule.start();
        } else {
            const fontStyleEl = this.docContext.getElementById(this.STYLE_ID);
            if (fontStyleEl) fontStyleEl.textContent = '';
            this.docContext.documentElement.style.removeProperty('--mainFontFamily');
            this.docContext.documentElement.style.removeProperty('--monoFontFamily');
            if (typeof FontObserverModule !== 'undefined') FontObserverModule.stop();
        }

        this.applyFauxBoldStyles();
    },

    cleanup() {
        if (!this.docContext) return;

        const fontStyleEl = this.docContext.getElementById(this.STYLE_ID);
        if (fontStyleEl) fontStyleEl.textContent = '';
        this.docContext.documentElement.style.removeProperty('--mainFontFamily');
        this.docContext.documentElement.style.removeProperty('--monoFontFamily');

        const fauxBoldStyleEl = this.docContext.getElementById(this.FAUX_BOLD_STYLE_ID);
        if (fauxBoldStyleEl) fauxBoldStyleEl.remove();

        if (typeof FontObserverModule !== 'undefined') FontObserverModule.stop();

        console.log('[模块-全局字体] 已禁用并清理所有样式，恢复主题默认。');
    },

    applyFontStyles(fontName) {
        let styleEl = this.docContext.getElementById(this.STYLE_ID);
        if (!styleEl) {
            styleEl = this.docContext.createElement('style');
            styleEl.id = this.STYLE_ID;
            this.docContext.body.appendChild(styleEl);
        }
        const settings = this.getSettings();
        const activeFont = settings.storedFonts.find(f => f.id === settings.activeFontId);
        const baseRules = activeFont ? activeFont.rules : '';
        const sentinelRule = `.font-sentinel-target { font-family: "${fontName}" !important; }`;
        const overrideRule = `:root { --mainFontFamily: "${fontName}" !important; --monoFontFamily: "${fontName}" !important; } body, body *:not([class*="fa-"]):not([class*="icon"]):not([class*="material-symbols"]) { font-family: var(--mainFontFamily, "${fontName}") !important; }`;
        styleEl.textContent = `${baseRules}\n\n${overrideRule}\n\n${sentinelRule}`;
    },

    applyFauxBoldStyles() {
        if (!this.docContext) return;
        let styleEl = this.docContext.getElementById(this.FAUX_BOLD_STYLE_ID);
        const settings = this.getSettings();

        if (!settings.enabled || !settings.fauxBold?.enabled || !settings.fauxBold.width || settings.fauxBold.width == 0) {
            if (styleEl) styleEl.remove();
            return;
        }

        if (!styleEl) {
            styleEl = this.docContext.createElement('style');
            styleEl.id = this.FAUX_BOLD_STYLE_ID;
            this.docContext.body.appendChild(styleEl);
        }
        const width = settings.fauxBold.width;
        let styleRule = '';
        if (width > 0) {
            styleRule = `-webkit-text-stroke: ${width}px currentColor !important; text-shadow: none !important;`;
        } else if (width < 0) {
            const shadowWidth = Math.abs(width) * 0.7;
            styleRule = `-webkit-text-stroke: 0 !important; text-shadow: 0 0 ${shadowWidth}px var(--chat_bg, #333) !important;`;
        }
        styleEl.textContent = `body, body *:not([class*="fa-"]):not([class*="icon"]):not([class*="material-symbols"]) { ${styleRule} }`;
    },

    extractFontName(cssRules) {
        if (!cssRules) return null;
        let match = cssRules.match(/font-family:\s*["']?([^;"'!]+)/);
        return match && match[1] ? match[1].trim() : null;
    },

    renderSettingsHtml() {
        const s = this.getSettings();
        const fontOptions = s.storedFonts.map(font =>
            `<option value="${font.id}" ${s.activeFontId === font.id ? 'selected' : ''}>${this.extractFontName(font.rules) || '未知字体'}</option>`
        ).join('');

        return `
            <div id="global_font_options_wrapper">
                <h3 class="sub-header">全局字体管理</h3>
                <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                    <select id="global_font_select" class="text_pole" style="flex-grow: 1;">
                        <option value="default">-- 恢复主题默认字体 --</option>
                        ${fontOptions}
                    </select>
                    <button id="global_font_delete_btn" class="menu_button fa-solid fa-trash-can" title="删除当前选中的字体" style="flex-shrink: 0;"></button>
                </div>
                <div id="faux_bold_section"><hr><h4 class="sub-header" style="margin-top: 10px;">字体粗细 (全局生效)</h4><label class="checkbox_label"><input type="checkbox" id="faux_bold_toggle" ${s.fauxBold.enabled ? 'checked' : ''}><span>启用描边效果</span></label><div id="faux_bold_controls" class="form-group" style="padding-left: 5px; ${s.fauxBold.enabled ? '' : 'display: none;'}"><label for="faux_bold_input">描边量 (正/负):</label><input type="number" id="faux_bold_input" class="text_pole" value="${s.fauxBold.width.toFixed(1)}" step="0.1" placeholder="正值加粗，负值变细，例：0.4"></div></div>
                <div id="add_new_font_section" style="margin-top: 15px; border: 1px solid var(--border_color); padding: 10px; border-radius: 5px;">
                     <h4 class="sub-header" style="margin-top: 0;">添加新字体</h4>
                     <div class="form-group" style="border-bottom: 1px dashed var(--border_color); padding-bottom: 10px; margin-bottom: 10px;">
                        <label>选项A: 通过文件导入</label>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
                            <button id="font_file_trigger_btn" class="menu_button" style="width: auto; flex-grow: 0;">选择文件...</button>
                            <span id="font_file_display" style="font-style: italic; color: var(--text_color_acc); font-size: 0.9em;">未选择文件</span>
                        </div>
                        <input type="file" id="import_font_file_input" accept=".ttf,.otf,.woff,.woff2" style="display: none;">
                    </div>
                    <div class="form-group">
                        <label for="new_font_css_rules">选项B: 粘贴 CSS 规则</label>
                        <textarea id="new_font_css_rules" class="text_pole" rows="4" placeholder="粘贴 @import 或 @font-face 规则..."></textarea>
                    </div>
                    <div class="form-group" style="margin-top: 10px;">
                        <label for="new_font_name_input">字体名称</label>
                        <input type="text" id="new_font_name_input" class="text_pole" placeholder="自动填充或手动输入...">
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px; margin-top: 10px;">
                        <button id="global_font_add_btn" class="menu_button" style="width: 100%;">添加到列表并应用</button>
                    </div>
                </div>
                <hr>
            </div>`;
    },

    bindSettingsEvents() {
        $(document).off('change.globalFont click.globalFont input.globalFont');

        $(document).on('change.globalFont', '#global_font_select', e => {
            const settings = this.getSettings();
            settings.activeFontId = $(e.currentTarget).val();
            this.saveSettings();
        });

        $(document).on('click.globalFont', '#global_font_delete_btn', () => {
            const settings = this.getSettings();
            const selectedId = $('#global_font_select').val();
            if (selectedId === 'default' || !selectedId) return alert("不能删除默认选项。");
            if (confirm(`确定要删除字体“${$('#global_font_select option:selected').text()}”吗？`)) {
                settings.storedFonts = settings.storedFonts.filter(font => font.id !== selectedId);
                if (settings.activeFontId === selectedId) settings.activeFontId = 'default';
                this.saveSettings(true);
            }
        });

        $(document).on('change.globalFont', '#faux_bold_toggle', e => {
            const settings = this.getSettings();
            settings.fauxBold.enabled = $(e.currentTarget).is(':checked');
            $('#faux_bold_controls').toggle(settings.fauxBold.enabled);
            this.saveSettings();
        });

        $(document).on('input.globalFont', '#faux_bold_input', e => {
            const settings = this.getSettings();
            const newWidth = parseFloat($(e.currentTarget).val());
            if (!isNaN(newWidth)) {
                settings.fauxBold.width = newWidth;
                this.saveSettings();
            }
        });

        $(document).on('click.globalFont', '#font_file_trigger_btn', () => $('#import_font_file_input').click());

        $(document).on('change.globalFont', '#import_font_file_input', e => {
            const file = e.target.files[0];
            if (!file) {
                this.pendingFileData = null;
                $('#font_file_display').text('未选择文件');
                return;
            }
            $('#new_font_css_rules').val('');
            $('#new_font_name_input').val('');
            $('#font_file_display').text(`已选择: ${file.name}`);
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                const fontFormatMap = { 'ttf': 'truetype', 'otf': 'opentype', 'woff': 'woff', 'woff2': 'woff2' };
                const extension = file.name.split('.').pop().toLowerCase();
                const format = fontFormatMap[extension] || '';
                const fontName = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;
                if (!format) {
                    alert('不支持的字体文件格式。');
                    this.pendingFileData = null;
                    $('#font_file_display').text('文件格式错误！');
                    $('#new_font_name_input').val('');
                    return;
                }
                $('#new_font_name_input').val(fontName);
                this.pendingFileData = { dataUrl, format };
            };
            reader.readAsDataURL(file);
            e.target.value = '';
        });

        $(document).on('input.globalFont', '#new_font_css_rules', e => {
            clearTimeout(this._cssNameUpdateTimeout);
            const cssText = $(e.currentTarget).val().trim();
            if (cssText) {
                this.pendingFileData = null;
                $('#font_file_display').text('未选择文件');
                $('#import_font_file_input').val('');
                this._cssNameUpdateTimeout = setTimeout(() => {
                    const extractedName = this.extractFontName(cssText);
                    if (extractedName) {
                        $('#new_font_name_input').val(extractedName);
                    }
                }, 300);
            }
        });

        $(document).on('click.globalFont', '#global_font_add_btn', () => {
            let rules = '';
            let name = $('#new_font_name_input').val().trim();
            const cssContent = $('#new_font_css_rules').val().trim();
            if (this.pendingFileData) {
                if (!name) { return alert('请为导入的字体文件提供一个名称。'); }
                const { dataUrl, format } = this.pendingFileData;
                rules = `@font-face {\n    font-family: "${name}";\n    src: url(${dataUrl}) format("${format}");\n}`;
            } else if (cssContent) {
                rules = cssContent;
                if (!name) {
                    const extractedName = this.extractFontName(rules);
                    if (extractedName) {
                        name = extractedName;
                    } else {
                        name = `CustomFont_${Date.now()}`;
                        alert(`未能从CSS中提取到字体名称，已自动命名为: "${name}"`);
                    }
                    $('#new_font_name_input').val(name);
                }
            } else {
                return alert('请选择一个文件，或粘贴有效的CSS规则。');
            }
            const newFont = { id: Date.now().toString(), name, rules };
            const settings = this.getSettings();
            if (settings.storedFonts.some(font => font.name === newFont.name)) {
                return alert(`名为 "${newFont.name}" 的字体已存在！`);
            }
            settings.storedFonts.push(newFont);
            settings.activeFontId = newFont.id;
            this.saveSettings(true);
            this.pendingFileData = null;
            $('#font_file_display').text('未选择文件');
            $('#new_font_css_rules').val('');
            $('#new_font_name_input').val('');
        });
    }
};

// ###################################################################
//
//  模块 3-1: 字体哨兵 (The Font Sentinel)
//
// ###################################################################
const FontObserverModule = {
    observer: null,
    docContext: null,
    isRunning: false,
    targets: [
        '#curEditTextarea',
        '.swal2-textarea',
        '.swal2-input',
        '#send_textarea',
        '.text_pole',
        'textarea'
    ],

    init(context) {
        this.docContext = context;
        console.log('[字体哨兵] 已初始化。');
    },

    start() {
        if (this.isRunning || !this.docContext) return;
        if (this.observer) this.observer.disconnect();

        this.observer = new MutationObserver(mutations => {
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) { 
                            this.checkAndApply(node);
                        }
                    });
                }
            }
        });

        this.observer.observe(this.docContext.body, { childList: true, subtree: true });
        this.isRunning = true;
        console.log('[字体哨兵] 开始监视。');
    },

    stop() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        this.isRunning = false;
        console.log('[字体哨兵] 已停止监视。');
    },

    checkAndApply(node) {
        if (node.matches(this.targets.join(','))) {
            node.classList.add('font-sentinel-target');
        }
        node.querySelectorAll(this.targets.join(',')).forEach(child => {
            child.classList.add('font-sentinel-target');
        });
    }
};

// ###################################################################
//
//  模块 4: 聊天截图 (Screenshot)
//
// ###################################################################
const ScreenshotModule = {
    name: 'screenshot',
    isSelectionModeActive: false,
    html2canvasLoaded: false,
    defaultSettings: Object.freeze({
        enabled: true,
        backgroundColor: '#1C2025',
        filename: 'SillyTavern-Chat-{timestamp}.png',
        stripButtons: true,
        quality: 0.5,
    }),

    init() {
        if (!this.getSettings().enabled) return;
        this.ensureHtml2Canvas()
            .then(() => {
                this.injectUI();
                this.startObserver();
                this.bindUIEvents();
                console.log('[模块-截图] 初始化成功。');
            })
            .catch(error => console.error('[模块-截图] 加载 html2canvas 失败:', error));
    },

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        return extension_settings[this.name];
    },

    saveSettings() {
        script.saveSettingsDebounced();
    },

    ensureHtml2Canvas() {
        if (this.html2canvasLoaded) return Promise.resolve();
        return new Promise((resolve, reject) => {
            if (typeof html2canvas !== 'undefined') {
                this.html2canvasLoaded = true;
                return resolve();
            }
            const scriptElement = document.createElement('script');
            scriptElement.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
            scriptElement.onload = () => {
                this.html2canvasLoaded = true;
                console.log('[模块-截图] html2canvas.js 加载成功。');
                resolve();
            };
            scriptElement.onerror = () => reject('无法从CDN加载html2canvas');
            document.head.appendChild(scriptElement);
        });
    },

    injectUI() {
        if ($('#dialogue_screenshot_mes').length) return;
        const screenshotDialogHtml = `
            <div id="dialogue_screenshot_mes">
                <div id="dialogue_screenshot_mes_ok" data-i18n="Screenshot" class="menu_button interactable" tabindex="0" role="button">截图</div>
                <div id="dialogue_screenshot_mes_cancel" data-i18n="Cancel" class="menu_button interactable" tabindex="0" role="button">取消</div>
            </div>
        `;
        $('#form_sheld').prepend(screenshotDialogHtml);
    },

    bindUIEvents() {
        $(document).off('click.screenshot');

        $(document).on('click.screenshot', '#dialogue_screenshot_mes_ok', () => this.captureScreenshot());
        $(document).on('click.screenshot', '#dialogue_screenshot_mes_cancel', () => this.exitSelectionMode());
        $(document).on('click.screenshot', '.mes_screenshot', (e) => {
            e.stopPropagation();
            const messageElement = $(e.currentTarget).closest('.mes');
            this.enterSelectionMode(messageElement[0]);
        });

        $(document).on('click.screenshot', '#chat .mes', (e) => {
            if ($('body').hasClass('deleting_messages_mode') || !this.isSelectionModeActive) {
                return;
            }
            if ($(e.target).is('.del_checkbox') || $(e.target).closest('.mes_buttons, .mes_edit_buttons, a, .mes_img, .swipe_left, .swipe_right').length) {
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            const checkbox = $(e.currentTarget).find('.del_checkbox');
            checkbox.prop('checked', !checkbox.prop('checked')).trigger('change');
        });
    },

    startObserver() {
        const chatNode = document.getElementById('chat');
        if (!chatNode) {
            setTimeout(() => this.startObserver(), 500); return;
        }
        const observer = new MutationObserver(mutations => {
            mutations.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && $(node).is('.mes')) { this.injectButton(node); }
                    });
                }
            });
        });
        observer.observe(chatNode, { childList: true });
        $('#chat .mes').each((_, el) => this.injectButton(el));
    },

    injectButton(messageElement) {
        if ($(messageElement).find('.mes_screenshot').length > 0) return;
        const buttonHtml = `<div title="截图" class="mes_button mes_screenshot fa-solid fa-camera interactable" data-i18n="[title]Screenshot" tabindex="0" role="button"></div>`;
        const container = $(messageElement).find('.extraMesButtons');
        if (container.length) { container.append(buttonHtml); }
    },

    enterSelectionMode(clickedMessage) {
        if ($('body').hasClass('deleting_messages_mode')) {
            toastr.info('请先退出消息删除模式，再使用截图功能。');
            return;
        }
        if (this.isSelectionModeActive) return;
        this.isSelectionModeActive = true;
        $('#send_form').hide();
        $('#dialogue_screenshot_mes').css('display', 'flex');
        $('body').addClass('screenshot-selection-active');
        $('#chat .mes .del_checkbox').css('display', 'grid');
        if (clickedMessage) { $(clickedMessage).find('.del_checkbox').prop('checked', true); }
        script.hideSwipeButtons();
    },

    exitSelectionMode() {
        if (!this.isSelectionModeActive) return;
        this.isSelectionModeActive = false;
        $('#dialogue_screenshot_mes').hide();
        $('#send_form').show();
        $('body').removeClass('screenshot-selection-active');
        if (!$('body').hasClass('deleting_messages_mode')) {
            $('#chat .mes .del_checkbox').css('display', 'none');
        }
        $('#chat .mes .del_checkbox').prop('checked', false);
        script.showSwipeButtons();
    },

    async captureScreenshot() {
        if (!this.html2canvasLoaded) {
            toastr.error("截图库尚未加载完成，请稍后再试。");
            return;
        }

        const okButton = $('#dialogue_screenshot_mes_ok');
        okButton.text('处理中...').removeClass('interactable');

        setTimeout(async () => {
            let captureContainer = null;
            try {
                const selectedMessages = $('#chat .mes:has(.del_checkbox:checked)').get();

                if (selectedMessages.length === 0) {
                    toastr.info("请至少选择一条消息进行截图。");
                    return;
                }

                captureContainer = document.createElement('div');
                captureContainer.id = 'screenshot-capture-container';
                document.body.appendChild(captureContainer);

                selectedMessages.forEach(msg => {
                    const clone = msg.cloneNode(true);
                    const $clone = $(clone);
                    $clone.addClass('screenshot-clone');

                    if (this.getSettings().stripButtons) {
                        $clone.find('.mes_buttons, .mes_edit_buttons, .swipe_left, .swipe_right, .swipes-counter, .del_checkbox, .for_checkbox, .mesIDDisplay, .tokenCounterDisplay').remove();
                    }
                    $clone.css('opacity', 1);
                    captureContainer.appendChild(clone);
                });

                const canvas = await html2canvas(captureContainer, {
                    backgroundColor: this.getSettings().backgroundColor,
                    scale: window.devicePixelRatio * this.getSettings().quality,
                    useCORS: true,
                    logging: false,
                    onclone: (clonedDoc) => {
                         $(clonedDoc).find('#screenshot-capture-container').css({
                            padding: '20px', display: 'inline-block', width: `${document.querySelector('#chat .mes').offsetWidth}px`
                         });
                         $(clonedDoc).find('.screenshot-clone').css('display', 'flex');
                    }
                });

                const link = document.createElement('a');
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                link.download = this.getSettings().filename.replace('{timestamp}', timestamp);
                link.href = canvas.toDataURL('image/png');
                link.click();

            } catch (error) {
                console.error('[模块-截图] 生成截图时出错:', error);
                toastr.error('截图失败，请检查控制台获取更多信息。');
            } finally {
                if (captureContainer) {
                    document.body.removeChild(captureContainer);
                }
                okButton.text('截图').addClass('interactable');
                this.exitSelectionMode();
            }
        }, 10);
    },

    renderSettingsHtml() {
        const s = this.getSettings();
        return `
            <div id="screenshot_options_wrapper">
                <h3 class="sub-header">聊天截图 (v${this.CURRENT_SCRIPT_VERSION})</h3>
                <div class="form-group"><label for="screenshot_bg_color">背景颜色:</label><input type="color" id="screenshot_bg_color" value="${s.backgroundColor}" style="width: 100%;"></div>
                <div class="form-group"><label for="screenshot_filename">文件名模板:</label><input type="text" id="screenshot_filename" class="text_pole" value="${s.filename}"></div>
                <div class="form-group"><label for="screenshot_quality">截图质量: <span id="screenshot_quality_value">${s.quality.toFixed(1)}</span></label><input type="range" id="screenshot_quality" min="0.1" max="1.0" step="0.1" value="${s.quality}" style="width: 100%;"></div>
                <label class="checkbox_label"><input type="checkbox" id="screenshot_strip_buttons" ${s.stripButtons ? 'checked' : ''}><span>截图时移除消息操作按钮、ID等元素</span></label>
                <hr>
            </div>`;
    },

    bindSettingsEvents() {
        const settings = this.getSettings();
        $(document).on('input', '#screenshot_bg_color', (e) => { settings.backgroundColor = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#screenshot_filename', (e) => { settings.filename = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#screenshot_quality', (e) => {
            const val = parseFloat($(e.currentTarget).val());
            settings.quality = val;
            $('#screenshot_quality_value').text(val.toFixed(1));
            this.saveSettings();
        });
        $(document).on('change', '#screenshot_strip_buttons', (e) => { settings.stripButtons = $(e.currentTarget).is(':checked'); this.saveSettings(); });
    },

    stop() {
        this.exitSelectionMode();
        $(document).off('click.screenshot');
        $('.mes_screenshot').remove();
        $('#dialogue_screenshot_mes').remove();
    }
};

// ###################################################################
//
//  主程序: 初始化与UI集成
//
// ###################################################################
function initializeCombinedExtension() {
    try {
        GlobalFontModule.init();
        FontObserverModule.init(GlobalFontModule.docContext);

        const combinedSettingsHtml = `
            <div id="misc_beautify_settings" class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header"><b>小美化集</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
                <div class="inline-drawer-content" style="display: none;">
                    <div class="version-row"><span class="version-indicator" id="model_display_version_indicator"></span></div>

                    <!-- 模型名称显示 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_model_display_toggle" ${ModelDisplayModule.getSettings().enabled ? 'checked' : ''}><span>模型名称显示</span></label>
                    <div id="model_display_settings_panel" class="sub-setting-container" style="${ModelDisplayModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle"><b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div></div>
                        <div class="sub-setting-content" style="display: none;">${ModelDisplayModule.renderSettingsHtml()}</div>
                    </div>

                    <!-- 输入框文字替换 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_placeholder_toggle" ${PlaceholderModule.getSettings().enabled ? 'checked' : ''}><span>输入框文字替换</span></label>
                    <div id="placeholder_settings_panel" class="sub-setting-container" style="${PlaceholderModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle"><b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div></div>
                        <div class="sub-setting-content" style="display: none;">${PlaceholderModule.renderSettingsHtml()}</div>
                    </div>

                    <!-- 全局字体替换 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_global_font_toggle" ${GlobalFontModule.getSettings().enabled ? 'checked' : ''}><span>全局字体替换</span></label>
                    <div id="global_font_settings_panel" class="sub-setting-container" style="${GlobalFontModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle"><b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div></div>
                        <div class="sub-setting-content" style="display: none;">${GlobalFontModule.renderSettingsHtml()}</div>
                    </div>

                    <!-- 聊天截图 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_screenshot_toggle" ${ScreenshotModule.getSettings().enabled ? 'checked' : ''}><span>聊天截图</span></label>
                    <div id="screenshot_settings_panel" class="sub-setting-container" style="${ScreenshotModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle"><b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div></div>
                        <div class="sub-setting-content" style="display: none;">${ScreenshotModule.renderSettingsHtml()}</div>
                    </div>

                </div>
            </div>
            <style>
                .version-row { display: flex; justify-content: flex-end; padding: 0 5px 5px; }
                .version-indicator { color: var(--text_color_acc); font-size: .8em; }
                #misc_beautify_settings h3.sub-header,
                #misc_beautify_settings h4.sub-header { font-size: 1em; margin-top: 15px; margin-bottom: 10px; }
                .placeholder-panel { margin-top: 10px; }
                .placeholder-radio-group { display: flex; border: 1px solid var(--border_color); border-radius: 5px; overflow: hidden; }
                .placeholder-radio-group label { flex: 1; text-align: center; padding: 5px 0; background-color: var(--background_bg); cursor: pointer; border-left: 1px solid var(--border_color); }
                .placeholder-radio-group label:first-child { border-left: none; }
                .placeholder-radio-group input[type=radio] { display: none; }
                .placeholder-radio-group input[type=radio]:checked + span { color: var(--primary_color); font-weight: 700; }
                .placeholder-radio-group label:hover { background-color: var(--background_layer_1); }
                .model-override-row { display: flex; align-items: center; }
                .model-override-row .text_pole { flex-grow: 1; }

                .sub-setting-container { margin-bottom: 10px; }
                .sub-setting-toggle { display: flex; justify-content: space-between; align-items: center; padding: 8px; background-color: var(--background_layer_1); border-radius: 5px; margin-top: 5px; cursor: pointer; border: 1px solid var(--border_color); transition: background-color 0.2s; }
                .sub-setting-toggle b { font-weight: normal; }
                .sub-setting-toggle:hover { background-color: var(--background_layer_2); }
                .sub-setting-icon { transition: transform 0.2s ease-in-out; }
                .sub-setting-icon.up { transform: rotate(180deg); }
                .sub-setting-content { padding: 15px 10px 10px 10px; border: 1px solid var(--border_color); border-top: none; border-radius: 0 0 5px 5px; background-color: var(--background_bg); }

                #dialogue_screenshot_mes {
                    display: none;
                    width: 100%;
                    justify-content: center;
                    align-items: center;
                    gap: 20px;
                    padding-bottom: 10px;
                }
                .screenshot-selection-active #chat.chat_message_wrapper { filter: brightness(0.7); transition: filter 0.2s; }
                .screenshot-selection-active .mes:not(:has(.del_checkbox:checked)) { opacity: 0.6; }
                .screenshot-selection-active .mes { transition: opacity 0.2s; }
                #screenshot-capture-container { position: absolute; top: -9999px; left: 0; z-index: -1; }
            </style>
        `;
        $('#extensions_settings').append(combinedSettingsHtml);

        $(document).on('change', '#misc_model_display_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            ModelDisplayModule.getSettings().enabled = en;
            $('#model_display_settings_panel').toggle(en);
            ModelDisplayModule.rerenderAllModelNames(!en);
            if (en) ModelDisplayModule.startObservers(); else ModelDisplayModule.stopObservers();
            script.saveSettingsDebounced();
        });

        $(document).on('change', '#misc_placeholder_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            PlaceholderModule.getSettings().enabled = en;
            $('#placeholder_settings_panel').toggle(en);
            if (en) PlaceholderModule.init(); else PlaceholderModule.cleanup();
            script.saveSettingsDebounced();
        });

        $(document).on('change', '#misc_global_font_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            GlobalFontModule.getSettings().enabled = en;
            $('#global_font_settings_panel').toggle(en);
            GlobalFontModule.saveSettings();
        });

        $(document).on('change', '#misc_screenshot_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            ScreenshotModule.getSettings().enabled = en;
            $('#screenshot_settings_panel').toggle(en);
            if (en) ScreenshotModule.init(); else ScreenshotModule.stop();
            script.saveSettingsDebounced();
        });

        $(document).on('click', '.sub-setting-toggle', function() {
            $(this).next('.sub-setting-content').slideToggle(200);
            $(this).find('.sub-setting-icon').toggleClass('up');
        });

        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();
        GlobalFontModule.bindSettingsEvents();
        ScreenshotModule.bindSettingsEvents();

        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();
        ScreenshotModule.init();

        if (GlobalFontModule.getSettings().enabled && GlobalFontModule.getActiveFontName()) {
            FontObserverModule.start();
        }

        console.log('[小美化集] 初始化完成。');
    } catch (e) {
        console.error('[小美化集] 初始化时发生致命错误:', e);
    }
}

$(document).ready(() => {
    setTimeout(() => {
        const interval = setInterval(() => {
            if ($('#extensions_settings').length && typeof script !== 'undefined') {
                clearInterval(interval);
                initializeCombinedExtension();
            }
        }, 500);
    }, 1000);
});