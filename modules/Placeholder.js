import * as script from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

export const PlaceholderModule = {
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
        sloganPrompt: ['slogan内容变量内仅包含当前角色极具个人风格的语录，格式模仿座右铭、网络用语、另类名言、爱语、吐槽等形式，具备黑色幽默感，最长 15 个汉字。','语录不要重复，也不要额外解释。'].join('\n'),
        sloganPosition: 'append_last_user', // 新增：默认位置设为追加到最后一条用户消息
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
            console.log('[模块-输入框] 初始化成功。启动智能透明嗅探协议。');
        });
    },

    cleanup() {
        if (this._modifiedRuleState.rule) {
            try {
                this._modifiedRuleState.rule.style.setProperty('content', this._modifiedRuleState.originalContent);
            } catch (e) {}
        }
        this._modifiedRuleState = { rule: null, originalContent: '' };

        const nativeStyleTag = document.getElementById('worldbook-slogan-native-style');
        if (nativeStyleTag) nativeStyleTag.remove();

        const textarea = document.getElementById(this.TEXTAREA_ID);
        if (textarea) {
            textarea.placeholder = this.resolveFallbackPlaceholder(textarea);
        }
    },

    stopPlaceholderObserver() {
        // 防止面板开关报错专用
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
        if (!placeholderText) return;
        const contentEscaped = CSS.escape(placeholderText);
        const beforeRule = this.findPlaceholderBeforeRule();

        // 优先判定是否有纯粹的伪元素渲染
        if (beforeRule) {
            this._modifiedRuleState.rule = beforeRule;
            this._modifiedRuleState.originalContent = beforeRule.style.getPropertyValue('content');
            beforeRule.style.setProperty('content', `"${contentEscaped}"`, 'important');
            textarea.placeholder = ' ';
            return;
        }

        textarea.placeholder = placeholderText;

        const maskInfo = this.isPlaceholderMasked();

        if (maskInfo) {
            let styleTag = document.getElementById('worldbook-slogan-native-style');
            if (!styleTag) {
                styleTag = document.createElement('style');
                styleTag.id = 'worldbook-slogan-native-style';
                document.head.appendChild(styleTag);
            }

            let cssFixes = '';

            if (maskInfo.overrideOpacity) cssFixes += 'opacity: revert !important;\n';
            if (maskInfo.overrideColor) cssFixes += 'color: revert !important;\n';

            styleTag.innerHTML = `
                textarea#send_textarea::placeholder {
                    ${cssFixes}
                }
                textarea#send_textarea::-webkit-input-placeholder {
                    ${cssFixes}
                }
            `;
        } else {
            const styleTag = document.getElementById('worldbook-slogan-native-style');
            if (styleTag) styleTag.remove();
        }
    },

    isPlaceholderMasked() {
        let maskInfo = { overrideOpacity: false, overrideColor: false };

        for (const sheet of document.styleSheets) {
            try {
                if (!sheet.cssRules) continue;
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && rule.selectorText.toLowerCase().includes('send_textarea::placeholder')) {
                        const rawColor = rule.style.getPropertyValue('color');
                        const rawOpacity = rule.style.getPropertyValue('opacity');

                        const color = rawColor ? rawColor.replace(/\s/g, '') : '';
                        const opacity = rawOpacity ? rawOpacity.trim() : '';

                        if (opacity === '0' || opacity === '0.0') {
                            maskInfo.overrideOpacity = true;
                        }
                        if (color === 'transparent' || color === 'rgba(0,0,0,0)') {
                            maskInfo.overrideColor = true;
                        }
                    }
                }
            } catch (e) { continue; }
        }

        if (maskInfo.overrideColor) {
            const textarea = document.getElementById('send_textarea');
            if (textarea) {
                const pStyle = window.getComputedStyle(textarea, '::placeholder');

                const hasShadow = (pStyle.textShadow && pStyle.textShadow !== 'none' && pStyle.textShadow !== '') ||
                                  (pStyle.webkitTextStrokeWidth && parseInt(pStyle.webkitTextStrokeWidth) > 0);

                if (hasShadow) {
                    maskInfo.overrideColor = false;
                }
            }
        }

        return (maskInfo.overrideOpacity || maskInfo.overrideColor) ? maskInfo : false;
    },

    findPlaceholderBeforeRule() {
        for (const sheet of document.styleSheets) {
            try {
                if (!sheet.cssRules) continue;
                for (const rule of sheet.cssRules) {
                    if (rule.selectorText && rule.style) {
                        const sText = rule.selectorText.toLowerCase();
                        const targetsForm = sText.includes('send_textarea') || sText.includes('nonqrformitems');
                        const isPseudo = sText.includes('::before') || sText.includes('::after') || sText.includes(':before') || sText.includes(':after');

                        if (targetsForm && isPseudo) {
                            const rawContent = rule.style.getPropertyValue('content');
                            const contentValue = rawContent ? rawContent.trim() : '';

                            if (contentValue && contentValue !== '""' && contentValue !== "''" && contentValue !== 'none') {
                                return rule;
                            }
                        }
                    }
                }
            } catch (e) { continue; }
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
                <div id="placeholder_panel_auto" class="placeholder-panel" style="${s.placeholderSource === 'auto' ? '' : 'display: none;'}">
                    <p class="sub-label">指令插入位置：</p>
                    <select id="slogan_position_select" class="text_pole" style="margin-bottom: 10px;">
                        <option value="append_last_user" ${s.sloganPosition === 'append_last_user' ? 'selected' : ''}>附加在最后一条用户消息末尾 (推荐)</option>
                        <option value="push_end" ${s.sloganPosition === 'push_end' ? 'selected' : ''}>作为独立系统消息放于最末尾</option>
                        <option value="system_start" ${s.sloganPosition === 'system_start' ? 'selected' : ''}>附加在主系统提示词末尾 (顶部)</option>
                    </select>
                    <p class="sub-label">注入的提示词（别忘记限制回复字数）：</p>
                    <textarea id="slogan_prompt_input" class="text_pole" rows="4">${s.sloganPrompt}</textarea>
                </div>
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
        $(document).on('change', '#slogan_position_select', e => {
            this.getSettings().sloganPosition = $(e.currentTarget).val();
            script.saveSettingsDebounced();
        });
        $(document).on('input', '#worldbook_placeholder_input', e => {
            const content = $(e.currentTarget).val();
            clearTimeout(this.worldbookUpdateDebounce);
            this.worldbookUpdateDebounce = setTimeout(() => {
                this.updateWorldBookFromPanel(content).then(() => { if (this.getSettings().placeholderSource === 'worldbook') this.applyLogic(); });
            }, 500);
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

export const SloganInjectionModule = {
    initialized: false,
    PROMPT_PREFIX: '请在每次正文的末尾额外输出一个隐藏的HTML元素，格式为 `<div hidden class="slogan-container">✦❋{{内容}}</div>`。',
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

        const injectionText = `${this.PROMPT_PREFIX}\n${ps.sloganPrompt || ''}`;
        const positionMode = ps.sloganPosition || 'append_last_user';

        if (positionMode === 'append_last_user') {
            let lastUserIndex = -1;
            for (let i = eventData.chat.length - 1; i >= 0; i--) {
                if (eventData.chat[i].role === 'user') {
                    lastUserIndex = i;
                    break;
                }
            }
            if (lastUserIndex !== -1) {
                eventData.chat[lastUserIndex].content += `\n\n[System note: ${injectionText}]`;
            } else {
                eventData.chat.push({ role: 'system', content: injectionText });
            }
        }
        else if (positionMode === 'system_start') {
            let systemIndex = eventData.chat.findIndex(msg => msg.role === 'system');
            if (systemIndex !== -1) {
                eventData.chat[systemIndex].content += `\n\n${injectionText}`;
            } else {
                eventData.chat.unshift({ role: 'system', content: injectionText });
            }
        }
        else {
            eventData.chat.push({ role: 'system', content: injectionText });
        }
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