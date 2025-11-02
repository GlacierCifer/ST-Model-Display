import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//
//  小杂物集 (Misc Utilities) v1.0.3
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
//
//  - 修改说明: 移除了模型名称显示功能中的字体自定义相关功能及UI。
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
    CURRENT_SCRIPT_VERSION: '1.0.3',
    SCRIPT_RAW_URL: 'https://cdn.jsdelivr.net/gh/GlacierCifer/ST-Model-Display@main/script.js',
    modelHistory: {},
    chatContentObserver: null,
    chatContainerObserver: null,

    // 1.1 默认设置
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
        placeholderSource: 'custom',
    }),
    // 移除缓存机制，只保留当前标语
    currentSlogan: null,
    // 新增：标记是否正在处理角色切换
    isSwitchingCharacter: false,

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
        if (!['custom', 'auto', 'worldbook'].includes(settings.placeholderSource)) {
            settings.placeholderSource = this.defaultSettings.placeholderSource;
        }
        if (settings.customPlaceholder === undefined) {
            settings.customPlaceholder = this.defaultSettings.customPlaceholder;
        }
        return settings;
    },

    // 设置标语 - 移除缓存逻辑
    setAutoSlogan(text) {
        if (!text) return;
        const slogan = text.trim();
        if (!slogan) return;
        
        console.log('[Placeholder] 设置标语:', slogan);
        this.currentSlogan = slogan;
        
        const settings = this.getSettings();
        if (!settings.enabled) return;
        if (settings.placeholderSource === 'auto') {
            this.applyLogic();
        }
    },

    // 获取当前标语 - 移除缓存逻辑
    getCurrentAutoSlogan() {
        console.log('[Placeholder] 获取当前标语:', this.currentSlogan || '(空)');
        return this.currentSlogan || '';
    },

    // 应用逻辑 - 保持不变
    async applyLogic() {
        if (!this.getSettings().enabled) return;

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        const custom = settings.customPlaceholder.trim();
        const defaultText = this.resolveFallbackPlaceholder(textarea);

        this.stopPlaceholderObserver();

        console.log('[Placeholder] 模式:', mode, '自定义:', custom || '(空)');

        if (mode === 'custom') {
            if (!custom) {
                console.warn('[Placeholder] 自定义模式但未输入文本，降级为自动模式');
                // 降级到自动模式
                await this.applyAutoModeWithFallback(textarea, defaultText);
            } else {
                console.log('[Placeholder] 应用自定义文本:', custom);
                textarea.placeholder = custom;
                this.startPlaceholderObserver();
            }
            return;
        }

        if (mode === 'auto') {
            await this.applyAutoModeWithFallback(textarea, defaultText);
            return;
        }

        if (mode === 'worldbook') {
            await this.applyWorldBookModeWithFallback(textarea, defaultText);
            return;
        }
    },

    // 自动模式的完整降级逻辑 - 移除缓存引用
    async applyAutoModeWithFallback(textarea, defaultText) {
        // 1. 首先尝试当前标语
        const slogan = this.getCurrentAutoSlogan();
        if (slogan) {
            console.log('[Placeholder] 使用当前标语:', slogan);
            textarea.placeholder = slogan;
            return;
        }
        
        // 2. 降级到世界书
        console.warn('[Placeholder] 当前无标语，尝试世界书…');
        const world = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
        if (world && world !== defaultText) {
            console.log('[Placeholder] 自动模式降级为世界书:', world);
            textarea.placeholder = world;
            return;
        }
        
        // 3. 最终降级到默认文本
        console.warn('[Placeholder] 自动模式无可用内容，回退原占位符:', defaultText);
        textarea.placeholder = defaultText;
    },

    // 世界书模式的降级逻辑 - 保持不变
    async applyWorldBookModeWithFallback(textarea, defaultText) {
        console.log('[Placeholder] 世界书模式，尝试提取…');
        const world = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
        if (world && world !== defaultText) {
            console.log('[Placeholder] 世界书替换成功:', world);
            textarea.placeholder = world;
        } else {
            console.warn('[Placeholder] 世界书未命中，保留原占位符:', defaultText);
            textarea.placeholder = defaultText;
        }
    },

    // 角色切换处理 - 移除缓存相关逻辑
    async onCharacterSwitch() {
        console.log('%c[模块-输入框] 角色切换开始...', 'color: cyan;');
        
        // 防止重复处理
        if (this.isSwitchingCharacter) {
            console.log('%c[模块-输入框] 角色切换已在处理中，跳过', 'color: orange;');
            return;
        }
        
        this.isSwitchingCharacter = true;
        
        try {
            // 第一步：立即重置为默认文本
            const textarea = document.getElementById(this.TEXTAREA_ID);
            if (textarea) {
                const defaultText = this.resolveFallbackPlaceholder(textarea);
                textarea.placeholder = defaultText;
                console.log('%c[模块-输入框] 已重置为默认文本:', 'color: cyan;', defaultText);
            }
            
            // 第二步：等待系统状态稳定
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // 第三步：重置当前标语
            this.currentSlogan = null;
            
            console.log('%c[模块-输入框] 角色切换完成', 'color: cyan;');
            
            // 第四步：检查是否需要重新检测最新消息
            const settings = this.getSettings();
            if (settings.placeholderSource === 'auto') {
                console.log('%c[模块-输入框] 尝试检测最新消息...', 'color: cyan;');
                await this.tryExtractSloganFromLatestMessage();
            }
            
            // 第五步：应用逻辑
            await this.applyLogic();
            
        } finally {
            this.isSwitchingCharacter = false;
        }
    },

    // 从最新消息中尝试提取标语 - 移除缓存引用
    async tryExtractSloganFromLatestMessage() {
        try {
            // 获取所有AI消息（非用户消息）
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            if (aiMessages.length === 0) {
                console.log('[Placeholder] 未找到AI消息');
                return;
            }
            
            // 从最新的消息开始查找
            for (let i = aiMessages.length - 1; i >= 0; i--) {
                const message = aiMessages[i];
                const sloganElement = message.querySelector('.mes_text div[hidden].slogan-container') || 
                                     message.querySelector('.mes_text div[hidden]');
                
                if (sloganElement) {
                    const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) {
                        console.log(`[Placeholder] 从最新消息#${i}提取标语:`, slogan);
                        this.setAutoSlogan(slogan);
                        return;
                    }
                }
            }
            
            console.log('[Placeholder] 在最新消息中未找到标语元素');
        } catch (error) {
            console.error('[Placeholder] 检测最新消息时出错:', error);
        }
    },

    // 以下方法完全保持不变...
    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div id="placeholder_options_wrapper">
                <hr>
                <h3 class="sub-header">输入框文字替换</h3>
                <div class="form-group">
                    <p class="sub-label">选择提示来源；自定义项留空时会退回到优先级序列中的下一项。</p>
                    <div class="form-group placeholder-toggle-group">
                        <label class="checkbox_label">
                            <input type="checkbox" class="placeholder_source_toggle" data-source="custom" ${settings.placeholderSource === 'custom' ? 'checked' : ''}>
                            <span>自定义全局提示</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="checkbox" class="placeholder_source_toggle" data-source="auto" ${settings.placeholderSource === 'auto' ? 'checked' : ''}>
                            <span>自主回复摘录</span>
                        </label>
                        <label class="checkbox_label">
                            <input type="checkbox" class="placeholder_source_toggle" data-source="worldbook" ${settings.placeholderSource === 'worldbook' ? 'checked' : ''}>
                            <span>世界书提取</span>
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

        $(document).on('change', '.placeholder_source_toggle', (event) => {
            const selected = $(event.currentTarget).data('source');
            if (!['custom', 'auto', 'worldbook'].includes(selected)) return;

            const settings = this.getSettings();
            if (settings.placeholderSource !== selected) {
                settings.placeholderSource = selected;
                script.saveSettingsDebounced();
                this.syncSourceToggles();
                this.applyLogic();
                return;
            }

            this.syncSourceToggles();
        });
    },

    syncSourceToggles() {
        const mode = this.getSettings().placeholderSource;
        $('.placeholder_source_toggle').each(function () {
            $(this).prop('checked', $(this).data('source') === mode);
        });
    },

    resolveFallbackPlaceholder(textarea) {
        return textarea.getAttribute('connected_text') || '输入想发送的消息，或输入 /? 获取帮助';
    },

    startPlaceholderObserver() {
        const textarea = document.getElementById(this.TEXTAREA_ID);
        const settings = this.getSettings();
        const expected = settings.customPlaceholder.trim();

        if (!textarea || settings.placeholderSource !== 'custom' || !expected) return;

        this.stopPlaceholderObserver();

        this.placeholderObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'placeholder' && textarea.placeholder !== expected) {
                    console.log('[Placeholder] 检测到外部placeholder修改，重新应用自定义文本');
                    this.stopPlaceholderObserver();
                    textarea.placeholder = expected;
                    this.startPlaceholderObserver();
                    break;
                }
            }
        });

        this.placeholderObserver.observe(textarea, {
            attributes: true,
            attributeFilter: ['placeholder'],
        });
    },

    stopPlaceholderObserver() {
        if (this.placeholderObserver) {
            this.placeholderObserver.disconnect();
            this.placeholderObserver = null;
        }
    },

    async applyWorldBookLogic(textarea, { setPlaceholder = true } = {}) {
        let finalPlaceholder = this.resolveFallbackPlaceholder(textarea);

        try {
            if (this.iframeWindow && this.iframeWindow.getCurrentCharPrimaryLorebook && this.iframeWindow.getLorebookEntries) {
                console.log('[Placeholder] 访问世界书接口成功。');
                const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
                console.log('[Placeholder] 当前世界书:', lorebookName || '(无)');
                if (lorebookName) {
                    const activeEntries = await this.iframeWindow.getLorebookEntries(lorebookName);
                    console.log('[Placeholder] 世界书条目数:', Array.isArray(activeEntries) ? activeEntries.length : '(不可用)');
                    if (Array.isArray(activeEntries)) {
                        const targetEntry = activeEntries.find(entry => entry.comment === '输入框');
                        if (targetEntry && typeof targetEntry.content === 'string' && targetEntry.content.trim() !== '') {
                            finalPlaceholder = targetEntry.content;
                            console.log('[Placeholder] 命中世界书条目，内容:', finalPlaceholder);
                        } else {
                            console.warn('[Placeholder] 未找到 comment="输入框" 的条目。');
                        }
                    }
                }
            } else {
                console.error('[Placeholder] 读取世界书接口不可用。');
            }
        } catch (error) {
            console.error('[模块-输入框] 读取世界书时出错:', error);
        }

        if (setPlaceholder) {
            textarea.placeholder = finalPlaceholder;
            console.log('[Placeholder] 已设置占位符:', finalPlaceholder);
        }
        return finalPlaceholder;
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
    },
};

// ###################################################################
//
//  提示词注入
//
// ###################################################################

const SloganInjectionModule = {
    initialized: false,
    PROMPT_TEXT: [
        '请在每次正文的末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋内容</div>`。',
        '元素内仅包含当前角色对当下情况的个人感受或者吐槽，要求模仿名言名句的形式，具备黑色幽默感，最长 15 个汉字。',
        '标语在隐藏元素之外不要重复，也不要额外解释。'
    ].join('\n'),
    
    // 控制台监听状态
    consoleListener: {
        isActive: false,
        originalConsoleLog: null,
        messagePattern: /Core\/all messages:\s*(\d+)\/(\d+)/,
        timeoutId: null
    },
    
    // DOM 监听状态
    domObserver: null,
    htmlDecodeElement: null,

    // HTML 实体解码
    decodeHtmlEntities(text = '') {
        if (!this.htmlDecodeElement) {
            this.htmlDecodeElement = document.createElement('textarea');
        }
        let previous;
        let current = text;
        do {
            previous = current;
            this.htmlDecodeElement.innerHTML = current;
            current = this.htmlDecodeElement.value;
        } while (current !== previous && current.includes('&'));
        return current;
    },

    // 初始化模块
    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;
        
        // 注册事件监听
        script.eventSource.on(script.event_types.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(script.event_types.CHARACTER_MESSAGE_RENDERED, this.onMessageRendered.bind(this));
        script.eventSource.on(script.event_types.MESSAGE_SWIPED, this.onMessageRendered.bind(this));
        
        // 启动控制台监听（主要方案）
        this.setupConsoleListener();
        
        // 启动DOM监听（备用方案）
        this.setupDOMMonitoring();
        
        this.initialized = true;
        console.log('[Slogan] 模块初始化完成');
    },

    // 提示词注入
    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;
        if (!PlaceholderModule.getSettings().enabled) return;
        if (PlaceholderModule.getSettings().placeholderSource !== 'auto') return;
        eventData.chat.push({ role: 'system', content: this.PROMPT_TEXT });
    },

    // 消息渲染事件 - 现在只记录，等待控制台信号
    onMessageRendered(payload = {}) {
        console.log('[Slogan] 收到渲染事件，等待控制台完成信号');
        // 不立即处理，等待控制台的完成信号
    },

    // 设置控制台监听
    setupConsoleListener() {
        if (this.consoleListener.isActive) {
            console.log('[Slogan] 控制台监听已激活');
            return;
        }
        
        console.log('[Slogan] 启动控制台日志监听');
        
        // 保存原始 console.log
        this.consoleListener.originalConsoleLog = console.log;
        
        // 重写 console.log 来捕获特定消息
        console.log = (...args) => {
            // 先调用原始 console.log
            this.consoleListener.originalConsoleLog.apply(console, args);
            
            // 检查是否包含目标消息
            this.checkConsoleForCompletion(args);
        };
        
        this.consoleListener.isActive = true;
    },

    // 检查控制台输出是否包含完成信号
    checkConsoleForCompletion(args) {
        try {
            // 将参数合并为字符串
            const logMessage = args.map(arg => 
                typeof arg === 'string' ? arg : JSON.stringify(arg)
            ).join(' ');
            
            // 检查是否匹配目标模式
            const match = logMessage.match(this.consoleListener.messagePattern);
            if (match) {
                const current = parseInt(match[1]);
                const total = parseInt(match[2]);
                
                console.log(`[Slogan] 检测到消息完成信号: ${current}/${total}`);
                
                // 当当前消息数等于总数时，说明所有消息都处理完了
                if (current === total) {
                    this.onStreamingComplete();
                }
            }
        } catch (error) {
            console.error('[Slogan] 检查控制台日志时出错:', error);
        }
    },

    // 流式输出完成处理
    onStreamingComplete() {
        console.log('[Slogan] 确认流式输出完成，开始提取标语');
        
        // 清除之前的延迟检测（如果有）
        if (this.consoleListener.timeoutId) {
            clearTimeout(this.consoleListener.timeoutId);
        }
        
        // 稍微延迟确保DOM完全更新
        this.consoleListener.timeoutId = setTimeout(() => {
            this.extractSloganAfterCompletion();
        }, 300);
    },

    // 完成后提取标语
    extractSloganAfterCompletion() {
        console.log('[Slogan] 开始最终标语提取');
        
        let slogan = this.extractSloganFromLatestDOM();
        
        if (slogan) {
            console.log('[Slogan] 成功提取标语:', slogan);
            PlaceholderModule.setAutoSlogan(slogan);
        } else {
            console.warn('[Slogan] DOM中未找到标语，尝试备用方法');
            // 备用：从消息对象中提取
            this.tryBackupExtraction();
        }
        
        this.consoleListener.timeoutId = null;
    },

    // 从DOM中直接查找最新的标语元素
    extractSloganFromLatestDOM() {
        try {
            // 获取所有AI消息（非用户消息）
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            if (aiMessages.length === 0) {
                console.log('[Slogan] 未找到AI消息');
                return null;
            }
            
            // 从最新的消息开始查找
            for (let i = aiMessages.length - 1; i >= 0; i--) {
                const message = aiMessages[i];
                const sloganElement = message.querySelector('.mes_text div[hidden].slogan-container') || 
                                     message.querySelector('.mes_text div[hidden]');
                
                if (sloganElement) {
                    const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) {
                        console.log(`[Slogan] 从DOM消息#${i}提取标语:`, slogan);
                        return slogan;
                    }
                }
            }
            
            console.log('[Slogan] 在DOM中未找到标语元素');
            return null;
        } catch (error) {
            console.error('[Slogan] DOM查询失败:', error);
            return null;
        }
    },

    // 从消息对象中提取标语
    extractSloganFromMessage(message) {
        if (!message) return null;
        
        // 从消息对象中查找 hidden 元素
        const rawText = message.mes_raw || message.mes;
        if (rawText) {
            return this.extractSloganFromText(rawText);
        }
        
        return null;
    },

    // 从文本中提取标语
    extractSloganFromText(text) {
        if (!text) return null;
        
        const decoded = this.decodeHtmlEntities(text);
        
        // 匹配 hidden 元素
        const hiddenDivMatch = decoded.match(/<div\s+hidden[^>]*class\s*=\s*["']slogan-container["'][^>]*>(.*?)<\/div>/i);
        if (hiddenDivMatch) {
            const slogan = hiddenDivMatch[1].trim().replace(/^✦❋/, '').trim();
            console.log('[Slogan] 从文本中提取标语:', slogan);
            return slogan;
        }
        
        // 备用：匹配任何包含 ✦❋ 的 hidden 元素
        const anyHiddenMatch = decoded.match(/<div\s+hidden[^>]*>.*?✦❋(.*?)<\/div>/i);
        if (anyHiddenMatch) {
            const slogan = anyHiddenMatch[1].trim();
            console.log('[Slogan] 从备用hidden元素提取标语:', slogan);
            return slogan;
        }
        
        return null;
    },

    // 备用提取方法
    tryBackupExtraction() {
        // 尝试从最新的消息对象中提取
        if (window.chat && Array.isArray(window.chat)) {
            for (let i = window.chat.length - 1; i >= 0; i--) {
                const message = window.chat[i];
                if (message && !message.is_user) {
                    const slogan = this.extractSloganFromMessage(message);
                    if (slogan) {
                        console.log('[Slogan] 备用方法提取标语:', slogan);
                        PlaceholderModule.setAutoSlogan(slogan);
                        return;
                    }
                }
            }
        }
        
        console.warn('[Slogan] 所有提取方法都失败，维持上一个状态');
    },

    // 设置DOM监听作为备用方案
    setupDOMMonitoring() {
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) {
            console.warn('[Slogan] 未找到聊天容器，延迟设置DOM监听');
            setTimeout(() => this.setupDOMMonitoring(), 1000);
            return;
        }
        
        this.domObserver = new MutationObserver((mutations) => {
            let shouldCheck = false;
            
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && 
                            node.classList && 
                            node.classList.contains('mes') && 
                            node.getAttribute('is_user') !== 'true') {
                            shouldCheck = true;
                        }
                    });
                }
            });
            
            if (shouldCheck) {
                console.log('[Slogan] DOM监听检测到新AI消息，但等待控制台信号');
                // 这里不立即处理，主要依赖控制台信号
            }
        });
        
        this.domObserver.observe(chatContainer, {
            childList: true,
            subtree: true
        });
        
        console.log('[Slogan] DOM监听已启动（备用方案）');
    },

    // 清理控制台监听
    destroyConsoleListener() {
        if (this.consoleListener.isActive && this.consoleListener.originalConsoleLog) {
            console.log = this.consoleListener.originalConsoleLog;
            this.consoleListener.isActive = false;
            console.log('[Slogan] 控制台监听已清理');
        }
        
        if (this.consoleListener.timeoutId) {
            clearTimeout(this.consoleListener.timeoutId);
            this.consoleListener.timeoutId = null;
        }
    },

    // 完整的清理方法
    destroy() {
        this.destroyConsoleListener();
        
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
            console.log('[Slogan] DOM监听已清理');
        }
        
        this.initialized = false;
    }
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
        SloganInjectionModule.init();

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