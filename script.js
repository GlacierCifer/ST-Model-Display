import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//
//  小杂物集 (Misc Utilities) v1.1.0 (按需修改版)
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
//  - 模块3: 标语注入 (Slogan Injection)
//
//  - 修改说明 (v1.1.0):
//    - [UI/UX] 重构“输入框文字替换”设置为选项卡式界面，选中项下方动态展开配置面板。
//    - [功能] “自定义全局提示”移除“应用”按钮，改为实时自动保存。
//    - [功能] “自主回复摘录”模式新增文本框，允许用户自定义注入AI的提示词。
//    - [功能] “世界书提取”模式新增文本框，可双向同步当前角色世界书中的“输入框”条目。
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
    // 新增：性能优化相关
    processingMessages: new Set(), // 正在处理的消息ID集合
    pendingProcessing: new Map(), // 待处理的消息队列

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

    // 优化：更高效的深度查询，限制搜索范围
    deepQuerySelector(selector, root = document) {
        try {
            // 先尝试常规查询
            const found = root.querySelector(selector); 
            if (found) return found;
            
            // 只在必要时搜索shadow DOM
            for (const element of root.querySelectorAll('*')) {
                if (element.shadowRoot) {
                    const foundInShadow = element.shadowRoot.querySelector(selector);
                    if (foundInShadow) return foundInShadow;
                }
            }
        } catch (e) {
            console.warn('[模块-模型显示] 深度查询出错:', e);
        }
        return null;
    },

    getCurrentModelName(messageElement) {
        // 优化：直接查询timestamp-icon内的title元素
        const iconSvg = this.deepQuerySelector('.timestamp-icon', messageElement);
        if (!iconSvg) return null;
        
        const svgTitle = iconSvg.querySelector('title');
        if (svgTitle && svgTitle.textContent.includes(' - ')) {
            return svgTitle.textContent.split(' - ')[1];
        }
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
            } catch (e) { 
                console.error("[模块-模型显示] 渲染SVG时出错:", e); 
            }
        });
    },

    // 优化：使用更高效的等待策略，减少轮询
    waitForElementAndProcess(messageElement, timeout = 8000) {
        if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;
        
        const messageId = this.getMessageId(messageElement);
        if (!messageId || messageId === '0' || messageId === '1') return;
        
        // 如果已经在处理中，跳过
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
            
            // 如果图标不存在，继续等待
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
                // 模型名称还没出现，继续等待但间隔逐渐延长
                const delay = Math.min(200 + (checkCount * 50), 1000); // 最大1秒间隔
                setTimeout(checkIcon, delay);
            }
        };
        
        // 立即开始检查
        setTimeout(checkIcon, 100);
    },

    getMessageId(messageElement) {
        const idElement = messageElement.querySelector('.mesIDDisplay');
        return idElement ? idElement.textContent.replace('#', '') : null;
    },

    processAndRecordMessage(messageElement) {
        // 优化：使用防抖处理，避免短时间内重复处理同一消息
        const messageId = this.getMessageId(messageElement);
        if (!messageId) return;
        
        if (this.pendingProcessing.has(messageId)) {
            clearTimeout(this.pendingProcessing.get(messageId));
        }
        
        const timeoutId = setTimeout(() => {
            this.pendingProcessing.delete(messageId);
            this.waitForElementAndProcess(messageElement);
        }, 50); // 延迟50ms，合并快速连续的变化
        
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

    // 优化：重构观察者逻辑，缩小监听范围
    startObservers() {
        this.stopObservers();
        const chatNode = document.getElementById('chat');
        
        if (chatNode) {
            // 优化：只监听直接子节点的变化，避免深度遍历
            this.chatContentObserver = new MutationObserver((mutationsList) => {
                for (const mutation of mutationsList) {
                    if (mutation.type === 'childList') {
                        // 优化：批量处理新增节点
                        const addedMessages = [];
                        
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === 1) {
                                if (node.matches && node.matches('.mes')) {
                                    addedMessages.push(node);
                                } else if (node.querySelectorAll) {
                                    const nestedMessages = node.querySelectorAll('.mes');
                                    nestedMessages.forEach(mes => addedMessages.push(mes));
                                }
                            }
                        });
                        
                        // 批量处理消息
                        if (addedMessages.length > 0) {
                            requestAnimationFrame(() => {
                                addedMessages.forEach(message => {
                                    this.processAndRecordMessage(message);
                                });
                            });
                        }
                    }
                }
            });
            
            // 优化：只监听直接子节点变化，不监听子树
            this.chatContentObserver.observe(chatNode, { 
                childList: true, 
                subtree: false // 关键优化：不监听深层变化
            });
        }
        
        // 保留聊天容器观察者，但同样优化
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
        
        this.chatContainerObserver.observe(document.body, { 
            childList: true,
            subtree: false 
        });
    },

    stopObservers() {
        if (this.chatContentObserver) { 
            this.chatContentObserver.disconnect(); 
            this.chatContentObserver = null; 
        }
        if (this.chatContainerObserver) { 
            this.chatContainerObserver.disconnect(); 
            this.chatContainerObserver = null; 
        }
        
        // 清理所有待处理的任务
        for (const [messageId, timeoutId] of this.pendingProcessing) {
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
    },
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
    // 新增：默认设置中添加标语提示词
    defaultSettings: Object.freeze({
        enabled: true,
        customPlaceholder: '',
        placeholderSource: 'custom',
        // 新增：用于“自主回复摘录”模式的用户自定义提示词
        sloganPrompt: [
            '元素内仅包含当前角色极具个人风格的语录，格式模仿座右铭、网络用语、另类名言、爱语、吐槽等形式，具备黑色幽默感，最长 15 个汉字。',
            '标语不要重复，也不要额外解释。'
        ].join('\n'),
    }),
    currentSlogan: null,
    isSwitchingCharacter: false,
    // 新增：用于世界书编辑的防抖计时器
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
        // ... 此部分逻辑不变，但会处理新增的 sloganPrompt ...
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        const settings = extension_settings[this.name];
        // 确保旧设置兼容
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

    // ... setAutoSlogan, getCurrentAutoSlogan, applyLogic, applyAutoModeWithFallback, applyWorldBookModeWithFallback 逻辑基本不变 ...
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

    getCurrentAutoSlogan() {
        console.log('[Placeholder] 获取当前标语:', this.currentSlogan || '(空)');
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

        console.log('[Placeholder] 模式:', mode, '自定义:', custom || '(空)');

        if (mode === 'custom') {
            if (!custom) {
                console.warn('[Placeholder] 自定义模式但未输入文本，降级为自动模式');
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

    async applyAutoModeWithFallback(textarea, defaultText) {
        const slogan = this.getCurrentAutoSlogan();
        if (slogan) {
            console.log('[Placeholder] 使用当前标语:', slogan);
            textarea.placeholder = slogan;
            return;
        }

        console.warn('[Placeholder] 当前无标语，尝试世界书…');
        const world = await this.applyWorldBookLogic(textarea, { setPlaceholder: false });
        if (world && world !== defaultText) {
            console.log('[Placeholder] 自动模式降级为世界书:', world);
            textarea.placeholder = world;
            return;
        }

        console.warn('[Placeholder] 自动模式无可用内容，回退原占位符:', defaultText);
        textarea.placeholder = defaultText;
    },

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

    async onCharacterSwitch() {
        console.log('%c[模块-输入框] 角色切换开始...', 'color: cyan;');

        if (this.isSwitchingCharacter) {
            console.log('%c[模块-输入框] 角色切换已在处理中，跳过', 'color: orange;');
            return;
        }

        this.isSwitchingCharacter = true;

        try {
            const textarea = document.getElementById(this.TEXTAREA_ID);
            if (textarea) {
                const defaultText = this.resolveFallbackPlaceholder(textarea);
                textarea.placeholder = defaultText;
                console.log('%c[模块-输入框] 已重置为默认文本:', 'color: cyan;', defaultText);
            }

            await new Promise(resolve => setTimeout(resolve, 300));

            this.currentSlogan = null;

            // 新增：角色切换时，如果当前是世界书模式，重新加载内容
            if (this.getSettings().placeholderSource === 'worldbook') {
                await this.loadWorldBookContentToPanel();
            }

            console.log('%c[模块-输入框] 角色切换完成', 'color: cyan;');

            const settings = this.getSettings();
            if (settings.placeholderSource === 'auto') {
                console.log('%c[模块-输入框] 尝试检测最新消息...', 'color: cyan;');
                await this.tryExtractSloganFromLatestMessage();
            }

            await this.applyLogic();

        } finally {
            this.isSwitchingCharacter = false;
        }
    },

    async tryExtractSloganFromLatestMessage() {
        // ... 此方法逻辑不变 ...
        try {
            const aiMessages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
            if (aiMessages.length === 0) {
                console.log('[Placeholder] 未找到AI消息');
                return;
            }

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

    // [重大修改] 渲染设置界面的HTML
    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div id="placeholder_options_wrapper">
                <hr>
                <h3 class="sub-header">输入框文字替换</h3>
                <p class="sub-label">选择提示来源，对应配置项会动态显示。</p>

                <div class="form-group placeholder-radio-group">
                    <label>
                        <input type="radio" name="placeholder_source_radio" value="custom" ${settings.placeholderSource === 'custom' ? 'checked' : ''}>
                        <span>自定义</span>
                    </label>
                    <label>
                        <input type="radio" name="placeholder_source_radio" value="auto" ${settings.placeholderSource === 'auto' ? 'checked' : ''}>
                        <span>AI摘录</span>
                    </label>
                    <label>
                        <input type="radio" name="placeholder_source_radio" value="worldbook" ${settings.placeholderSource === 'worldbook' ? 'checked' : ''}>
                        <span>世界书</span>
                    </label>
                </div>

                <div id="placeholder_panel_custom" class="placeholder-panel" style="${settings.placeholderSource === 'custom' ? '' : 'display: none;'}">
                    <input type="text" id="custom_placeholder_input" class="text_pole" placeholder="输入自定义全局提示..." value="${settings.customPlaceholder}">
                </div>

                <div id="placeholder_panel_auto" class="placeholder-panel" style="${settings.placeholderSource === 'auto' ? '' : 'display: none;'}">
                    <p class="sub-label">注入的提示词（别忘记限制回复字数）：</p>
                    <textarea id="slogan_prompt_input" class="text_pole" rows="4" placeholder="输入自定义提示词...">${settings.sloganPrompt}</textarea>
                </div>

                <div id="placeholder_panel_worldbook" class="placeholder-panel" style="${settings.placeholderSource === 'worldbook' ? '' : 'display: none;'}">
                    <p class="sub-label">当前角色世界书中的“输入框”条目：</p>
                    <textarea id="worldbook_placeholder_input" class="text_pole" rows="3" placeholder="正在从世界书加载..."></textarea>
                </div>
            </div>`;
    },

    // [重大修改] 绑定设置界面的事件
    bindSettingsEvents() {
        // 绑定主单选按钮切换事件
        $(document).on('change', 'input[name="placeholder_source_radio"]', (event) => {
            const selected = $(event.currentTarget).val();
            if (!['custom', 'auto', 'worldbook'].includes(selected)) return;

            const settings = this.getSettings();
            if (settings.placeholderSource !== selected) {
                settings.placeholderSource = selected;
                script.saveSettingsDebounced();

                // 控制面板显隐
                $('.placeholder-panel').hide();
                $(`#placeholder_panel_${selected}`).show();

                // 如果切换到世界书模式，立即加载内容
                if (selected === 'worldbook') {
                    this.loadWorldBookContentToPanel();
                }

                this.applyLogic();
            }
        });

        // 绑定“自定义”输入框事件
        $(document).on('input', '#custom_placeholder_input', (e) => {
            this.getSettings().customPlaceholder = $(e.currentTarget).val();
            script.saveSettingsDebounced();
            this.applyLogic();
        });

        // 绑定“AI摘录”文本域事件
        $(document).on('input', '#slogan_prompt_input', (e) => {
            this.getSettings().sloganPrompt = $(e.currentTarget).val();
            script.saveSettingsDebounced();
        });

        // 绑定“世界书”文本域事件
        $(document).on('input', '#worldbook_placeholder_input', (e) => {
            const content = $(e.currentTarget).val();

            // 使用防抖更新世界书
            clearTimeout(this.worldbookUpdateDebounce);
            this.worldbookUpdateDebounce = setTimeout(() => {
                this.updateWorldBookFromPanel(content);

                // 新增：如果当前是世界书模式，立即应用到输入框
                const settings = this.getSettings();
                if (settings.placeholderSource === 'worldbook') {
                    const textarea = document.getElementById(this.TEXTAREA_ID);
                    if (textarea) {
                        // 如果内容为空，使用默认占位符
                        const placeholder = content.trim() || this.resolveFallbackPlaceholder(textarea);
                        textarea.placeholder = placeholder;
                        console.log('[Placeholder] 世界书内容已应用到输入框:', placeholder);
                    }
                }
            }, 500);
        });
    },

    // [新增] 从世界书加载内容到配置面板
    async loadWorldBookContentToPanel() {
        const textarea = $('#worldbook_placeholder_input');
        if (!textarea.length) return;

        textarea.val('').attr('placeholder', '正在读取世界书...');
        try {
            const content = await this.applyWorldBookLogic(document.getElementById(this.TEXTAREA_ID), { setPlaceholder: false });
            // 如果内容和默认占位符一样，说明没找到条目，显示空
            const defaultPlaceholder = this.resolveFallbackPlaceholder(document.getElementById(this.TEXTAREA_ID));
            if (content !== defaultPlaceholder) {
                textarea.val(content);
                textarea.attr('placeholder', '修改此处内容可同步更新世界书条目...');
            } else {
                 textarea.val('');
                 textarea.attr('placeholder', '未找到“输入框”条目，输入内容即可创建本角色专属输入框提示。(请不要在首页创建！出事概不负责！)');
            }
        } catch (error) {
            console.error('[Placeholder] 加载世界书内容到面板时出错:', error);
            textarea.attr('placeholder', '加载失败，请检查控制台。');
        }
    },

    // [新增] 从配置面板更新世界书内容
    async updateWorldBookFromPanel(content) {
        console.log('[Placeholder] 准备更新世界书，内容:', content);
        if (!this.iframeWindow) {
            console.error('[Placeholder] iframeWindow 未准备好，无法更新世界书。');
            return;
        }

        try {
            const lorebookName = await this.iframeWindow.getCurrentCharPrimaryLorebook();
            if (!lorebookName) {
                console.warn('[Placeholder] 当前角色没有主世界书，无法更新。');
                return;
            }

            const entries = await this.iframeWindow.getLorebookEntries(lorebookName);
            const targetEntry = entries.find(entry => entry.comment === '输入框');

            if (targetEntry) {
                // 使用测试成功的更新方法
                console.log(`[Placeholder] 找到条目 (UID: ${targetEntry.uid})，准备更新。`);
                await this.iframeWindow.updateLorebookEntriesWith(lorebookName, (entries) => {
                    return entries.map(entry => {
                        if (entry.comment === '输入框') {
                            return { 
                                ...entry, 
                                content: content,
                                enabled: false // 保持禁用状态
                            };
                        }
                        return entry;
                    });
                });
                console.log('[Placeholder] 世界书条目已更新。');
            } else {
                // 使用测试成功的创建方法
                console.log('[Placeholder] 未找到条目，准备创建新条目。');
                const newEntry = {
                    key: ['输入框'],
                    comment: '输入框',
                    content: content,
                    enabled: false,
                    insertionorder: 100,
                    selective: false,
                    secondarykeys: [],
                    constant: false,
                    position: 'before_char'
                };
                await this.iframeWindow.createLorebookEntry(lorebookName, newEntry);
                console.log('[Placeholder] 新的世界书条目已创建（未启用）。');
            }

            // 更新成功后，如果当前是世界书模式，立即应用
            if (this.getSettings().placeholderSource === 'worldbook') {
                const textarea = document.getElementById(this.TEXTAREA_ID);
                if (textarea) {
                    textarea.placeholder = content.trim() || this.resolveFallbackPlaceholder(textarea);
                }
            }

        } catch (error) {
            console.error('[Placeholder] 更新世界书时发生错误:', error);
        }
    },

    // ... 其他辅助函数保持不变 ...
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
            } else {
                console.error('[Placeholder] 读取世界书接口不可用。');
            }
        } catch (error) {
            console.error('[模块-输入框] 读取世界书时出错:', error);
        }

        if (setPlaceholder) {
            textarea.placeholder = finalPlaceholder;
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
//  模块 3: 标语注入 (Slogan Injection) 
//
// ###################################################################
const SloganInjectionModule = {
    initialized: false,
    // 固定的提示词前缀
    PROMPT_PREFIX: '请在每次正文的末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋内容</div>`。',

    // 简化属性 - 只保留必要的防抖计时器
    extractionDebounceTimer: null,
    htmlDecodeElement: null,

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

    init() {
        if (this.initialized || !script.eventSource || !script.event_types) return;

        script.eventSource.on(script.event_types.CHAT_COMPLETION_PROMPT_READY, this.onPromptReady.bind(this));
        script.eventSource.on(script.event_types.CHARACTER_MESSAGE_RENDERED, this.onMessageRendered.bind(this));
        script.eventSource.on(script.event_types.MESSAGE_SWIPED, this.onMessageRendered.bind(this));
        // 新增：监听消息删除事件
        script.eventSource.on(script.event_types.MESSAGE_DELETED, this.onMessageDeleted.bind(this));

        this.initialized = true;
        console.log('[Slogan] 模块初始化完成（支持删除事件）');
    },

    // 提示词注入逻辑
    onPromptReady(eventData = {}) {
        if (eventData.dryRun === true || !Array.isArray(eventData.chat)) return;

        const placeholderSettings = PlaceholderModule.getSettings();
        if (!placeholderSettings.enabled || placeholderSettings.placeholderSource !== 'auto') return;

        const userPrompt = placeholderSettings.sloganPrompt || '';
        const finalPrompt = `${this.PROMPT_PREFIX}\n${userPrompt}`;

        console.log('[Slogan] 注入最终提示词:', finalPrompt);
        eventData.chat.push({ role: 'system', content: finalPrompt });
    },

    onMessageRendered(payload = {}) {
        console.log('[Slogan] 收到渲染事件，准备提取标语');
        
        // 使用防抖，避免频繁提取
        clearTimeout(this.extractionDebounceTimer);
        this.extractionDebounceTimer = setTimeout(() => {
            this.extractSlogan();
        }, 800); // 稍微延长等待时间，确保DOM完全渲染
    },

    onMessageDeleted(payload = {}) {
        console.log('[Slogan] 收到删除事件，重新提取标语');
        
        // 删除事件也需要防抖，因为可能批量删除
        clearTimeout(this.extractionDebounceTimer);
        this.extractionDebounceTimer = setTimeout(() => {
            this.extractSlogan();
        }, 300);
    },

    extractSlogan() {
        console.log('[Slogan] 开始提取标语');
        
        // 直接从DOM中提取最新的AI消息标语
        const slogan = this.extractSloganFromLatestAIMessage();
        if (slogan) {
            console.log('[Slogan] 提取到标语:', slogan);
            PlaceholderModule.setAutoSlogan(slogan);
            return true;
        }

        console.warn('[Slogan] 未找到标语');
        return false;
    },

    extractSloganFromLatestAIMessage() {
        try {
            // 获取所有AI消息（跳过用户消息）
            const aiMessages = Array.from(document.querySelectorAll('#chat .mes:not([is_user="true"])'));
            
            if (aiMessages.length === 0) {
                console.log('[Slogan] 未找到AI消息');
                return null;
            }
            
            // 从最新的AI消息开始检查（从后往前）
            for (let i = aiMessages.length - 1; i >= 0; i--) {
                const message = aiMessages[i];
                const sloganElement = message.querySelector('.mes_text div[hidden].slogan-container') || 
                                     message.querySelector('.mes_text div[hidden]');
                
                if (sloganElement) {
                    const slogan = sloganElement.textContent.trim().replace(/^✦❋/, '').trim();
                    if (slogan) {
                        console.log(`[Slogan] 从AI消息#${i}提取到标语`);
                        return slogan;
                    }
                }
            }
            
            console.log('[Slogan] AI消息中未找到标语元素');
            return null;
        } catch (error) {
            console.error('[Slogan] DOM查询失败:', error);
            return null;
        }
    },

    destroy() {
        if (this.extractionDebounceTimer) {
            clearTimeout(this.extractionDebounceTimer);
            this.extractionDebounceTimer = null;
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
                .version-row { display: flex; justify-content: flex-end; padding: 0 5px 5px; }
                .version-indicator { color: var(--text_color_acc); font-size: 0.8em; }
                #misc_beautify_settings h3.sub-header { font-size: 1em; margin-top: 15px; margin-bottom: 10px; }
                .placeholder-panel { margin-top: 10px; }
                .placeholder-radio-group { display: flex; border: 1px solid var(--border_color); border-radius: 5px; overflow: hidden; }
                .placeholder-radio-group label { flex: 1; text-align: center; padding: 5px 0; background-color: var(--background_bg); cursor: pointer; border-left: 1px solid var(--border_color); }
                .placeholder-radio-group label:first-child { border-left: none; }
                .placeholder-radio-group input[type="radio"] { display: none; }
                .placeholder-radio-group input[type="radio"]:checked + span { color: var(--primary_color); font-weight: bold; }
                .placeholder-radio-group label:hover { background-color: var(--background_layer_1); }
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
                if (textarea) textarea.placeholder = PlaceholderModule.resolveFallbackPlaceholder(textarea);
                PlaceholderModule.stopPlaceholderObserver();
            }
        });

        // 3. 为每个模块绑定各自的内部设置事件
        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();

        // 4. 分别调用每个模块的初始化函数
        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();

        // 5. [新增] 页面加载时，如果世界书面板可见，则加载其内容
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

// 主入口: 等待UI准备就绪
const settingsCheckInterval = setInterval(() => {
    if ($ && $('#extensions_settings').length) {
        clearInterval(settingsCheckInterval);
        initializeCombinedExtension();
    }
}, 500);
