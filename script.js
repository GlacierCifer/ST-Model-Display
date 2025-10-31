import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

// ==UserScript==
// @version      1.0
// ==/UserScript==

const CURRENT_SCRIPT_VERSION = '1.0'; 

// -------------------------------------------------------------------
// 0. 全局常量与状态
// -------------------------------------------------------------------

const MODULE_NAME = 'model_display';
let modelHistory = {}; // 用于存储 { messageId: modelName } 的历史记录

let chatContentObserver = null; // 监听 #chat 内部的新消息
let chatContainerObserver = null; // 监听 #chat 容器本身的变化
let debounceTimer; // 用于防抖动

// -------------------------------------------------------------------
// 1. 设置与界面
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

    // 新增逻辑：确保 "none" 选项始终存在且位于列表顶部
    const settings = extension_settings[MODULE_NAME];
    const urls = settings.savedFontUrls;
    const noneIndex = urls.indexOf('none');

    if (noneIndex > -1) {
        urls.splice(noneIndex, 1); // 如果已存在，先从原位置移除
    }
    urls.unshift('none'); // 添加到数组的开头
    settings.savedFontUrls = [...new Set(urls)]; // 使用 Set 去除重复项，保证唯一性

    return settings;
}

function saveSettings() {
    script.saveSettingsDebounced();
    rerenderAllModelNames();
}

function renderSettingsHtml() {
    const settings = getSettings();
    const optionsHtml = settings.savedFontUrls.map(url => {
        const text = url === 'none' ? '默认字体 (None)' : url;
        const selected = url === settings.fontCssUrl ? 'selected' : '';
        return `<option value="${url}" ${selected}>${text}</option>`;
    }).join('');

    return `
        <div id="model_display_settings" class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>显示模型名称</b>
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
                        <label for="model_display_font_size">字体大小 (例如: 0.85em)</label>
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
                           <button id="model_display_apply_font" class="menu_button interactable">应用</button>
                        </div>
                    </div>
                     <div class="form-group">
                        <label for="model_display_saved_fonts">已保存字体</label>
                        <select id="model_display_saved_fonts" class="text_pole">
                            ${optionsHtml}
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
            startObservers();
            restoreAllFromHistory(); // 启用时立即恢复一次
        } else {
            stopObservers();
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
    // 无论如何，先移除旧的自定义字体样式
    $('#model_display_dynamic_font').remove();

    // 如果选择的是 'none' 或者 url 为空，则直接返回，实现恢复默认
    if (url === 'none' || !url) {
        console.log('[模型名称脚本] 已恢复为默认字体。');
        rerenderAllModelNames(); // 重新渲染以应用默认字体
        return;
    }

    // 如果是有效的 URL，则创建并添加新的样式标签
    const style = document.createElement('style');
    style.id = 'model_display_dynamic_font';
    style.textContent = `@import url("${url}");`;
    document.head.appendChild(style);
    console.log(`[模型名称脚本] 已应用新字体: ${url}`);
    rerenderAllModelNames(); // 重新渲染以应用新字体
}

// -------------------------------------------------------------------
// 2. 核心显示与辅助函数
// -------------------------------------------------------------------

function rerenderAllModelNames(revert = false) {
    document.querySelectorAll('#chat .mes .timestamp-icon[data-model-injected="true"]').forEach(icon => {
        if (revert) {
            icon.innerHTML = '';
            icon.style.width = '';
            icon.style.height = '';
            icon.removeAttribute('data-model-injected');
        } else {
            // 在恢复模式下，让 restoreAllFromHistory 来处理
            icon.dataset.modelInjected = 'false';
        }
    });
    // 如果插件仍然启用，则触发一次恢复扫描
    if (!revert && getSettings().enabled) {
        restoreAllFromHistory();
    }
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
// 3. 历史记录与双重观察者逻辑
// -------------------------------------------------------------------

/**
 * 处理单个消息，读取模型名称并写入历史记录。
 * 内部包含一个短暂延时，以确保模型名称已加载。
 * @param {HTMLElement} messageElement - .mes 消息元素
 */
function processAndRecordMessage(messageElement) {
    if (!messageElement || messageElement.getAttribute('is_user') === 'true') return;

    // 给应用程序足够的时间来将模型名称写入DOM。
    setTimeout(() => {
        const iconSvg = deepQuerySelector('.icon-svg.timestamp-icon', messageElement);
        const idElement = messageElement.querySelector('.mesIDDisplay');
        if (!iconSvg || !idElement) return;

        const messageId = idElement.textContent.replace('#', '');
        const modelName = getCurrentModelName(messageElement);

        if (messageId && modelName) {
            // 成功获取，记录历史并显示
            modelHistory[messageId] = modelName;
            processIcon(iconSvg, modelName);
        } else {
            // 如果延迟后仍然失败，在控制台发出警告，方便调试
            console.warn(`[模型名称脚本] 延迟后仍无法获取楼层 #${messageId} 的模型名称。`);
        }
    }, 350); // 350毫秒对于大多数情况是安全且充足的。
}

/**
 * 扫描所有消息，并根据历史记录恢复模型标签显示
 */
function restoreAllFromHistory() {
    if (!getSettings().enabled) return;

    setTimeout(() => {
        const messages = document.querySelectorAll('#chat .mes:not([is_user="true"])');
        messages.forEach(message => {
            const iconSvg = deepQuerySelector('.icon-svg.timestamp-icon', message);
            const idElement = message.querySelector('.mesIDDisplay');

            if (iconSvg && idElement && iconSvg.dataset.modelInjected !== 'true') {
                const messageId = idElement.textContent.replace('#', '');
                if (modelHistory[messageId]) {
                    processIcon(iconSvg, modelHistory[messageId]);
                }
            }
        });
        console.log('[模型名称脚本] 完成历史记录恢复扫描。');
    }, 250);
}

/**
 * 启动所有监听器
 */
function startObservers() {
    stopObservers();

    const chatNode = document.getElementById('chat');
    if (chatNode) {
        chatContentObserver = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList') {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === 1) {
                            if (node.matches('.mes')) {
                                processAndRecordMessage(node);
                            } else if (node.querySelector) {
                                node.querySelectorAll('.mes').forEach(processAndRecordMessage);
                            }
                        }
                    });
                }
            }
        });
        chatContentObserver.observe(chatNode, { childList: true, subtree: true });
        console.log('[模型名称脚本] 新消息监听器已启动。');
    }

    chatContainerObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1 && node.id === 'chat') {
                        console.log('[模型名称脚本] 检测到 #chat 容器重载，准备恢复历史...');
                        restoreAllFromHistory();
                        startObservers();
                    }
                });
            }
        }
    });
    chatContainerObserver.observe(document.body, { childList: true });
    console.log('[模型名称脚本] 容器重载监听器已启动。');
}

/**
 * 停止所有监听器
 */
function stopObservers() {
    if (chatContentObserver) {
        chatContentObserver.disconnect();
        chatContentObserver = null;
    }
    if (chatContainerObserver) {
        chatContainerObserver.disconnect();
        chatContainerObserver = null;
    }
    console.log('[模型名称脚本] 所有监听器已停止。');
}

// -------------------------------------------------------------------
// 4. 自动更新检查功能
// -------------------------------------------------------------------

const SCRIPT_RAW_URL = 'https://cdn.jsdelivr.net/gh/GlacierCifer/ST-Model-Display@main/script.js';

function displayUpdateNotification() {
    const settingsHeader = $('#model_display_settings .inline-drawer-header');
    if (settingsHeader.length && $('#model_display_update_notice').length === 0) {
        const updateLink = $('<a></a>', {
            id: 'model_display_update_notice',
            href: SCRIPT_RAW_URL,
            text: '🚀 有可用更新',
            target: '_blank',
            title: '点击安装新版本',
        }).css({
            'color': 'var(--primary_color_accent)',
            'margin-left': '10px',
            'text-decoration': 'none',
        });
        settingsHeader.append(updateLink);
    }
}

async function checkForUpdates() {
    try {
        // 1. 获取当前脚本的版本号 (从常量中直接读取，更可靠)
        const currentVersion = CURRENT_SCRIPT_VERSION; 
        if (!currentVersion) {
            console.warn('[模型名称脚本] 无法在当前脚本中找到 @version 标签。');
            return;
        }

        // 2. 获取远程脚本的内容
        const response = await fetch(SCRIPT_RAW_URL);
        if (!response.ok) {
            console.warn('[模型名称脚本] 检查更新失败，无法获取远程脚本文件。');
            return;
        }
        const remoteScriptContent = await response.text();

        // 3. 从远程脚本内容中提取版本号
        const latestVersion = remoteScriptContent.match(/@version\s+([\d.]+)/)?.[1];
        if (!latestVersion) {
            console.warn('[模型名称脚本] 无法在远程脚本中找到 @version 标签。');
            return;
        }

        // 4. 比较版本号
        if (currentVersion !== latestVersion) {
            console.log(`[模型名称脚本] 检测到新版本！当前: ${currentVersion}, 最新: ${latestVersion}`);
            displayUpdateNotification();
        } else {
            console.log(`[模型名称脚本] 当前已是最新版本 (${currentVersion})。`);
        }
    } catch (error) {
        console.error('[模型名称脚本] 检查更新时发生错误:', error);
    }
}


// -------------------------------------------------------------------
// 5. 插件入口点
// -------------------------------------------------------------------

function initializeExtension() {
    try {
        $('#extensions_settings').append(renderSettingsHtml());
        bindSettingsEvents();
        applyFontCss(getSettings().fontCssUrl);

        if (getSettings().enabled) {
            startObservers();
            restoreAllFromHistory();
        }

        checkForUpdates();

        console.log('[动态显示模型名称] 完全初始化成功。');

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
