import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//
//  小杂物集 (Misc Utilities) v1.0.2-modified
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
//
//  - 修改说明: 移除了模型名称显示功能中的字体自定义相关功能及UI。
//
// ===================================================================

// ###################################################################
//
//  模块 1: 模型名称显示 (Model Display) - [已简化]
//
// ###################################################################
const ModelDisplayModule = {
    // 1.0 模块内部状态和常量
    // ---------------------------------------------------------------
    name: 'model_display',
    CURRENT_SCRIPT_VERSION: '1.0.2-modified',
    SCRIPT_RAW_URL: 'https://cdn.jsdelivr.net/gh/GlacierCifer/ST-Model-Display@main/script.js',
    modelHistory: {},
    chatContentObserver: null,
    chatContainerObserver: null,

    // 1.1 默认设置 (已简化)
    // ---------------------------------------------------------------
    defaultSettings: Object.freeze({
        enabled: true,
        fontSize: '0.85em',
        prefix: '|',
        suffix: '|',
    }),

    // 1.2 模块初始化入口
    // ---------------------------------------------------------------
    init() {

        if (this.getSettings().enabled) {
            this.startObservers();
            this.restoreAllFromHistory();
        }
        this.checkForUpdates();
        console.log('[模块-模型显示] 初始化成功。');
    },

    // 1.3 设置与界面
    // ---------------------------------------------------------------
    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }

        for (const key of Object.keys(this.defaultSettings)) {
            if (!Object.hasOwnProperty.call(extension_settings[this.name], key)) {
                extension_settings[this.name][key] = this.defaultSettings[key];
            }
        }
        return extension_settings[this.name];
    },

    saveSettings() {
        script.saveSettingsDebounced();
        this.rerenderAllModelNames();
    },

renderSettingsHtml() {
    const settings = this.getSettings();
    return `
        <div id="model_display_options_wrapper">
            <hr>
            <h3 class="sub-header">模型名称显示</h3>

            <div class="form-group">
                <label for="model_display_font_size">字体大小:</label>
                <div>
                    <input type="text" id="model_display_font_size" class="text_pole"
                           placeholder="例如: 0.85em" value="${settings.fontSize}">
                </div>
            </div>

            <div class="form-group">
                <label for="model_display_prefix">前缀:</label>
                <div>
                    <input type="text" id="model_display_prefix" class="text_pole"
                           placeholder="输入前缀..." value="${settings.prefix}">
                </div>
            </div>

            <div class="form-group">
                <label for="model_display_suffix">后缀:</label>
                <div>
                    <input type="text" id="model_display_suffix" class="text_pole"
                           placeholder="输入后缀..." value="${settings.suffix}">
                </div>
            </div>
        </div>`;
},

    bindSettingsEvents() {
        $(document).on('input', '#model_display_font_size', (e) => { this.getSettings().fontSize = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_prefix', (e) => { this.getSettings().prefix = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_suffix', (e) => { this.getSettings().suffix = $(e.currentTarget).val(); this.saveSettings(); });
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
            const found = root.querySelector(selector); if (found) return found;
            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) {
                    const foundInShadow = this.deepQuerySelector(selector, element.shadowRoot);
                    if (foundInShadow) return foundInShadow;
                }
            }
        } catch (e) {}
        return null;
    },

    getCurrentModelName(messageElement) {
        const svgTitle = this.deepQuerySelector('.timestamp-icon title', messageElement);
        if (svgTitle && svgTitle.textContent.includes(' - ')) return svgTitle.textContent.split(' - ')[1];
        return null;
    },

    processIcon(iconSvg, modelName) {
        if (iconSvg.dataset.modelInjected === 'true') return;
        const settings = this.getSettings();
        const fullText = `${settings.prefix}${modelName}${settings.suffix}`;
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
                iconSvg.style.width = textWidth + 'px';
                iconSvg.style.height = originalHeight + 'px';
                iconSvg.setAttribute('viewBox', `0 0 ${textWidth} ${originalHeight}`);
                iconSvg.dataset.modelInjected = 'true';
            } catch (e) { console.error("[模块-模型显示] 渲染SVG时出错:", e); }
        });
    },

    waitForElementAndProcess(messageElement, timeout = 5000) {
        if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;
        const startTime = Date.now();
        const intervalId = setInterval(() => {
            if (Date.now() - startTime > timeout) {
                clearInterval(intervalId);
                const finalIdElement = messageElement.querySelector('.mesIDDisplay');
                if (finalIdElement) {
                    const messageId = finalIdElement.textContent.replace('#', '');
                    if (messageId !== '0' && messageId !== '1') {
                         console.warn(`[模块-模型显示] 等待楼层 #${messageId} 的元素或模型名称超时。`);
                    }
                }
                return;
            }
            const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
            const idElement = messageElement.querySelector('.mesIDDisplay');
            if (!iconSvg || !idElement) { return; }

            const messageId = idElement.textContent.replace('#', '');
            if (messageId === '0' || messageId === '1') {
                clearInterval(intervalId);
                return;
            }

            const modelName = this.getCurrentModelName(messageElement);
            if (modelName && messageId) {
                clearInterval(intervalId);
                this.modelHistory[messageId] = modelName;
                this.processIcon(iconSvg, modelName);
            }
        }, 200);
    },

    processAndRecordMessage(messageElement) {
        this.waitForElementAndProcess(messageElement);
    },

    restoreAllFromHistory() {
        if (!this.getSettings().enabled) return;
        setTimeout(() => {
            document.querySelectorAll('#chat .mes:not([is_user="true"])').forEach(message => {
                const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', message);
                const idElement = message.querySelector('.mesIDDisplay');
                if (iconSvg && idElement && iconSvg.dataset.modelInjected !== 'true') {
                    const messageId = idElement.textContent.replace('#', '');
                    if (this.modelHistory[messageId]) {
                        this.processIcon(iconSvg, this.modelHistory[messageId]);
                    } else {
                        this.waitForElementAndProcess(message);
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
                mutationsList.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if (node.matches('.mes')) { this.processAndRecordMessage(node); }
                                else if (node.querySelector) { node.querySelectorAll('.mes').forEach(mes => this.processAndRecordMessage(mes)); }
                            }
                        });
                    }
                });
            });
            this.chatContentObserver.observe(chatNode, { childList: true, subtree: true });
        }
        this.chatContainerObserver = new MutationObserver((mutationsList) => {
            mutationsList.forEach(mutation => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1 && node.id === 'chat') {
                            this.restoreAllFromHistory();
                            this.startObservers();
                        }
                    });
                }
            });
        });
        this.chatContainerObserver.observe(document.body, { childList: true });
    },

    stopObservers() {
        if (this.chatContentObserver) { this.chatContentObserver.disconnect(); this.chatContentObserver = null; }
        if (this.chatContainerObserver) { this.chatContainerObserver.disconnect(); this.chatContainerObserver = null; }
    },

    async checkForUpdates() {
        const indicator = $('#model_display_version_indicator');
        if (!indicator.length) return;

        indicator.text(`v${this.CURRENT_SCRIPT_VERSION}`);
        indicator.off('click.update').css('cursor', 'default').attr('title', '这是一个修改版，无法自动检查更新。');
    },
};

// ###################################################################
//
//  模块 2: 输入框美化模块 (Placeholder Beautifier) - V2
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
        placeholderSource: 'custom', // 'custom' | 'worldbook' | 'auto'
    }),

    autoSlogan: '',

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
            this.startPlaceholderObserver();
            this.applyLogic();
            console.log('[模块-输入框] 初始化成功。');
        });
    },

    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];
        if (settings.customPlaceholder === undefined) settings.customPlaceholder = this.defaultSettings.customPlaceholder;
        if (!['custom', 'worldbook', 'auto'].includes(settings.placeholderSource)) {
            settings.placeholderSource = this.defaultSettings.placeholderSource;
        }
        return settings;
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div id="placeholder_options_wrapper">
                <hr>
                <h3 class="sub-header">输入框文字替换</h3>
                <div class="form-group">
                    <p class="sub-label">选择使用的提示来源；自定义项留空则回退到其他模式默认提示。</p>
                    <div class="form-group">
                        <label class="checkbox_label">
                            <input type="radio" name="placeholder_source" value="custom" ${settings.placeholderSource === 'custom' ? 'checked' : ''}>
                            <span>自定义全局提示</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="radio" name="placeholder_source" value="worldbook" ${settings.placeholderSource === 'worldbook' ? 'checked' : ''}>
                            <span>世界书提取</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="radio" name="placeholder_source" value="auto" ${settings.placeholderSource === 'auto' ? 'checked' : ''}>
                            <span>自主回复摘录</span>
                        </label>
                    </div>
                    <div style="display: flex; gap: 10px;">
                       <input type="text" id="custom_placeholder_input" class="text_pole" placeholder="输入自定义全局提示..." value="${settings.customPlaceholder}">
                       <button id="custom_placeholder_apply" class="menu_button">应用</button>
                    </div>
                </div>
            </div>`;
    },

    bindSettingsEvents() {
        $(document).on('click', '#custom_placeholder_apply', () => {
            const newText = $('#custom_placeholder_input').val();
            this.getSettings().customPlaceholder = newText;
            script.saveSettingsDebounced();
            this.applyLogic();
            alert('输入框提示已更新！');
        });

        $(document).on('change', 'input[name="placeholder_source"]', (event) => {
            const value = $(event.currentTarget).val();
            this.getSettings().placeholderSource = value;
            script.saveSettingsDebounced();
            this.applyLogic();
        });
    },

    async applyLogic() {
        if (!this.getSettings().enabled) return;

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        if (this.placeholderObserver) this.placeholderObserver.disconnect();

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        const customText = settings.customPlaceholder.trim();

        if (mode === 'custom') {
            textarea.placeholder = customText || textarea.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助';
        } else if (mode === 'worldbook') {
            await this.applyWorldBookLogic(textarea);
        } else {
            if (this.autoSlogan) {
                textarea.placeholder = this.autoSlogan;
            } else {
                await this.applyWorldBookLogic(textarea);
            }
        }

        this.startPlaceholderObserver();
    },

    setAutoSlogan(text) {
        if (!text) return;
        this.autoSlogan = text;
        if (this.getSettings().placeholderSource === 'auto') {
            this.applyLogic();
        }
    },

    async applyWorldBookLogic(textarea) {
        const defaultPlaceholder = textarea.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助';
        let finalPlaceholder = defaultPlaceholder;

        try {
            if (this.iframeWindow && this.iframeWindow.getCurrentCharPrimaryLorebook && this.iframeWindow.getLorebookEntries) {
                const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
                if (lorebookName) {
                    const activeEntries = await this.iframeWindow.getLorebookEntries(lorebookName);
                    if (Array.isArray(activeEntries)) {
                        const targetEntry = activeEntries.find(entry => entry.comment === '输入框');
                        if (targetEntry && typeof targetEntry.content === 'string' && targetEntry.content.trim() !== '') {
                            finalPlaceholder = targetEntry.content;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[模块-输入框] 读取世界书时出错:', error);
        }

        textarea.placeholder = finalPlaceholder;
        console.log(`[模块-输入框] 已应用世界书/默认提示: <q>"${finalPlaceholder}"</q>`);
    },

    async onCharacterSwitch() {
        console.log('%c[模块-输入框] 角色切换，重新应用逻辑...', 'color: cyan;');
        await this.applyLogic();
    },

    startPlaceholderObserver() {
        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea || !this.getSettings().enabled) return;

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        const expected = mode === 'custom'
            ? settings.customPlaceholder.trim()
            : mode === 'auto'
                ? this.autoSlogan
                : textarea.placeholder;

        this.placeholderObserver = new MutationObserver(() => {
            const currentPlaceholder = textarea.placeholder;
            if (mode === 'custom' && expected !== '' && currentPlaceholder !== expected) {
                this.applyLogic();
            } else if (mode === 'auto' && this.autoSlogan && currentPlaceholder !== this.autoSlogan) {
                this.applyLogic();
            }
        });
        this.placeholderObserver.observe(textarea, { attributes: true, attributeFilter: ['placeholder'] });
    },

    waitForIframe() {
        return new Promise(resolve => {
            const interval = setInterval(() => {
                const iframe = document.querySelector('iframe');
                if (iframe && iframe.contentWindow) {
                    clearInterval(interval);
                    this.iframeWindow = iframe.contentWindow;
                    resolve();
                }
            }, 100);
        });
    }
};

        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();

// ###################################################################
//
//  提示词注入
//
// ###################################################################

const SloganInjectionModule = {
    PROMPT_TEXT: [
        '请在每次回答的末尾额外追加一个 HTML 注释标签，格式为 。',
        '句子为角色当前的精神标语 / 金句 / 心声，不超过20字。',
        '语言风格参考鲁迅《故乡》、史铁生《我与地坛》、余华《活着》，散文化、冷静、含蓄，不煽情不解释。',
        '务必保证注释标签内的句子是唯一输出，不要再复制到正文。'
    ].join('\n'),
    TAG_REGEX: //,
    initialized: false,

    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;
        script.eventSource.on(script.event_types.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(script.event_types.CHARACTER_MESSAGE_RENDERED, this.onMessageRendered.bind(this));
        this.initialized = true;
    },

    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;
        eventData.chat.push({ role: 'system', content: this.PROMPT_TEXT });
    },

    onMessageRendered(chatId) {
        if (!Array.isArray(window.chat)) return;
        const message = window.chat[chatId];
        if (!message || typeof message.mes !== 'string') return;

        const match = this.TAG_REGEX.exec(message.mes);
        if (!match) return;

        const raw = match[1].trim();
        const slogan = raw.startsWith('✦❋') ? raw.slice(2).trim() : raw;

        message.mes = message.mes.replace(this.TAG_REGEX, '').trim();
        if (Array.isArray(message.swipes) && typeof message.swipe_id === 'number') {
            const activeSwipe = message.swipes[message.swipe_id];
            if (typeof activeSwipe === 'string') {
                message.swipes[message.swipe_id] = activeSwipe.replace(this.TAG_REGEX, '').trim();
            }
        }

        if (typeof script.saveChatDebounced === 'function') {
            script.saveChatDebounced();
        } else if (typeof window.saveChat === 'function') {
            window.saveChat();
        }

        PlaceholderModule.setAutoSlogan(slogan);
    },
};

// ###################################################################
//
//  主程序: 初始化与UI集成
//
// ###################################################################

function initializeCombinedExtension() {
    try {
        // 1. UI布局
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
                .version-row {
                    display: flex;
                    justify-content: flex-end;
                    padding: 0 5px 5px;
                }
                .version-indicator {
                    color: var(--text_color_acc);
                    font-size: 0.8em;
                }
                .version-indicator.update-available {
                    color: var(--primary_color);
                    cursor: pointer;
                    font-weight: bold;
                }
                #misc_beautify_settings h3.sub-header {
                    font-size: 1em;
                    margin-top: 15px;
                    margin-bottom: 10px;
                }
            </style>
        `;

        // 2. 插入UI并绑定主开关事件
        $('#extensions_settings').append(combinedSettingsHtml);

        $(document).on('change', '#misc_model_display_toggle', (event) => {
            const isEnabled = $(event.currentTarget).is(':checked');
            ModelDisplayModule.getSettings().enabled = isEnabled;
            $('#model_display_settings_panel').toggle(isEnabled);
            ModelDisplayModule.rerenderAllModelNames(!isEnabled);
            if (isEnabled) ModelDisplayModule.startObservers(); else ModelDisplayModule.stopObservers();
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
                if (textarea) textarea.placeholder = textarea.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助';
                if(PlaceholderModule.placeholderObserver) PlaceholderModule.placeholderObserver.disconnect();
            }
        });

        // 3. 为每个模块绑定各自的内部设置事件
        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();

        // 4. 分别调用每个模块的初始化函数
        ModelDisplayModule.init();
        PlaceholderModule.init();

        console.log('[小美化集] 所有模块均已加载。');

    } catch (e) {
        console.error('[小美化集] 初始化过程中发生致命错误:', e);
    }
}

// 主入口: 等待UI准备就绪
const settingsCheckInterval = setInterval(() => {
    if ($ && $('#extensions_settings').length) {
        clearInterval(settingsCheckInterval);
        initializeCombinedExtension();
    }
}, 500);
