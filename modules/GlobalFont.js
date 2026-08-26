import * as script from '../../../../../script.js';
import { extension_settings } from '../../../../extensions.js';

export const GlobalFontModule = {
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

export const FontObserverModule = {
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