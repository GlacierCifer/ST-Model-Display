import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ===================================================================
//
//  小杂物集 (Misc Utilities) v1.0.2
//  - 模块1: 模型名称显示 (Model Display)
//  - 模块2: 世界书输入框提示 (World Book Placeholder)
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
    CURRENT_SCRIPT_VERSION: '1.0.2',
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
        fontCssUrl: 'https://fontsapi.zeoseven.com/371/main/result.css',
        savedFontUrls: ['https://fontsapi.zeoseven.com/371/main/result.css'],
    }),

    // 1.2 模块初始化入口
    // ---------------------------------------------------------------
    init() {
        this.applyFontCss(this.getSettings().fontCssUrl);
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
        const settings = extension_settings[this.name];
        const urls = settings.savedFontUrls;
        const noneIndex = urls.indexOf('none');
        if (noneIndex > -1) { urls.splice(noneIndex, 1); }
        urls.unshift('none');
        settings.savedFontUrls = [...new Set(urls)];
        return settings;
    },

    saveSettings() {
        script.saveSettingsDebounced();
        this.rerenderAllModelNames();
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        const optionsHtml = settings.savedFontUrls.map(url => {
            const text = url === 'none' ? '默认字体 (None)' : url;
            const selected = url === settings.fontCssUrl ? 'selected' : '';
            return `<option value="${url}" ${selected}>${text}</option>`;
        }).join('');

        // 移除了外部抽屉，只返回核心设置内容
        return `
            <div id="model_display_options_wrapper">
                <hr>
                <h3 class="sub-header">模型名称显示</h3>
                <div class="form-group"><label>字体大小:</label><input type="text" id="model_display_font_size" class="text_pole" value="${settings.fontSize}"></div>
                <div class="form-group"><label>前缀:</label><input type="text" id="model_display_prefix" class="text_pole" value="${settings.prefix}"></div>
                <div class="form-group"><label>后缀:</label><input type="text" id="model_display_suffix" class="text_pole" value="${settings.suffix}"></div>
                <div class="form-group"><label>字体 CSS 链接:</label><div style="display: flex; gap: 5px;"><input type="text" id="model_display_font_css_url_new" class="text_pole" placeholder="粘贴新的CSS链接..."><button id="model_display_apply_font" class="menu_button">应用</button></div></div>
                <div class="form-group"><label>已保存字体:</label><select id="model_display_saved_fonts" class="text_pole">${optionsHtml}</select></div>
            </div>`;
    },

    bindSettingsEvents() {
        $(document).on('input', '#model_display_font_size', (e) => { this.getSettings().fontSize = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_prefix', (e) => { this.getSettings().prefix = $(e.currentTarget).val(); this.saveSettings(); });
        $(document).on('input', '#model_display_suffix', (e) => { this.getSettings().suffix = $(e.currentTarget).val(); this.saveSettings(); });

        $(document).on('click', '#model_display_apply_font', () => {
            const newUrl = $('#model_display_font_css_url_new').val().trim();
            if (newUrl) {
                this.applyFontCss(newUrl);
                this.getSettings().fontCssUrl = newUrl;
                if (!this.getSettings().savedFontUrls.includes(newUrl)) {
                    this.getSettings().savedFontUrls.push(newUrl);
                }
                this.saveSettings();
                alert('新字体已应用并保存！为看到选择列表更新，请刷新页面。');
            }
        });

        $(document).on('change', '#model_display_saved_fonts', (e) => {
            const selectedUrl = $(e.currentTarget).val();
            this.applyFontCss(selectedUrl);
            this.getSettings().fontCssUrl = selectedUrl;
            this.saveSettings();
        });
    },

    applyFontCss(url) {
        $('#model_display_dynamic_font').remove();
        if (url === 'none' || !url) {
            this.rerenderAllModelNames();
            return;
        }
        const style = document.createElement('style');
        style.id = 'model_display_dynamic_font';
        style.textContent = `@import url("${url}");`;
        document.head.appendChild(style);
        this.rerenderAllModelNames();
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
                const messageId = finalIdElement ? finalIdElement.textContent.replace('#', '') : '未知';
                console.warn(`[模块-模型显示] 等待楼层 #${messageId} 的元素或模型名称超时。`);
                return;
            }
            const iconSvg = this.deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
            const idElement = messageElement.querySelector('.mesIDDisplay');
            if (!iconSvg || !idElement) { return; }

            const modelName = this.getCurrentModelName(messageElement);
            const messageId = idElement.textContent.replace('#', '');
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

        try {
            const response = await fetch(this.SCRIPT_RAW_URL + `?t=${new Date().getTime()}`);
            if (!response.ok) {
                indicator.attr('title', '检查更新失败');
                return;
            }
            const remoteScriptContent = await response.text();
            const latestVersion = remoteScriptContent.match(/@version\s+([\d.]+)/)?.[1];

            if (latestVersion && this.CURRENT_SCRIPT_VERSION !== latestVersion) {
                indicator.text(`v${this.CURRENT_SCRIPT_VERSION} (new!)`);
                indicator.addClass('update-available');
                indicator.attr('title', `点击更新到 v${latestVersion}`);

                indicator.off('click.update').on('click.update', () => {
                    alert('档案库的法则限制了直接的文件覆写。\n\n作为替代，将为您打开新版本的源文件地址。请在新打开的页面中手动执行安装/更新操作，然后刷新本页面。');
                    window.open(this.SCRIPT_RAW_URL, '_blank');
                });
            } else {
                 indicator.attr('title', '当前已是最新版本');
            }
        } catch (error) {
            console.error('[模块-模型显示] 检查更新失败:', error);
            indicator.attr('title', `检查更新时出错: ${error.message}`);
        }
    },
}; // <--- 此处是修正的关键：添加了缺失的分号

// ###################################################################
//
//  模块 2: 输入框美化模块 (Placeholder Beautifier) - V2
//
// ###################################################################
const PlaceholderModule = {
    // 2.0 模块内部状态和常量
    name: 'worldbook_placeholder', // 保持旧名称以兼容已有设置
    iframeWindow: null,
    placeholderObserver: null,
    TEXTAREA_ID: 'send_textarea',

    // 2.1 默认设置 (新增自定义占位符)
    defaultSettings: Object.freeze({
        enabled: true,
        customPlaceholder: '', // 用于存储用户自定义的全局占位符
    }),

    // 2.2 模块初始化入口
    init() {
        if (!this.getSettings().enabled) {
            console.log('[模块-输入框] 已禁用，跳过初始化。');
            return;
        }

        // 无论何种模式，都需要等待Iframe，因为核心API在其中
        this.waitForIframe().then(() => {
            // 始终监听角色切换，因为用户可能随时清空自定义文本，回到世界书模式
            if (script.eventSource && script.event_types) {
                script.eventSource.on(script.event_types.CHAT_CHANGED, this.onCharacterSwitch.bind(this));
            } else {
                console.error('[模块-输入框] 致命错误：无法访问 script.eventSource。');
            }
            // 始终观察输入框本身的变化
            this.startPlaceholderObserver();
            // 首次加载时立即应用一次逻辑
            this.applyLogic();
            console.log('[模块-输入框] 初始化成功。');
        });
    },

    // 2.3 设置与界面 (完全重写)
    getSettings() {
        if (!extension_settings[this.name]) {
            extension_settings[this.name] = { ...this.defaultSettings };
        }
        // 确保新设置项存在
        if (extension_settings[this.name].customPlaceholder === undefined) {
            extension_settings[this.name].customPlaceholder = this.defaultSettings.customPlaceholder;
        }
        return extension_settings[this.name];
    },

    renderSettingsHtml() {
        const settings = this.getSettings();
        return `
            <div id="placeholder_options_wrapper">
                <hr>
                <h3 class="sub-header">输入框文字替换</h3>
                <div class="form-group">
                    <p class="sub-label">在此处输入全局替换文本。如果留空并应用，将恢复为读取世界书“输入框”条目或默认提示。</p>
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
            this.applyLogic(); // 立即应用新逻辑
            alert('输入框提示已更新！');
        });
    },

    // 2.4 核心逻辑 (完全重写)
    async applyLogic() {
        if (!this.getSettings().enabled) return;

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea) return;

        // 停止旧的观察者，防止重复触发
        if (this.placeholderObserver) this.placeholderObserver.disconnect();

        const customText = this.getSettings().customPlaceholder;

        // 优先使用用户自定义的全局文本
        if (customText && customText.trim() !== '') {
            textarea.placeholder = customText;
            console.log(`[模块-输入框] 已应用自定义全局提示: "${customText}"`);
        } else {
            // 如果自定义文本为空，则回退到世界书逻辑
            await this.applyWorldBookLogic(textarea);
        }

        // 重新启动观察者
        this.startPlaceholderObserver();
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
                        const targetEntry = activeEntries.find(entry => entry.comment === "输入框");
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
        console.log(`[模块-输入框] 已应用世界书/默认提示: "${finalPlaceholder}"`);
    },

    // 角色切换时，只需重新应用主逻辑即可
    async onCharacterSwitch() {
        console.log('%c[模块-输入框] 角色切换，重新应用逻辑...', 'color: cyan;');
        await this.applyLogic();
    },

    startPlaceholderObserver() {
        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (!textarea || !this.getSettings().enabled) return;

        this.placeholderObserver = new MutationObserver((mutationsList) => {
            // 当其他脚本（如连接状态）修改placeholder时，我们的逻辑需要重新覆盖它
            const currentPlaceholder = textarea.placeholder;
            const customText = this.getSettings().customPlaceholder;
            const isCustomMode = customText && customText.trim() !== '';

            // 如果当前显示的不是我们的目标文本，则强制恢复
            if (isCustomMode && currentPlaceholder !== customText) {
                this.applyLogic();
            } else if (!isCustomMode) {
                // 在世界书模式下，情况复杂，为避免循环，只在关键时刻触发
                // 这里的逻辑可以简化为相信onCharacterSwitch已经处理了大部分情况
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

// ###################################################################
//
//  主程序: 初始化与UI集成
//
// ###################################################################

function initializeCombinedExtension() {
    try {
        // 1. 定义最终的UI布局
        const combinedSettingsHtml = `
            <div id="misc_beautify_settings" class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>小美化集</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>
                <div class="inline-drawer-content" style="display: none;">
                    <!-- 开关区域: 布局已根据您的要求精确重构 -->
                    <div class="version-row">
                        <span class="version-indicator" id="model_display_version_indicator"></span>
                    </div>
                    <div class="misc-beautify-switch-row">
                        <label class="switch">
                            <input type="checkbox" id="misc_model_display_toggle" ${ModelDisplayModule.getSettings().enabled ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                        <label for="misc_model_display_toggle" class="misc-beautify-label">模型名称显示</label>
                    </div>

                    <div class="misc-beautify-switch-row">
                         <label class="switch">
                            <input type="checkbox" id="misc_placeholder_toggle" ${PlaceholderModule.getSettings().enabled ? 'checked' : ''}>
                            <span class="slider round"></span>
                        </label>
                        <label for="misc_placeholder_toggle" class="misc-beautify-label">输入框文字替换</label>
                    </div>

                    <!-- 模块设置区域 -->
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
                    justify-content: flex-end; /* 右对齐版本号 */
                    padding: 0 5px 5px;
                }
                .misc-beautify-switch-row {
                    display: flex;
                    align-items: center;
                    padding: 8px 0; /* 增加垂直间距 */
                }
                .misc-beautify-label {
                    margin-left: 10px; /* 开关与文字之间的间距 */
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

        // 模型显示开关
        $(document).on('change', '#misc_model_display_toggle', (event) => {
            const isEnabled = $(event.currentTarget).is(':checked');
            ModelDisplayModule.getSettings().enabled = isEnabled;
            $('#model_display_settings_panel').toggle(isEnabled);
            ModelDisplayModule.rerenderAllModelNames(!isEnabled);
            if (isEnabled) ModelDisplayModule.startObservers(); else ModelDisplayModule.stopObservers();
            script.saveSettingsDebounced();
        });

        // 输入框替换开关
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
