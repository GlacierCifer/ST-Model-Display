import { addOneMessage, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// 模块名称，用于在SillyTavern的全局设置中存储数据
const MODULE_NAME = 'model_display';

// 定义所有可配置项的默认值
const defaultSettings = Object.freeze({
    enabled: true,
    fontSize: '0.85em',
    prefix: '|',
    suffix: '|',
    fontCssUrl: 'https://fontsapi.zeoseven.com/371/main/result.css',
    savedFontUrls: [
        'https://fontsapi.zeoseven.com/371/main/result.css',
    ],
});

// 获取设置的辅助函数
function getSettings() {
    if (!extension_settings[MODULE_NAME]) {
        extension_settings[MODULE_NAME] = { ...defaultSettings };
    }
    for (const key of Object.keys(defaultSettings)) {
        if (!Object.hasOwnProperty.call(extension_settings[MODULE_NAME], key)) {
            extension_settings[MODULE_NAME][key] = defaultSettings[key];
        }
    }
    return extension_settings[MODULE_NAME];
}

// 保存设置的辅助函数
function saveSettings() {
    saveSettingsDebounced();
    rerenderAllModelNames();
}

// 生成设置面板的HTML代码
function renderSettingsHtml() {
    const settings = getSettings();
    return `
        <div id="model_display_settings" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>动态显示模型名称</b>
                <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label">
                    <input type="checkbox" id="model_display_enabled" ${settings.enabled ? 'checked' : ''}>
                    <span>启用插件</span>
                </label>
                <hr>
                <div id="model_display_options" ${!settings.enabled ? 'style="display: none;"' : ''}>
                    <div class="form-group">
                        <label for="model_display_font_size">字体大小 (例如: 0.85em, 12px)</label>
                        <input type="text" id="model_display_font_size" class="text_pole" value="${settings.fontSize}">
                    </div>
                    <div class="form-group">
                        <label for="model_display_prefix">前缀</label>
                        <input type="text" id="model_display_prefix" class="text_pole" value="${settings.prefix}">
                    </div>
                    <div class="form-group">
                        <label for="model_display_suffix">后缀</label>
                        <input type="text" id="model_display_suffix" class="text_pole" value="${settings.suffix}">
                    </div>
                    <hr>
                    <div class="form-group">
                        <label for="model_display_font_css_url_new">字体 CSS 链接</label>
                        <div style="display: flex; gap: 5px;">
                           <input type="text" id="model_display_font_css_url_new" class="text_pole" placeholder="粘贴新的字体CSS链接...">
                           <button id="model_display_apply_font" class="primary-button">应用</button>
                        </div>
                    </div>
                     <div class="form-group">
                        <label for="model_display_saved_fonts">已保存字体</label>
                        <select id="model_display_saved_fonts" class="text_pole">
                            ${settings.savedFontUrls.map(url => `<option value="${url}" ${url === settings.fontCssUrl ? 'selected' : ''}>${url}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 为UI控件绑定事件
function bindSettingsEvents() {
    const settings = getSettings();

    $(document).off('change.model_display').off('input.model_display').off('click.model_display');

    $(document).on('change.model_display', '#model_display_enabled', function() {
        settings.enabled = $(this).is(':checked');
        $('#model_display_options').toggle(settings.enabled);
        saveSettings();
        if (!settings.enabled) rerenderAllModelNames(true);
    });

    $(document).on('input.model_display', '#model_display_font_size', function() { settings.fontSize = $(this).val(); saveSettings(); });
    $(document).on('input.model_display', '#model_display_prefix', function() { settings.prefix = $(this).val(); saveSettings(); });
    $(document).on('input.model_display', '#model_display_suffix', function() { settings.suffix = $(this).val(); saveSettings(); });

    $(document).on('click.model_display', '#model_display_apply_font', function() {
        const newUrl = $('#model_display_font_css_url_new').val().trim();
        if (newUrl) {
            applyFontCss(newUrl);
            settings.fontCssUrl = newUrl;
            if (!settings.savedFontUrls.includes(newUrl)) {
                settings.savedFontUrls.push(newUrl);
            }
            $('#model_display_settings').replaceWith(renderSettingsHtml());
            bindSettingsEvents();
            saveSettings();
        }
    });

    $(document).on('change.model_display', '#model_display_saved_fonts', function() {
        const selectedUrl = $(this).val();
        applyFontCss(selectedUrl);
        settings.fontCssUrl = selectedUrl;
        saveSettings();
    });
}

// 动态应用/切换字体
function applyFontCss(url) {
    $('#model_display_dynamic_font').remove();
    const style = document.createElement('style');
    style.id = 'model_display_dynamic_font';
    style.textContent = `@import url("${url}");`;
    document.head.appendChild(style);
}

// 强制刷新所有已显示的名称
function rerenderAllModelNames(revert = false) {
    if (revert) {
        // 最简单可靠的恢复方法是刷新页面
        location.reload();
        return;
    }
    document.querySelectorAll('#chat .mes .timestamp-icon[data-model-injected="true"]').forEach(icon => {
        icon.dataset.modelInjected = 'false';
        processLatestMessage(icon.closest('.mes'));
    });
}

// 核心功能：DOM查询与SVG处理
function deepQuerySelector(selector, root = document) {
    try {
        const found = root.querySelector(selector); if (found) return found;
        for (const element of root.querySelectorAll('*')) {
            if (element.shadowRoot) {
                const foundInShadow = deepQuerySelector(selector, element.shadowRoot);
                if (foundInShadow) return foundInShadow;
            }
        }
    } catch (e) {}
    return null;
}

function getCurrentModelName(messageElement) {
    const svgTitle = deepQuerySelector('.timestamp-icon title', messageElement);
    if (svgTitle && svgTitle.textContent.includes(' - ')) return svgTitle.textContent.split(' - ')[1];
    return null;
}

function processIcon(iconSvg, modelName) {
    if (iconSvg.dataset.modelInjected === 'true') return;

    const settings = getSettings();
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
            console.error("[模型名称脚本] 测量或设定尺寸时出错:", e);
        }
    });
}

function processLatestMessage(messageElement) {
    if (!messageElement) return;
    const iconSvg = deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
    if (iconSvg) {
        const modelName = getCurrentModelName(messageElement);
        if (modelName) processIcon(iconSvg, modelName);
    }
}

// 函数劫持部分 (最终优化版)
const originalAddOneMessage = addOneMessage;
const newAddOneMessage = function(name, mes, is_user, ...other_args) {
    const result = originalAddOneMessage.apply(this, arguments);
    if (is_user || !getSettings().enabled) {
        return result;
    }
    try {
        processLatestMessage(document.querySelector('#chat .mes:last-of-type'));
    } catch (error) {
        console.error('[动态显示模型名称] 处理新消息时出错:', error);
    }
    return result;
};
Object.defineProperty(window, 'addOneMessage', {
    value: newAddOneMessage,
    writable: true,
    configurable: true,
});

// 【插件入口点】 - 使用轮询等待UI加载 (最终版)

function initializeExtension() {
    // 1. 将设置面板插入到SillyTavern的扩展设置区域
    try {
        $('#extensions_settings').append(renderSettingsHtml());
    } catch (e) {
        console.error('[动态显示模型名称] 注入UI时出错:', e);
        return; // 出错则停止
    }

    // 2. 为面板上的所有控件绑定事件
    bindSettingsEvents();

    // 3. 初始化时应用一次保存的字体
    applyFontCss(getSettings().fontCssUrl);

    console.log('[动态显示模型名称] 扩展加载成功，UI已注入，addOneMessage已劫持。');
}

// 使用一个定时器来轮询，直到找到目标元素 #extensions_settings
const settingsCheckInterval = setInterval(() => {
    // 检查SillyTavern的扩展设置容器是否已经存在于页面上
    if ($('#extensions_settings').length) {
        // 如果找到了，就停止轮询，避免不必要的性能消耗
        clearInterval(settingsCheckInterval);
        // 执行我们的初始化函数
        initializeExtension();
    }
}, 500); // 每 500 毫秒检查一次

