import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

const MODULE_NAME = 'model_display';

// -------------------------------------------------------------------
// 1. 所有辅助函数定义 (与之前版本相同)
// -------------------------------------------------------------------

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

function saveSettings() {
    script.saveSettingsDebounced();
    rerenderAllModelNames();
}

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

function bindSettingsEvents() {
    const settings = getSettings();
    $(document).off('change.model_display').off('input.model_display').off('click.model_display');

    $(document).on('change.model_display', '#model_display_enabled', function() {
        settings.enabled = $(this).is(':checked');
        $('#model_display_options').toggle(settings.enabled);
        rerenderAllModelNames(!settings.enabled);
        script.saveSettingsDebounced();

        if (settings.enabled) {
            startObserver();
        } else {
            stopObserver();
        }
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

function applyFontCss(url) {
    $('#model_display_dynamic_font').remove();
    const style = document.createElement('style');
    style.id = 'model_display_dynamic_font';
    style.textContent = `@import url("${url}");`;
    document.head.appendChild(style);
}

function rerenderAllModelNames(revert = false) {
    document.querySelectorAll('#chat .mes .timestamp-icon[data-model-injected="true"]').forEach(icon => {
        if (revert) {
            icon.innerHTML = '';
            icon.style.width = '';
            icon.style.height = '';
            icon.removeAttribute('data-model-injected');
        } else {
            icon.dataset.modelInjected = 'false';
            processLatestMessage(icon.closest('.mes'));
        }
    });
}

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
        } catch (e) { console.error("[模型名称脚本] 渲染SVG时出错:", e); }
    });
}

// -------------------------------------------------------------------
// 2. 核心逻辑: 完全复刻自你的可用代码
// -------------------------------------------------------------------

let chatObserver = null;
let debounceTimer; // 用于延时处理

// 【修正】这个函数不再接收参数，而是自己去寻找最后一条消息
function processLatestMessage() {
    const lastMessage = document.querySelector('#chat .mes:last-of-type');
    if (!lastMessage || lastMessage.getAttribute('is_user') === 'true') {
        return;
    }
    const iconSvg = deepQuerySelector('.icon-svg.timestamp-icon', lastMessage);
    if (iconSvg) {
        const modelName = getCurrentModelName(lastMessage);
        if (modelName) {
            processIcon(iconSvg, modelName);
        }
    }
}

function startObserver() {
    if (chatObserver) return;
    const chatNode = document.getElementById('chat');
    if (!chatNode) {
        setTimeout(startObserver, 500);
        return;
    }

    // 【修正】回调函数完全复刻你的可用代码逻辑
    const observerCallback = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(processLatestMessage, 250);
    };

    chatObserver = new MutationObserver(observerCallback);
    // 使用 subtree:true 来确保能监听到所有深层变化
    chatObserver.observe(chatNode, { childList: true, subtree: true });
    console.log('[动态显示模型名称] 最终版 MutationObserver 已启动。');
}

function stopObserver() {
    if (chatObserver) {
        chatObserver.disconnect();
        chatObserver = null;
        console.log('[动态显示模型名称] MutationObserver 已停止。');
    }
}

// -------------------------------------------------------------------
// 3. 插件入口点 (与之前版本相同)
// -------------------------------------------------------------------

function initializeExtension() {
    try {
        $('#extensions_settings').append(renderSettingsHtml());
        bindSettingsEvents();
        applyFontCss(getSettings().fontCssUrl);

        if (getSettings().enabled) {
            startObserver();
        }
        console.log('[动态显示模型名称] 插件完全初始化成功。');

    } catch (e) {
        console.error('[动态显示模型名称] 初始化过程中发生致命错误:', e);
    }
}

const settingsCheckInterval = setInterval(() => {
    if ($('#extensions_settings').length) {
        clearInterval(settingsCheckInterval);
        initializeExtension();
    }
}, 500);
