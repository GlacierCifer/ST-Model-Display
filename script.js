import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//
//  小杂物集 (Misc Utilities) v1.2.0 (按需修改版)
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
//  - 模块3: 标语注入 (Slogan Injection)
//
//  - 修改说明 (v1.2.0):
//    - [新增功能 @ 模块1] 新增“模型名称覆盖”功能，允许用户为特定模型设置自定义的显示名称。
//    - [UI/UX @ 模块1] 为“模型名称覆盖”功能增加了动态添加/删除规则的界面。
//    - [逻辑 @ 模块1] 更新了模型名称处理流程，优先应用自定义的覆盖规则。
//    - [修复 @ 模块1] 确保在设置更改后，所有消息的模型名称都能实时刷新。
//
// ===================================================================


// ###################################################################
//
//  模块 1: 模型名称显示 (Model Display)
//
// ###################################################################
const ModelDisplayModule = {
    // 1.0 模块内部状态和常量
    // ---------------------------------------------------------------
    name: 'model_display',
    CURRENT_SCRIPT_VERSION: '1.2.1', // 版本号更新
    SCRIPT_RAW_URL: 'https://cdn.jsdelivr.net/gh/GlacierCifer/ST-Model-Display@main/script.js',
    modelHistory: {},
    chatContentObserver: null,
    chatContainerObserver: null,
    processingMessages: new Set(),
    pendingProcessing: new Map(),

    // 1.1 默认设置
    // ---------------------------------------------------------------
    defaultSettings: Object.freeze({
        enabled: true,
        fontSize: '0.85em',
        prefix: '|',
        suffix: '|',
        modelNameOverrides: {}, // 模型名称覆盖规则
    }),

    // 1.2 模块初始化入口
    // ---------------------------------------------------------------
    init() {
        // 在初始化时，确保getSettings被调用以加载数据
        if (this.getSettings().enabled) {
            this.startObservers();
            this.restoreAllFromHistory();
        }
        this.checkForUpdates();
        console.log('[模块-模型显示] 初始化成功，持久化逻辑已修复。');
    },

    // 1.3 设置与界面
    // ---------------------------------------------------------------
    // [重大修改] 修复 getSettings，使其能够正确加载已保存的设置
    getSettings() {
        // 确保主设置对象存在
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];

        // 遍历默认设置，确保所有键都存在于当前设置中，实现向后兼容
        for (const key of Object.keys(this.defaultSettings)) {
            if (!Object.hasOwnProperty.call(settings, key)) {
                settings[key] = this.defaultSettings[key];
            }
        }

        // 这是关键：确保 modelNameOverrides 是一个有效的对象
        if (typeof settings.modelNameOverrides !== 'object' || settings.modelNameOverrides === null) {
            settings.modelNameOverrides = {};
        }

        return settings;
    },

    saveSettings() {
        script.saveSettingsDebounced();
        this.rerenderAllModelNames();
    },

    // [重大修改] 渲染设置界面的HTML，增加名称覆盖部分
    renderSettingsHtml() {
        const settings = this.getSettings();
        // 生成覆盖规则的HTML行
        const overridesHtml = Object.entries(settings.modelNameOverrides)
            .map(([original, custom], index) => this.renderOverrideRow(original, custom, index))
            .join('');

        return `
        <div id="model_display_options_wrapper">
            <hr>
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
            <div id="model_name_overrides_container">
                ${overridesHtml}
            </div>
            <button id="add_model_override_btn" class="menu_button fa-solid fa-plus" style="margin-top: 5px;"> </button>
        </div>`;
    },

    // [新增] 渲染单条覆盖规则的HTML
    renderOverrideRow(original, custom, index) {
        return `
        <div class="form-group model-override-row" data-index="${index}">
            <input type="text" class="text_pole original-name" placeholder="原始模型名称" value="${original}">
            <span style="margin: 0 5px;">→</span>
            <input type="text" class="text_pole custom-name" placeholder="自定义显示名称" value="${custom}">
            <button class="menu_button fa-solid fa-trash-can delete-override-btn" style="margin-left: 5px;"></button>
        </div>`;
    },

    // [重大修改] 绑定设置界面的事件，增加对新UI的事件处理
    bindSettingsEvents() {
        const settings = this.getSettings();
        // 基础设置
        $(document).on('input', '#model_display_font_size', (e) => { settings.fontSize = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_prefix', (e) => { settings.prefix = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_suffix', (e) => { settings.suffix = $(e.currentTarget).val(); this.saveSettings(); });

        // 添加新规则
        $(document).on('click', '#add_model_override_btn', () => {
            const newIndex = $('#model_name_overrides_container .model-override-row').length;
            $('#model_name_overrides_container').append(this.renderOverrideRow('', '', newIndex));
        });

        // 删除规则
        $(document).on('click', '.delete-override-btn', (e) => {
            $(e.currentTarget).closest('.model-override-row').remove();
            this.updateOverridesFromUI();
        });

        // 修改规则
        $(document).on('input', '.model-override-row .text_pole', () => {
            this.updateOverridesFromUI();
        });
    },

    // [新增] 从UI更新设置中的覆盖规则
    updateOverridesFromUI() {
        const newOverrides = {};
        $('.model-override-row').each(function() {
            const original = $(this).find('.original-name').val().trim();
            const custom = $(this).find('.custom-name').val().trim();
            if (original) { // 只有原始名称非空时才保存
                newOverrides[original] = custom;
            }
        });
        // 直接修改设置对象，然后调用保存
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
                icon.dataset.modelInjected = 'false'; // 标记为未注入，以便重新渲染
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
        if (Object.hasOwnProperty.call(overrides, originalModelName)) {
            return overrides[originalModelName] || originalModelName;
        }
        return originalModelName;
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
            } catch (e) {
                console.error("[模块-模型显示] 渲染SVG时出错:", e);
            }
        });
    },

    waitForElementAndProcess(messageElement, timeout = 8000) {
        if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;

        const messageId = this.getMessageId(messageElement);
        if (!messageId || messageId === '0' || messageId === '1') return;

        if (this.processingMessages.has(messageId)) return;
        this.processingMessages.add(messageId);

        const startTime = Date.now();
        let checkCount = 0;

        const checkIcon = () => {
            checkCount++;
            if (Date.now() - startTime > timeout) {
                this.processingMessages.delete(messageId);
                console.warn(`[模块-模型显示] 等待楼层 #${messageId} 的模型名称超时 (检查了 ${checkCount} 次)`);
                return;
            }

            const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
            if (!iconSvg) {
                setTimeout(checkIcon, 100);
                return;
            }

            const modelName = this.getCurrentModelName(messageElement);
            if (modelName) {
                this.processingMessages.delete(messageId);
                this.modelHistory[messageId] = modelName;
                this.processIcon(iconSvg, modelName);
            } else {
                const delay = Math.min(200 + (checkCount * 50), 1000);
                setTimeout(checkIcon, delay);
            }
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

        if (this.pendingProcessing.has(messageId)) {
            clearTimeout(this.pendingProcessing.get(messageId));
        }

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
                    } else {
                        this.processAndRecordMessage(message);
                    }
                }
            });
        }, 500);
    },

    startObservers() {
        this.stopObservers();
        const chatNode = document.getElementById('chat');
        if (chatNode) {
            this.chatContentObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        const addedMessages = Array.from(mutation.addedNodes)
                            .filter(node => node.nodeType === 1)
                            .flatMap(node => node.matches('.mes') ? [node] : Array.from(node.querySelectorAll('.mes')));

                        if (addedMessages.length > 0) {
                            requestAnimationFrame(() => {
                                addedMessages.forEach(message => this.processAndRecordMessage(message));
                            });
                        }
                    }
                }
            });
            this.chatContentObserver.observe(chatNode, { childList: true, subtree: false });
        }

        this.chatContainerObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && node.id === 'chat') {
                            this.restoreAllFromHistory();
                            this.startObservers();
                            break;
                        }
                    }
                }
            }
        });
        this.chatContainerObserver.observe(document.body, { childList: true, subtree: false });
    },

    stopObservers() {
        if (this.chatContentObserver) this.chatContentObserver.disconnect();
        if (this.chatContainerObserver) this.chatContainerObserver.disconnect();
        this.chatContentObserver = null;
        this.chatContainerObserver = null;

        for (const timeoutId of this.pendingProcessing.values()) {
            clearTimeout(timeoutId);
        }
        this.pendingProcessing.clear();
        this.processingMessages.clear();
    },

    async checkForUpdates() {
        const indicator = $('#model_display_version_indicator');
        if (!indicator.length) return;
        indicator.text(`v${this.CURRENT_SCRIPT_VERSION}`);
        indicator.off('click.update').css('cursor', 'default').attr('title', '这是一个修改版，无法自动检查更新。');
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
    placeholderObserver: null,
    TEXTAREA_ID: 'send_textarea',
    defaultSettings: Object.freeze({
        enabled: true,
        customPlaceholder: '',
        placeholderSource: 'custom',
        sloganPrompt: [
            '元素内仅包含当前角色极具个人风格的语录，格式模仿座右铭、网络用语、另类名言、爱语、吐槽等形式，具备黑色幽默感，最长 15 个汉字。',
            '标语不要重复，也不要额外解释。'
        ].join('\n'),
    }),
    currentSlogan: null,
    isSwitchingCharacter: false,
    worldbookUpdateDebounce: null,

    init() {
        if (!this.getSettings().enabled) {
            console.log('[模块-输入框] 已禁用，跳过初始化。');
            return;
        }
        this.waitForIframe().then(() => {
            if (script.eventSource && script.event_types) {
                script.eventSource.on(script.event_types.CHAT_CHANGED, this.onCharacterSwitch.bind(this));
            } else {
                console.error('[模块-输入框] 致命错误：无法访问 script.eventSource。');
            }
            this.applyLogic();
            console.log('[模块-输入框] 初始化成功。');
        });
    },

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];
        for (const key of Object.keys(this.defaultSettings)) {
            if (settings[key] === undefined) {
                settings[key] = this.defaultSettings[key];
            }
        }
        if (!['custom', 'auto', 'worldbook'].includes(settings.placeholderSource)) {
            settings.placeholderSource = this.defaultSettings.placeholderSource;
        }
        return settings;
    },

    setAutoSlogan(text) {
        if (!text) return;
        const slogan = text.trim();
        if (!slogan) return;

        console.log('[Placeholder] 设置标语:', slogan);
        this.currentSlogan = slogan;

        const settings = this.getSettings();
        if (settings.enabled && settings.placeholderSource === 'auto') {
            this.applyLogic();
        }
    },

    getCurrentAutoSlogan() {
        return this.currentSlogan || '';
    },

    async applyLogic() {
        if (!this.getSettings().enabled) return;
        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        const custom = settings.customPlaceholder.trim();
        const defaultText = this.resolveFallbackPlaceholder(textarea);

        this.stopPlaceholderObserver();

        if (mode === 'custom') {
            textarea.placeholder = custom || defaultText;
            if (custom) this.startPlaceholderObserver();
        } else if (mode === 'auto') {
            const slogan = this.getCurrentAutoSlogan();
            textarea.placeholder = slogan || defaultText;
        } else if (mode === 'worldbook') {
            await this.applyWorldBookModeWithFallback(textarea, defaultText);
        }
    },

    async applyWorldBookModeWithFallback(textarea, defaultText) {
        const worldbookText = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
        textarea.placeholder = (worldbookText && worldbookText !== defaultText) ? worldbookText : defaultText;
    },

    async onCharacterSwitch() {
        if (this.isSwitchingCharacter) return;
        this.isSwitchingCharacter = true;

        try {
            console.log('%c[模块-输入框] 角色切换开始...', 'color: cyan;');
            const textarea = document.getElementById(this.TEXTAREA_ID);
            if (textarea) {
                textarea.placeholder = this.resolveFallbackPlaceholder(textarea);
            }
            this.currentSlogan = null;

            await new Promise(resolve => setTimeout(resolve, 300));

            const settings = this.getSettings();
            if (settings.placeholderSource === 'worldbook') {
                await this.loadWorldBookContentToPanel();
            }
            if (settings.placeholderSource === 'auto') {
                await this.tryExtractSloganFromLatestMessage();
            }

            await this.applyLogic();
            console.log('%c[模块-输入框] 角色切换完成。', 'color: cyan;');

        } finally {
            this.isSwitchingCharacter = false;
        }
    },

    async tryExtractSloganFromLatestMessage() {
        try {
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            for (let i = aiMessages.length - 1; i >= 0; i--) {
                const sloganElement = aiMessages[i].querySelector('.mes_text div[hidden]');
                if (sloganElement) {
                    const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) {
                        this.setAutoSlogan(slogan);
                        return;
                    }
                }
            }
        } catch (error) {
            console.error('[Placeholder] 检测最新消息时出错:', error);
        }
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div id="placeholder_options_wrapper">
                <hr>
                <h3 class="sub-header">输入框文字替换</h3>
                <p class="sub-label">选择提示来源，对应配置项会动态显示。</p>

                <div class="form-group placeholder-radio-group">
                    <label><input type="radio" name="placeholder_source_radio" value="custom" ${settings.placeholderSource === 'custom' ? 'checked' : ''}><span>自定义</span></label>
                    <label><input type="radio" name="placeholder_source_radio" value="auto" ${settings.placeholderSource === 'auto' ? 'checked' : ''}><span>AI摘录</span></label>
                    <label><input type="radio" name="placeholder_source_radio" value="worldbook" ${settings.placeholderSource === 'worldbook' ? 'checked' : ''}><span>世界书</span></label>
                </div>

                <div id="placeholder_panel_custom" class="placeholder-panel" style="${settings.placeholderSource === 'custom' ? '' : 'display: none;'}">
                    <input type="text" id="custom_placeholder_input" class="text_pole" placeholder="输入自定义全局提示..." value="${settings.customPlaceholder}">
                </div>
                <div id="placeholder_panel_auto" class="placeholder-panel" style="${settings.placeholderSource === 'auto' ? '' : 'display: none;'}">
                    <p class="sub-label">注入的提示词（别忘记限制回复字数）：</p>
                    <textarea id="slogan_prompt_input" class="text_pole" rows="4">${settings.sloganPrompt}</textarea>
                </div>
                <div id="placeholder_panel_worldbook" class="placeholder-panel" style="${settings.placeholderSource === 'worldbook' ? '' : 'display: none;'}">
                    <p class="sub-label">当前角色世界书中的“输入框”条目：</p>
                    <textarea id="worldbook_placeholder_input" class="text_pole" rows="3" placeholder="正在从世界书加载..."></textarea>
                </div>
            </div>`;
    },

    bindSettingsEvents() {
        $(document).on('change', 'input[name="placeholder_source_radio"]', (event) => {
            const selected = $(event.currentTarget).val();
            const settings = this.getSettings();
            if (settings.placeholderSource === selected) return;

            settings.placeholderSource = selected;
            script.saveSettingsDebounced();

            $('.placeholder-panel').hide();
            $(`#placeholder_panel_${selected}`).show();

            if (selected === 'worldbook') {
                this.loadWorldBookContentToPanel();
            }
            this.applyLogic();
        });

        $(document).on('input', '#custom_placeholder_input', (e) => {
            this.getSettings().customPlaceholder = $(e.currentTarget).val();
            script.saveSettingsDebounced();
            this.applyLogic();
        });

        $(document).on('input', '#slogan_prompt_input', (e) => {
            this.getSettings().sloganPrompt = $(e.currentTarget).val();
            script.saveSettingsDebounced();
        });

        $(document).on('input', '#worldbook_placeholder_input', (e) => {
            const content = $(e.currentTarget).val();
            clearTimeout(this.worldbookUpdateDebounce);
            this.worldbookUpdateDebounce = setTimeout(() => {
                this.updateWorldBookFromPanel(content).then(() => {
                    if (this.getSettings().placeholderSource === 'worldbook') {
                        this.applyLogic();
                    }
                });
            }, 500);
        });
    },

    async loadWorldBookContentToPanel() {
        const textarea = $('#worldbook_placeholder_input');
        if (!textarea.length) return;

        textarea.val('').attr('placeholder', '正在读取世界书...');
        try {
            const content = await this.applyWorldBookLogic(null, { setPlaceholder: false });
            const defaultPlaceholder = this.resolveFallbackPlaceholder(document.getElementById(this.TEXTAREA_ID));

            if (content && content !== defaultPlaceholder) {
                textarea.val(content).attr('placeholder', '修改此处可同步更新世界书条目...');
            } else {
                 textarea.val('').attr('placeholder', '未找到“输入框”条目，输入内容可创建。');
            }
        } catch (error) {
            console.error('[Placeholder] 加载世界书内容到面板时出错:', error);
            textarea.attr('placeholder', '加载失败，请检查控制台。');
        }
    },

    async updateWorldBookFromPanel(content) {
        if (!this.iframeWindow) return;
        try {
            const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
            if (!lorebookName) return;

            await this.iframeWindow.updateLorebookEntriesWith(lorebookName, (entries) => {
                let found = false;
                const updatedEntries = entries.map(entry => {
                    if (entry.comment === '输入框') {
                        found = true;
                        return { ...entry, content: content };
                    }
                    return entry;
                });
                if (!found && content.trim()) {
                    updatedEntries.push({ key: ['输入框'], comment: '输入框', content: content, enabled: false, insertionorder: 100, selective: false, secondarykeys: [], constant: false, position: 'before_char' });
                }
                return updatedEntries.filter(entry => !(entry.comment === '输入框' && !content.trim()));
            });
            console.log('[Placeholder] 世界书条目已更新/创建/删除。');
        } catch (error) {
            console.error('[Placeholder] 更新世界书时发生错误:', error);
        }
    },

    resolveFallbackPlaceholder(textarea) {
        return textarea?.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助';
    },

    startPlaceholderObserver() {
        const textarea = document.getElementById(this.TEXTAREA_ID);
        const settings = this.getSettings();
        const expected = settings.customPlaceholder.trim();
        if (!textarea || settings.placeholderSource !== 'custom' || !expected) return;

        this.stopPlaceholderObserver();
        this.placeholderObserver = new MutationObserver((mutationsList) => {
            if (textarea.placeholder !== expected) {
                textarea.placeholder = expected;
            }
        });
        this.placeholderObserver.observe(textarea, { attributes: true, attributeFilter: ['placeholder'] });
    },

    stopPlaceholderObserver() {
        if (this.placeholderObserver) this.placeholderObserver.disconnect();
        this.placeholderObserver = null;
    },

    async applyWorldBookLogic(textarea, { setPlaceholder = true } = {}) {
        let finalPlaceholder = this.resolveFallbackPlaceholder(textarea);
        try {
            if (this.iframeWindow?.getCurrentCharPrimaryLorebook) {
                const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
                if (lorebookName) {
                    const entries = await this.iframeWindow.getLorebookEntries(lorebookName);
                    const targetEntry = entries.find(entry => entry.comment === '输入框');
                    if (targetEntry?.content.trim()) {
                        finalPlaceholder = targetEntry.content;
                    }
                }
            }
        } catch (error) { console.error('[模块-输入框] 读取世界书时出错:', error); }

        if (setPlaceholder && textarea) {
            textarea.placeholder = finalPlaceholder;
        }
        return finalPlaceholder;
    },

    waitForIframe() {
        return new Promise(resolve => {
            const check = () => {
                const iframe = document.querySelector('iframe');
                if (iframe?.contentWindow) {
                    this.iframeWindow = iframe.contentWindow;
                    resolve();
                } else {
                    setTimeout(check, 100);
                }
            };
            check();
        });
    },
};

// ###################################################################
//
//  模块 3: 标语注入 (Slogan Injection)
//
// ###################################################################
const SloganInjectionModule = {
    initialized: false,
    PROMPT_PREFIX: '请在每次正文的末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋内容</div>`。',
    extractionDebounceTimer: null,

    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;
        const events = script.event_types;
        script.eventSource.on(events.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(events.CHARACTER_MESSAGE_RENDERED, this.onMessageEvent.bind(this));
        script.eventSource.on(events.MESSAGE_SWIPED, this.onMessageEvent.bind(this));
        script.eventSource.on(events.MESSAGE_DELETED, this.onMessageEvent.bind(this));
        this.initialized = true;
        console.log('[Slogan] 模块初始化完成。');
    },

    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;
        const placeholderSettings = PlaceholderModule.getSettings();
        if (!placeholderSettings.enabled || placeholderSettings.placeholderSource !== 'auto') return;

        const userPrompt = placeholderSettings.sloganPrompt || '';
        const finalPrompt = `${this.PROMPT_PREFIX}\n${userPrompt}`;
        eventData.chat.push({ role: 'system', content: finalPrompt });
    },

    onMessageEvent() {
        clearTimeout(this.extractionDebounceTimer);
        this.extractionDebounceTimer = setTimeout(() => this.extractSlogan(), 500);
    },

    extractSlogan() {
        const slogan = this.extractSloganFromLatestAIMessage();
        PlaceholderModule.setAutoSlogan(slogan); // 无论是否找到都调用，传入null可清除旧标语
    },

    extractSloganFromLatestAIMessage() {
        try {
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            for (let i = aiMessages.length - 1; i >= 0; i--) {
                const sloganElement = aiMessages[i].querySelector('.mes_text div[hidden]');
                if (sloganElement) {
                    const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) return slogan;
                }
            }
        } catch (error) { console.error('[Slogan] DOM查询失败:', error); }
        return null;
    },
};

// ###################################################################
//
//  主程序: 初始化与UI集成
//
// ###################################################################

function initializeCombinedExtension() {
    try {
        const combinedSettingsHtml = `
            <div id="misc_beautify_settings" class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>小美化集</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none;">
                    <div class="version-row">
                        <span class="version-indicator" id="model_display_version_indicator"></span>
                    </div>
                    <label class="checkbox_label">
                        <input type="checkbox" id="misc_model_display_toggle" ${ModelDisplayModule.getSettings().enabled ? 'checked' : ''}>
                        <span>模型名称显示</span>
                    </label>
                    <label class="checkbox_label">
                        <input type="checkbox" id="misc_placeholder_toggle" ${PlaceholderModule.getSettings().enabled ? 'checked' : ''}>
                        <span>输入框文字替换</span>
                    </label>
                    <div id="model_display_settings_panel" style="${ModelDisplayModule.getSettings().enabled ? '' : 'display: none;'}">
                        ${ModelDisplayModule.renderSettingsHtml()}
                    </div>
                    <div id="placeholder_settings_panel" style="${PlaceholderModule.getSettings().enabled ? '' : 'display: none;'}">
                        ${PlaceholderModule.renderSettingsHtml()}
                    </div>
                </div>
            </div>
            <style>
                .version-row { display: flex; justify-content: flex-end; padding: 0 5px 5px; }
                .version-indicator { color: var(--text_color_acc); font-size: 0.8em; }
                #misc_beautify_settings h3.sub-header, #misc_beautify_settings h4.sub-header { font-size: 1em; margin-top: 15px; margin-bottom: 10px; }
                .placeholder-panel { margin-top: 10px; }
                .placeholder-radio-group { display: flex; border: 1px solid var(--border_color); border-radius: 5px; overflow: hidden; }
                .placeholder-radio-group label { flex: 1; text-align: center; padding: 5px 0; background-color: var(--background_bg); cursor: pointer; border-left: 1px solid var(--border_color); }
                .placeholder-radio-group label:first-child { border-left: none; }
                .placeholder-radio-group input[type="radio"] { display: none; }
                .placeholder-radio-group input[type="radio"]:checked + span { color: var(--primary_color); font-weight: bold; }
                .placeholder-radio-group label:hover { background-color: var(--background_layer_1); }
                .model-override-row { display: flex; align-items: center; }
                .model-override-row .text_pole { flex-grow: 1; }
            </style>
        `;

        $('#extensions_settings').append(combinedSettingsHtml);

        $(document).on('change', '#misc_model_display_toggle', (event) => {
            const isEnabled = $(event.currentTarget).is(':checked');
            ModelDisplayModule.getSettings().enabled = isEnabled;
            $('#model_display_settings_panel').toggle(isEnabled);
            if (isEnabled) ModelDisplayModule.startObservers(); else ModelDisplayModule.stopObservers();
            ModelDisplayModule.rerenderAllModelNames(!isEnabled); // 必须在开关状态改变后调用
            script.saveSettingsDebounced();
        });

        $(document).on('change', '#misc_placeholder_toggle', (event) => {
            const isEnabled = $(event.currentTarget).is(':checked');
            PlaceholderModule.getSettings().enabled = isEnabled;
            $('#placeholder_settings_panel').toggle(isEnabled);
            script.saveSettingsDebounced();
            if (isEnabled) {
                PlaceholderModule.init();
            } else {
                const textarea = document.getElementById(PlaceholderModule.TEXTAREA_ID);
                if (textarea) textarea.placeholder = PlaceholderModule.resolveFallbackPlaceholder(textarea);
                PlaceholderModule.stopPlaceholderObserver();
            }
        });

        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();

        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();

        if (PlaceholderModule.getSettings().enabled && PlaceholderModule.getSettings().placeholderSource === 'worldbook') {
            PlaceholderModule.waitForIframe().then(() => {
                PlaceholderModule.loadWorldBookContentToPanel();
            });
        }

        console.log('[小美化集] 所有模块均已加载。');
    } catch (e) {
        console.error('[小美化集] 初始化过程中发生致命错误:', e);
    }
}

// 主入口
$(document).ready(() => {
    const settingsCheckInterval = setInterval(() => {
        if ($('#extensions_settings').length) {
            clearInterval(settingsCheckInterval);
            initializeCombinedExtension();
        }
    }, 500);
});
