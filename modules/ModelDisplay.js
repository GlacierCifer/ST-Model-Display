import * as script from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

export const ModelDisplayModule = {
    name: 'model_display',
    CURRENT_SCRIPT_VERSION: '1.5.0', // 优化精简模式下的前后缀屏蔽逻辑
    modelHistory: {},
    chatContentObserver: null,
    chatContainerObserver: null,
    processingMessages: new Set(),
    pendingProcessing: new Map(),
    iconCache: new Map(),
    failedAutoIcons: new Set(),
    knownBrands: [
        'claude', 'deepseek', 'doubao', 'gemini',
        'glm', 'gpt', 'grok', 'kimi', 'qwen'
    ],
    defaultSettings: Object.freeze({
        enabled: true,
        fontSize: '0.85em',
        prefix: '',
        suffix: '',
        modelNameOverrides: {},
        enableIconSystem: false,
        autoMatchOfficial: true,
        officialColorMode: 'original',
        matchDisplayMode: 'normal',
        iconRules: [],
    }),
    escapeHTML(str) {
        return String(str || '')
            .replace(/&/g, '&a' + 'mp;')
            .replace(/</g, '&l' + 't;')
            .replace(/>/g, '&g' + 't;')
            .replace(/"/g, '&qu' + 'ot;')
            .replace(/'/g, '&#' + '39;');
    },
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
        if (!Array.isArray(settings.iconRules)) {
            settings.iconRules = [];
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

        const rulesHtml = (settings.iconRules || [])
            .map((rule, index) => this.renderIconRuleRow(rule, index))
            .join('');

        return `
        <div id="model_display_options_wrapper">
            <h3 class="sub-header">模型名称显示</h3>
            <div class="form-group">
                <label for="model_display_font_size">字体大小:</label>
                <div><input type="text" id="model_display_font_size" class="text_pole" placeholder="例如: 0.85em" value="${this.escapeHTML(settings.fontSize)}"></div>
            </div>
            <div class="form-group">
                <label for="model_display_prefix">前缀:</label>
                <div><input type="text" id="model_display_prefix" class="text_pole" placeholder="输入前缀..." value="${this.escapeHTML(settings.prefix)}"></div>
            </div>
            <div class="form-group">
                <label for="model_display_suffix">后缀:</label>
                <div><input type="text" id="model_display_suffix" class="text_pole" placeholder="输入后缀..." value="${this.escapeHTML(settings.suffix)}"></div>
            </div>

            <h4 class="sub-header" style="margin-top: 15px;">模型图标系统</h4>
            <div class="form-group">
                <label class="checkbox_label">
                    <input type="checkbox" id="model_display_enable_icons" ${settings.enableIconSystem ? 'checked' : ''}>
                    <strong>开启前缀匹配功能</strong>
                </label>
            </div>

            <div id="icon_system_settings" style="display: ${settings.enableIconSystem ? 'block' : 'none'}; padding-left: 10px; border-left: 3px solid var(--SmartThemeBorderColor, #555); margin-bottom: 10px;">

                <div class="form-group" style="margin-top: 10px;">
                    <label style="display:block; margin-bottom:5px;" title="仅在匹配成功时生效，开启精简也会自动屏蔽上方设定的全局前后缀。">显示模式:</label>
                    <select id="model_display_match_mode" class="text_pole" style="width: 100%;">
                        <option value="normal" ${settings.matchDisplayMode === 'normal' ? 'selected' : ''}>常规: 显示 图标/规则前缀 + 完整模型原名</option>
                        <option value="icon_only" ${settings.matchDisplayMode === 'icon_only' ? 'selected' : ''}>精简: 仅显示匹配的 图标/规则文本</option>
                        <option value="keyword_only" ${settings.matchDisplayMode === 'keyword_only' ? 'selected' : ''}>精简: 仅显示触发了匹配的 关键词</option>
                    </select>
                </div>

                <div class="form-group" style="margin-top: 10px;">
                    <label class="checkbox_label" title="支持识别: Claude, DeepSeek, Doubao, Gemini, GLM, GPT, Grok, Kimi, Qwen">
                        <input type="checkbox" id="model_display_auto_match" ${settings.autoMatchOfficial ? 'checked' : ''}>
                        自动匹配官方图标
                    </label>
                </div>

                <div class="form-group" id="auto_match_settings" style="display: ${settings.autoMatchOfficial ? 'block' : 'none'}; margin-left: 25px; margin-bottom: 10px;">
                    <label style="display:inline-block; margin-right:5px;">官方图标颜色:</label>
                    <select id="model_display_official_color" class="text_pole" style="width: auto; display:inline-block;">
                        <option value="original" ${settings.officialColorMode === 'original' ? 'selected' : ''}>彩色 (原色)</option>
                        <option value="desaturated" ${settings.officialColorMode === 'desaturated' ? 'selected' : ''}>去色 (跟随文本)</option>
                    </select>
                </div>

                <h5 class="sub-header" style="margin-top: 15px;">自定义规则</h5>
                <div id="model_icon_rules_container">${rulesHtml}</div>
                <button id="add_icon_rule_btn" class="menu_button fa-solid fa-plus" style="margin-top: 5px;"> </button>
            </div>
            <hr>

            <h4 class="sub-header" style="margin-top: 15px;">模型名称覆盖</h4>
            <div id="model_name_overrides_container">${overridesHtml}</div>
            <button id="add_model_override_btn" class="menu_button fa-solid fa-plus" style="margin-top: 5px;"> </button>
            <hr>
        </div>`;
    },
    renderOverrideRow(original, custom, index) {
        return `
        <div class="form-group model-override-row" data-index="${index}">
            <input type="text" class="text_pole original-name" placeholder="原始模型名称" value="${this.escapeHTML(original)}">
            <span style="margin: 0 5px;">→</span>
            <input type="text" class="text_pole custom-name" placeholder="自定义显示名称" value="${this.escapeHTML(custom)}">
            <button class="menu_button fa-solid fa-trash-can delete-override-btn" style="margin-left: 5px;"></button>
        </div>`;
    },
    renderIconRuleRow(rule = {}, index) {
        const typeText = rule.type === 'text' ? 'selected' : '';
        const typeCustom = rule.type === 'custom' ? 'selected' : '';
        const customSvgSafe = this.escapeHTML(rule.customSvg);
        const customTextSafe = rule.customTextPrefix !== undefined ? this.escapeHTML(rule.customTextPrefix) : '';
        const keywordSafe = this.escapeHTML(rule.keyword);

        return `
        <div class="form-group icon-rule-row" data-index="${index}" style="border: 1px solid var(--SmartThemeBorderColor, #555); padding: 10px; margin-bottom: 10px; border-radius: 5px;">
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                <label style="white-space: nowrap;">关键词:</label>
                <input type="text" class="text_pole rule-keyword" placeholder="包含此词触发规则" value="${keywordSafe}" style="flex: 1;">

                <label style="white-space: nowrap;">行为:</label>
                <select class="text_pole rule-type" style="flex: 1;">
                    <option value="text" ${typeText}>文本前缀</option>
                    <option value="custom" ${typeCustom}>自定义SVG</option>
                </select>
                <button class="menu_button fa-solid fa-trash-can delete-rule-btn" title="删除规则"></button>
            </div>

            <div class="rule-text-settings" style="display: ${rule.type === 'text' || !rule.type ? 'block' : 'none'};">
                <label>文本前缀:</label>
                <input type="text" class="text_pole rule-custom-text" placeholder="输入你想显示的前缀，留空则什么都不显示" value="${customTextSafe}">
            </div>

            <div class="rule-custom-settings" style="display: ${rule.type === 'custom' ? 'block' : 'none'};">
                <label>自定义svg:</label>
                <textarea class="text_pole rule-custom-svg" rows="3" placeholder="在此输入 <svg>...</svg> 标签">${customSvgSafe}</textarea>
            </div>
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

        $(document).on('change', '#model_display_enable_icons', (e) => {
            const currentSettings = this.getSettings();
            currentSettings.enableIconSystem = $(e.currentTarget).is(':checked');
            if (currentSettings.enableIconSystem) $('#icon_system_settings').slideDown();
            else $('#icon_system_settings').slideUp();
            this.saveSettings();
        });

        $(document).on('change', '#model_display_match_mode', (e) => {
            this.getSettings().matchDisplayMode = $(e.currentTarget).val();
            this.saveSettings();
        });

        $(document).on('change', '#model_display_auto_match', (e) => {
            const currentSettings = this.getSettings();
            currentSettings.autoMatchOfficial = $(e.currentTarget).is(':checked');
            if (currentSettings.autoMatchOfficial) $('#auto_match_settings').slideDown();
            else $('#auto_match_settings').slideUp();
            this.saveSettings();
        });
        $(document).on('change', '#model_display_official_color', (e) => {
            this.getSettings().officialColorMode = $(e.currentTarget).val();
            this.saveSettings();
        });

        $(document).on('change', '.rule-type', (e) => {
            const row = $(e.currentTarget).closest('.icon-rule-row');
            const type = $(e.currentTarget).val();
            row.find('.rule-text-settings').css('display', type === 'text' ? 'block' : 'none');
            row.find('.rule-custom-settings').css('display', type === 'custom' ? 'block' : 'none');
            this.updateRulesFromUI();
        });
        $(document).on('click', '#add_icon_rule_btn', () => {
            const newIndex = $('#model_icon_rules_container .icon-rule-row').length;
            $('#model_icon_rules_container').append(this.renderIconRuleRow({ type: 'text', customTextPrefix: '' }, newIndex));
        });
        $(document).on('click', '.delete-rule-btn', (e) => {
            $(e.currentTarget).closest('.icon-rule-row').remove();
            this.updateRulesFromUI();
        });
        $(document).on('input', '.icon-rule-row input, .icon-rule-row textarea, .icon-rule-row select', () => {
            this.updateRulesFromUI();
        });
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
    updateRulesFromUI() {
        const newRules = [];
        $('.icon-rule-row').each(function() {
            const keyword = $(this).find('.rule-keyword').val().trim();
            const type = $(this).find('.rule-type').val();
            const customTextPrefix = $(this).find('.rule-custom-text').val() || '';
            const customSvg = $(this).find('.rule-custom-svg').val().trim();

            if (keyword) {
                newRules.push({ keyword, type, customTextPrefix, customSvg });
            }
        });
        this.getSettings().iconRules = newRules;
        this.saveSettings();
    },
    rerenderAllModelNames(revert = false) {
        document.querySelectorAll('.model-display-wrapper').forEach(el => el.remove());

        document.querySelectorAll('#chat .mes .timestamp-icon').forEach(icon => {
            if (revert) {
                icon.style.display = '';
                if (icon.dataset.modelInjected === 'true') {
                    icon.innerHTML = '';
                    icon.style.width = '';
                    icon.style.height = '';
                    icon.removeAttribute('data-model-injected');
                }
            } else {
                icon.dataset.modelInjected = 'false';
                icon.style.display = '';
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
    async fetchOfficialIcon(filename, silent = false) {
        if (!filename) return '';
        if (this.iconCache.has(filename)) return this.iconCache.get(filename);
        try {
            const url = new URL(`./model_icons/${filename}`, import.meta.url).href;
            const response = await fetch(url);
            if (response.ok) {
                const text = await response.text();
                this.iconCache.set(filename, text);
                return text;
            } else {
                if (!silent) console.warn(`[模块-模型显示] 官方图标加载失败 (${response.status}):`, url);
                this.iconCache.set(filename, '');
            }
        } catch (e) {
            if (!silent) console.warn('[模块-模型显示] 无法加载图标:', filename, e);
            this.iconCache.set(filename, '');
        }
        return '';
    },
    async getAutoMatchedSvg(modelName) {
        if (!modelName) return null;
        const lowerName = modelName.toLowerCase();
        let matchedKeyword = this.knownBrands.find(brand => lowerName.includes(brand));
        if (!matchedKeyword || this.failedAutoIcons.has(matchedKeyword)) return null;
        const svgStr = await this.fetchOfficialIcon(`${matchedKeyword}.svg`, false);
        if (svgStr) {
            return svgStr;
        } else {
            this.failedAutoIcons.add(matchedKeyword);
            return null;
        }
    },
    makeSvgIdsUnique(svgStr) {
        if (!svgStr) return '';
        const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        return String(svgStr)
            .replace(/id="([^"]+)"/g, `id="$1-${uniqueSuffix}"`)
            .replace(/url\(#([^)]+)\)/g, `url(#$1-${uniqueSuffix})`);
    },
    applyColorMode(svgStr, colorMode) {
        if (!svgStr) return '';
        if (colorMode === 'desaturated') {
            let result = svgStr.replace(/fill="(?!(none|transparent))[^"]+"/gi, 'fill="currentColor"');
            result = result.replace(/stroke="(?!(none|transparent))[^"]+"/gi, 'stroke="currentColor"');
            result = result.replace(/style="[^"]*"/gi, '');
            if (!result.includes('fill=')) {
                result = result.replace(/<svg\b/i, '<svg fill="currentColor" ');
            }
            return result;
        }
        return svgStr;
    },
    async processIcon(iconSvg, modelName) {
        if (iconSvg.dataset.modelInjected === 'true') return;
        iconSvg.dataset.modelInjected = 'true';

        const settings = this.getSettings();
        let displayName = this.getDisplayName(modelName);

        let iconHtml = '';
        let activePrefix = settings.prefix;
        let activeSuffix = settings.suffix; // 新增：分离后缀变量以便于被精简模式接管

        let hasMatch = false;
        let matchedKeywordForDisplay = '';
        let matchedRuleCache = null;

        if (settings.enableIconSystem) {
            let matchedRule = null;
            if (settings.iconRules && Array.isArray(settings.iconRules)) {
                for (const rule of settings.iconRules) {
                    if (rule.keyword && modelName.toLowerCase().includes(rule.keyword.toLowerCase())) {
                        matchedRule = rule;
                        break;
                    }
                }
            }

            if (matchedRule) {
                hasMatch = true;
                matchedKeywordForDisplay = matchedRule.keyword;
                matchedRuleCache = matchedRule;

                if (matchedRule.type === 'custom' && matchedRule.customSvg) {
                    iconHtml = this.makeSvgIdsUnique(matchedRule.customSvg);
                    activePrefix = '';
                } else if (matchedRule.type === 'text') {
                    iconHtml = '';
                    activePrefix = matchedRule.customTextPrefix !== undefined ? matchedRule.customTextPrefix : settings.prefix;
                }
            }
            else if (settings.autoMatchOfficial) {
                let matchedOfficial = this.knownBrands.find(brand => modelName.toLowerCase().includes(brand));
                if (matchedOfficial) {
                    let svgStr = await this.getAutoMatchedSvg(modelName);
                    if (svgStr) {
                        hasMatch = true;
                        matchedKeywordForDisplay = matchedOfficial;
                        svgStr = this.makeSvgIdsUnique(svgStr);
                        iconHtml = this.applyColorMode(svgStr, settings.officialColorMode);
                        activePrefix = '';
                    }
                }
            }
        }

        // ====== 核心拦截/过滤修改区域 ======
        if (hasMatch && settings.matchDisplayMode && settings.matchDisplayMode !== 'normal') {
            // 一旦进入精简模式，立刻抛弃全局后缀
            activeSuffix = '';

            if (settings.matchDisplayMode === 'icon_only') {
                displayName = '';
                // 仅显示图标的情况下，如果在自定义规则里选的是"文本前缀"模式且有填值，则使用该自定义文本，否则抛弃全局前缀
                if (matchedRuleCache && matchedRuleCache.type === 'text') {
                    activePrefix = matchedRuleCache.customTextPrefix !== undefined ? matchedRuleCache.customTextPrefix : '';
                } else {
                    activePrefix = '';
                }
            } else if (settings.matchDisplayMode === 'keyword_only') {
                displayName = matchedKeywordForDisplay;
                iconHtml = '';
                activePrefix = ''; // 关键词模式下强制抛弃所有全局前缀
            }
        }
        // =====================================

        const fullText = `${activePrefix}${displayName}${activeSuffix}`;

        iconSvg.style.display = 'none';

        const wrapper = document.createElement('span');
        wrapper.className = 'model-display-wrapper';
        wrapper.style.display = 'inline-flex';
        wrapper.style.alignItems = 'center';
        wrapper.style.gap = '5px';
        wrapper.style.fontSize = settings.fontSize;
        wrapper.style.color = 'var(--underline_text_color)';
        wrapper.style.verticalAlign = 'middle';
        wrapper.style.marginLeft = '4px';

        let innerContent = '';
        if (iconHtml) {
            innerContent += `<span class="model-icon-container" style="display:flex;align-items:center;width:1.2em;height:1.2em;">${iconHtml}</span>`;
        }
        innerContent += `<span class="model-text-container">${fullText}</span>`;

        wrapper.innerHTML = innerContent;

        const svgInside = wrapper.querySelector('.model-icon-container svg');
        if (svgInside) {
            svgInside.style.width = '100%';
            svgInside.style.height = '100%';
        }

        iconSvg.parentNode.insertBefore(wrapper, iconSvg.nextSibling);
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
        indicator.text(`v${this.CURRENT_SCRIPT_VERSION}`).css('cursor', 'default').attr('title', '这是一个带精简过滤功能的修改版，无法自动检查更新。');
    }
};