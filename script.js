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
//  模块 2: 输入框美化模块 (Placeholder Beautifier) - V3
//
// ###################################################################

const PlaceholderModule = {
    name: 'worldbook_placeholder',
    iframeWindow: null,
    TEXTAREA_ID: 'send_textarea',
    defaultSettings: Object.freeze({
        enabled: true,
        customPlaceholder: '',
        placeholderSource: 'custom',
    }),
    currentSlogan: null,

    init() {
        if (!this.getSettings().enabled) {
            console.log('[模块-输入框] 已禁用，跳过初始化。');
            return;
        }
        this.waitForIframe().then(() => {
            if (script.eventSource && script.event_types) {
                script.eventSource.on(script.event_types.CHAT_CHANGED, this.onCharacterSwitch.bind(this));
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

    // 设置当前标语
    setCurrentSlogan(text) {
        if (!text) {
            this.currentSlogan = null;
            return;
        }
        const slogan = text.trim();
        if (!slogan) {
            this.currentSlogan = null;
            return;
        }
        
        console.log('[Placeholder] 设置当前标语:', slogan);
        this.currentSlogan = slogan;
        
        const settings = this.getSettings();
        if (!settings.enabled) return;
        if (settings.placeholderSource === 'auto') {
            this.updatePlaceholder();
        }
    },

    // 从最新消息中提取标语
    extractSloganFromLatestMessage() {
        try {
            // 只检查最新的AI消息
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            if (aiMessages.length === 0) return null;
            
            const latestMessage = aiMessages[aiMessages.length - 1];
            const sloganElement = latestMessage.querySelector('.mes_text div[hidden].slogan-container');
            
            if (sloganElement) {
                const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                if (slogan) {
                    console.log('[Placeholder] 提取到标语:', slogan);
                    return slogan;
                }
            }
            return null;
        } catch (error) {
            console.error('[Placeholder] 提取标语时出错:', error);
            return null;
        }
    },

    // 更新占位符文本
    updatePlaceholder() {
        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;
        
        const settings = this.getSettings();
        
        if (settings.placeholderSource === 'custom') {
            textarea.placeholder = settings.customPlaceholder || this.resolveFallbackPlaceholder(textarea);
        } else if (settings.placeholderSource === 'auto') {
            textarea.placeholder = this.currentSlogan || this.resolveFallbackPlaceholder(textarea);
        }
    },

    // 简化的应用逻辑
    async applyLogic() {
        if (!this.getSettings().enabled) return;

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        const settings = this.getSettings();
        const mode = settings.placeholderSource;
        const defaultText = this.resolveFallbackPlaceholder(textarea);

        if (mode === 'custom') {
            textarea.placeholder = settings.customPlaceholder || defaultText;
            return;
        }

        if (mode === 'auto') {
            // 先尝试提取现有标语
            const slogan = this.extractSloganFromLatestMessage();
            if (slogan) {
                this.currentSlogan = slogan;
                textarea.placeholder = slogan;
                return;
            }
            
            // 没有标语则尝试世界书
            const world = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
            if (world && world !== defaultText) {
                this.currentSlogan = world;
                textarea.placeholder = world;
                return;
            }
            
            // 最终使用默认文本
            this.currentSlogan = null;
            textarea.placeholder = defaultText;
            return;
        }

        if (mode === 'worldbook') {
            const world = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
            textarea.placeholder = (world && world !== defaultText) ? world : defaultText;
            return;
        }
    },

    // 角色切换处理 - 使用DOM监听
    async onCharacterSwitch() {
        console.log('[模块-输入框] 角色切换 - 使用DOM监听');
        
        // 重置状态
        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (textarea) {
            textarea.placeholder = this.resolveFallbackPlaceholder(textarea);
            this.currentSlogan = null;
        }
        
        // 延迟后重新检测（等待DOM更新）
        setTimeout(() => {
            // 角色切换时，页面上已有AI消息，直接从DOM提取
            const slogan = this.extractSloganFromLatestMessage();
            if (slogan) {
                console.log('[Placeholder] 角色切换时提取到标语:', slogan);
                this.currentSlogan = slogan;
                this.updatePlaceholder();
            } else {
                // 如果没有标语，应用完整逻辑（包括世界书降级）
                this.applyLogic();
            }
        }, 800); // 稍微长一点的延迟，确保DOM完全加载
    },

    // 简化的世界书逻辑
    async applyWorldBookLogic(textarea, { setPlaceholder = true } = {}) {
        const defaultText = this.resolveFallbackPlaceholder(textarea);
        
        try {
            if (this.iframeWindow && this.iframeWindow.getCurrentCharPrimaryLorebook && this.iframeWindow.getLorebookEntries) {
                const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
                if (lorebookName) {
                    const activeEntries = await this.iframeWindow.getLorebookEntries(lorebookName);
                    if (Array.isArray(activeEntries)) {
                        const targetEntry = activeEntries.find(entry => entry.comment === '输入框');
                        if (targetEntry && targetEntry.content && targetEntry.content.trim() !== '') {
                            const finalPlaceholder = targetEntry.content;
                            if (setPlaceholder) {
                                textarea.placeholder = finalPlaceholder;
                            }
                            return finalPlaceholder;
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[模块-输入框] 读取世界书时出错:', error);
        }

        return defaultText;
    },

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
            this.updatePlaceholder();
        });

        $(document).on('change', '.placeholder_source_toggle', (event) => {
            const selected = $(event.currentTarget).data('source');
            if (!['custom', 'auto', 'worldbook'].includes(selected)) return;

            this.getSettings().placeholderSource = selected;
            script.saveSettingsDebounced();
            this.syncSourceToggles();
            this.applyLogic();
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
//  智能标语注入模块 (纯DOM优化版)
//
// ###################################################################

const SloganInjectionModule = {
    initialized: false,
    PROMPT_TEXT: '请在每次回答末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋内容</div>`。元素内仅包含角色当下的精神标语 / 心声，最长 15 个汉字。标语在隐藏元素之外不要重复，也不要额外解释。',
    
    // DOM监听状态
    domObserver: null,
    processing: false,
    
    // 重试配置
    retryConfig: {
        maxRetries: 3,
        retryDelay: 500,
        currentRetries: 0
    },

    // 初始化模块
    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;
        
        // 注册事件监听
        script.eventSource.on(script.event_types.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(script.event_types.CHARACTER_MESSAGE_RENDERED, this.onMessageRendered.bind(this));
        script.eventSource.on(script.event_types.MESSAGE_SWIPED, this.onMessageRendered.bind(this));
        script.eventSource.on(script.event_types.CHAT_CHANGED, this.onCharacterSwitch.bind(this));
        
        // 启动DOM监听
        this.setupDOMMonitoring();
        
        this.initialized = true;
        console.log('[Slogan] 纯DOM模块初始化完成');
    },

    // 提示词注入
    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;
        if (!PlaceholderModule.getSettings().enabled) return;
        if (PlaceholderModule.getSettings().placeholderSource !== 'auto') return;
        
        eventData.chat.push({ role: 'system', content: this.PROMPT_TEXT });
        console.log('[Slogan] 已注入提示词');
    },

    // 消息渲染事件 - 触发DOM监听
    onMessageRendered(payload = {}) {
        console.log('[Slogan] 消息渲染完成，等待DOM更新');
        this.retryConfig.currentRetries = 0; // 重置重试计数
    },

    // 角色切换处理
    onCharacterSwitch() {
        console.log('[Slogan] 角色切换，准备提取历史标语');
        // 角色切换时，延迟后直接扫描现有消息
        setTimeout(() => {
            this.extractFromExistingMessages();
        }, 1000);
    },

    // 设置高效的DOM监听
    setupDOMMonitoring() {
        const chatContainer = document.getElementById('chat');
        if (!chatContainer) {
            console.warn('[Slogan] 未找到聊天容器，延迟设置DOM监听');
            setTimeout(() => this.setupDOMMonitoring(), 1000);
            return;
        }
        
        this.domObserver = new MutationObserver((mutations) => {
            // 防止重复处理
            if (this.processing) return;
            
            let shouldProcess = false;
            
            // 简化的变更检查
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === 1 && 
                            node.classList && 
                            node.classList.contains('mes') && 
                            node.getAttribute('is_user') !== 'true') {
                            shouldProcess = true;
                        }
                    });
                }
            });
            
            if (shouldProcess) {
                this.processing = true;
                console.log('[Slogan] DOM监听检测到新AI消息');
                
                // 延迟处理，确保DOM完全渲染
                setTimeout(() => {
                    this.extractAndSetSlogan();
                    this.processing = false;
                }, 300);
            }
        });
        
        // 使用更高效的监听配置
        this.domObserver.observe(chatContainer, {
            childList: true,
            subtree: false // 只监听直接子元素变化，减少性能开销
        });
        
        console.log('[Slogan] 高效DOM监听已启动');
    },

    // 从现有消息中提取标语（角色切换时使用）
    extractFromExistingMessages() {
        console.log('[Slogan] 扫描现有消息寻找标语');
        const slogan = this.extractSloganFromLatestMessage();
        if (slogan) {
            console.log('[Slogan] 从历史消息提取到标语:', slogan);
            PlaceholderModule.setCurrentSlogan(slogan);
        }
    },

    // 提取并设置标语
    extractAndSetSlogan() {
        const settings = PlaceholderModule.getSettings();
        if (!settings.enabled || settings.placeholderSource !== 'auto') return;
        
        const slogan = this.extractSloganFromLatestMessage();
        
        if (slogan) {
            console.log('[Slogan] 提取到新标语:', slogan);
            PlaceholderModule.setCurrentSlogan(slogan);
            this.retryConfig.currentRetries = 0; // 成功时重置重试
        } else {
            console.log('[Slogan] 未找到标语，准备重试');
            this.retryExtraction();
        }
    },

    // 重试机制
    retryExtraction() {
        if (this.retryConfig.currentRetries >= this.retryConfig.maxRetries) {
            console.log('[Slogan] 达到最大重试次数，停止重试');
            this.retryConfig.currentRetries = 0;
            return;
        }
        
        this.retryConfig.currentRetries++;
        console.log(`[Slogan] 第${this.retryConfig.currentRetries}次重试`);
        
        setTimeout(() => {
            const slogan = this.extractSloganFromLatestMessage();
            if (slogan) {
                console.log('[Slogan] 重试成功，提取到标语:', slogan);
                PlaceholderModule.setCurrentSlogan(slogan);
                this.retryConfig.currentRetries = 0;
            } else {
                this.retryExtraction();
            }
        }, this.retryConfig.retryDelay);
    },

    // 从最新消息中提取标语
    extractSloganFromLatestMessage() {
        try {
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            if (aiMessages.length === 0) {
                console.log('[Slogan] 未找到AI消息');
                return null;
            }
            
            const latestMessage = aiMessages[aiMessages.length - 1];
            
            // 优先查找标准格式的标语元素
            let sloganElement = latestMessage.querySelector('.mes_text div[hidden].slogan-container');
            
            // 备用：查找任何包含✦❋的hidden元素
            if (!sloganElement) {
                const hiddenElements = latestMessage.querySelectorAll('.mes_text div[hidden]');
                for (let element of hiddenElements) {
                    if (element.textContent.includes('✦❋')) {
                        sloganElement = element;
                        break;
                    }
                }
            }
            
            if (sloganElement) {
                const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                if (slogan) {
                    return slogan;
                }
            }
            
            return null;
        } catch (error) {
            console.error('[Slogan] DOM查询失败:', error);
            return null;
        }
    },

    // 清理方法
    destroy() {
        if (this.domObserver) {
            this.domObserver.disconnect();
            this.domObserver = null;
        }
        this.initialized = false;
        console.log('[Slogan] DOM监听已清理');
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