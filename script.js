import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

import { ModelDisplayModule } from './modules/ModelDisplay.js';
import { PlaceholderModule, SloganInjectionModule } from './modules/Placeholder.js';
import { DetailsFoldModule } from './modules/DetailsFold.js';
import { GlobalFontModule, FontObserverModule } from './modules/GlobalFont.js';
import { QuickRefreshModule } from './modules/QuickRefresh.js';
import { RecentFoldersModule } from './modules/RecentFolders.js';
import { UpdaterModule } from './modules/Updater.js';
import { PrivacyMaskModule } from './modules/PrivacyMask.js';

const DETAILS_FOLD_SETTINGS_KEY = 'details_fold_enabled';
const DEFAULT_DETAILS_FOLD_ENABLED = true;

let combinedExtensionInitialized = false;
let settingsEventsBound = false;

function getDetailsFoldEnabled() {
    const settings = extension_settings.misc_beautify || {};

    if (settings[DETAILS_FOLD_SETTINGS_KEY] === undefined) {
        settings[DETAILS_FOLD_SETTINGS_KEY] = DEFAULT_DETAILS_FOLD_ENABLED;
        extension_settings.misc_beautify = settings;
    }

    return settings[DETAILS_FOLD_SETTINGS_KEY] === true;
}

function setDetailsFoldEnabled(enabled) {
    if (!extension_settings.misc_beautify) {
        extension_settings.misc_beautify = {};
    }

    extension_settings.misc_beautify[DETAILS_FOLD_SETTINGS_KEY] = Boolean(enabled);
}

function initializeCombinedExtension() {
    if (combinedExtensionInitialized) return;
    combinedExtensionInitialized = true;

    try {
        window.__stmdGlobalFont = GlobalFontModule;
GlobalFontModule.init();
        FontObserverModule.init(GlobalFontModule.docContext);
        RecentFoldersModule.init();
        window.__stmdUpdater = UpdaterModule;
        PrivacyMaskModule.init();
        window.__stmdPrivacy = PrivacyMaskModule;

        const detailsFoldEnabled = getDetailsFoldEnabled();

        const combinedSettingsHtml = `
            <div id="misc_beautify_settings" class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header">
                    <b>小美化集</b>
                    <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
                </div>

                <div class="inline-drawer-content" style="display: none;">

                    <div class="version-row">
                        <i
                            id="misc_quick_refresh_btn"
                            class="fa-solid fa-arrows-rotate"
                            title="刷新页面 (F5)"
                            role="button"
                            tabindex="0"
                        ></i>

                        <span
                            class="version-indicator"
                            id="model_display_version_indicator"
                        ></span>

                        <i
                            id="misc_update_btn"
                            class="fa-solid fa-cloud-arrow-down"
                            title="检查更新"
                            role="button"
                            tabindex="0"
                        ></i>
                    </div>

                    <!-- 模型名称显示 -->
                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_model_display_toggle"
                            ${ModelDisplayModule.getSettings().enabled ? 'checked' : ''}
                        >
                        <span>模型名称显示</span>
                    </label>

                    <div
                        id="model_display_settings_panel"
                        class="sub-setting-container"
                        style="${ModelDisplayModule.getSettings().enabled ? '' : 'display: none;'}"
                    >
                        <div class="sub-setting-toggle">
                            <b>详细设置</b>
                            <div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>

                        <div class="sub-setting-content" style="display: none;">
                            ${ModelDisplayModule.renderSettingsHtml()}
                        </div>
                    </div>

                    <!-- 输入框文字替换 -->
                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_placeholder_toggle"
                            ${PlaceholderModule.getSettings().enabled ? 'checked' : ''}
                        >
                        <span>输入框文字替换</span>
                    </label>

                    <div
                        id="placeholder_settings_panel"
                        class="sub-setting-container"
                        style="${PlaceholderModule.getSettings().enabled ? '' : 'display: none;'}"
                    >
                        <div class="sub-setting-toggle">
                            <b>详细设置</b>
                            <div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>

                        <div class="sub-setting-content" style="display: none;">
                            ${PlaceholderModule.renderSettingsHtml()}
                        </div>
                    </div>

                    <!-- 折叠框底部收起 -->
                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_details_fold_toggle"
                            ${detailsFoldEnabled ? 'checked' : ''}
                        >
                        <span>折叠框底部收起</span>
                    </label>

                    <div
                        id="details_fold_settings_panel"
                        class="sub-setting-container details-fold-settings-panel"
                        style="${detailsFoldEnabled ? '' : 'display: none;'}"
                    >
                        <div class="sub-setting-description">
                            为聊天消息中的折叠框添加底部收起按钮，并为可安全处理的折叠框提供开合动画。
                        </div>
                    </div>

                    <!-- 全局字体替换 -->
                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_global_font_toggle"
                            ${GlobalFontModule.getSettings().enabled ? 'checked' : ''}
                        >
                        <span>全局字体替换</span>
                    </label>

                    <div
                        id="global_font_settings_panel"
                        class="sub-setting-container"
                        style="${GlobalFontModule.getSettings().enabled ? '' : 'display: none;'}"
                    >
                        <div class="sub-setting-toggle">
                            <b>详细设置</b>
                            <div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>

                        <div class="sub-setting-content" style="display: none;">
                            ${GlobalFontModule.renderSettingsHtml()}
                        </div>
                    </div>

                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_privacy_mask_toggle"
                            ${PrivacyMaskModule.getSettings().enabled ? 'checked' : ''}
                        >
                        <span>打码模式</span>
                    </label>

                    <div
                        id="privacy_mask_settings_panel"
                        class="sub-setting-container"
                        style="${PrivacyMaskModule.getSettings().enabled ? '' : 'display: none;'}"
                    >
                        ${PrivacyMaskModule.renderSettingsHtml()}
                    </div>

                    <label class="checkbox_label">
                        <input
                            type="checkbox"
                            id="misc_recent_folders_toggle"
                            ${RecentFoldersModule.getSettings().enabled ? 'checked' : ''}
                        >
                        <span>主页按角色分组</span>
                    </label>

                    <div
                        id="recent_folders_settings_panel"
                        class="sub-setting-container"
                        style="${RecentFoldersModule.getSettings().enabled ? '' : 'display: none;'}"
                    >
                        ${RecentFoldersModule.renderSettingsHtml()}
                    </div>

                </div>
            </div>
        `;

        // 防止热重载或重复初始化时重复插入设置面板。
        $('#misc_beautify_settings').remove();
        $('#extensions_settings').append(combinedSettingsHtml);

        if (!settingsEventsBound) {
            bindMainSettingsEvents();
            settingsEventsBound = true;
        }

        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();
        GlobalFontModule.bindSettingsEvents();

        QuickRefreshModule.init();

        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();

        if (getDetailsFoldEnabled()) {
            DetailsFoldModule.init();
        }

        if (
            GlobalFontModule.getSettings().enabled &&
            GlobalFontModule.getActiveFontName()
        ) {
            FontObserverModule.start();
        }

        console.log('[小美化集] 初始化完成。');
    } catch (error) {
        console.error('[小美化集] 初始化时发生致命错误:', error);
    }
}

function bindMainSettingsEvents() {
    $(document).on('change.miscBeautify', '#misc_model_display_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');
        const settings = ModelDisplayModule.getSettings();

        settings.enabled = enabled;
        $('#model_display_settings_panel').toggle(enabled);

        ModelDisplayModule.rerenderAllModelNames(!enabled);

        if (enabled) {
            ModelDisplayModule.startObservers();
        } else {
            ModelDisplayModule.stopObservers();
        }

        script.saveSettingsDebounced();
    });

    $(document).on('change.miscBeautify', '#misc_placeholder_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');
        const settings = PlaceholderModule.getSettings();

        settings.enabled = enabled;
        $('#placeholder_settings_panel').toggle(enabled);

        if (enabled) {
            PlaceholderModule.init();
        } else {
            PlaceholderModule.cleanup?.();
            PlaceholderModule.stopPlaceholderObserver?.();

            const textarea = document.getElementById(
                PlaceholderModule.TEXTAREA_ID
            );

            if (textarea) {
                textarea.placeholder =
                    PlaceholderModule.resolveFallbackPlaceholder(textarea);
            }
        }

        script.saveSettingsDebounced();
    });

    $(document).on('change.miscBeautify', '#misc_details_fold_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');

        setDetailsFoldEnabled(enabled);
        $('#details_fold_settings_panel').toggle(enabled);

        if (enabled) {
            DetailsFoldModule.init();
        } else {
            DetailsFoldModule.cleanup();
        }

        script.saveSettingsDebounced();
    });

    $(document).on('change.miscBeautify', '#misc_global_font_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');
        const settings = GlobalFontModule.getSettings();

        settings.enabled = enabled;
        $('#global_font_settings_panel').toggle(enabled);

        if (enabled) {
            window.__stmdGlobalFont = GlobalFontModule;
GlobalFontModule.init();

            if (GlobalFontModule.getActiveFontName()) {
                FontObserverModule.start();
            }
        } else {
            FontObserverModule.stop?.();
        }

        GlobalFontModule.saveSettings();
    });

    $(document).on('change.miscBeautify', '#misc_recent_folders_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');
        RecentFoldersModule.getSettings().enabled = enabled;
        $('#recent_folders_settings_panel').toggle(enabled);
        RecentFoldersModule.save();
        RecentFoldersModule.refresh();
    });

    RecentFoldersModule.bindSettingsEvents();
    PrivacyMaskModule.bindSettingsEvents();

    $(document).on('change.miscBeautify', '#misc_privacy_mask_toggle', (event) => {
        const enabled = $(event.currentTarget).is(':checked');
        PrivacyMaskModule.getSettings().enabled = enabled;
        $('#privacy_mask_settings_panel').toggle(enabled);
        PrivacyMaskModule.save();
        if (!enabled) {
            PrivacyMaskModule._applied = null;
            PrivacyMaskModule.restore();
        }
    });

    $(document).on('click.miscBeautify', '#misc_update_btn', async () => {
        const button = document.getElementById('misc_update_btn');
        const toast = window.toastr || { success() {}, warning() {}, error() {} };
        button?.classList.add('fa-spin');
        try {
            const result = await UpdaterModule.check();
            if (result.unknown) {
                toast.warning('无法获取版本信息（网络或仓库不可达）');
                return;
            }
            if (!result.hasUpdate) {
                toast.success(`已是最新版本 v${result.local}`);
                return;
            }
            const confirmed = confirm(
                `发现新版本：${result.local} → ${result.remote}\n\n是否更新？\n（更新会丢弃扩展目录内的本地改动，扩展设置不受影响）`
            );
            if (!confirmed) return;
            try {
                await UpdaterModule.update();
            } catch (error) {
                const clean = confirm(
                    `直接更新失败：\n${error.message}\n\n要彻底重装吗？\n（删除扩展目录后重新克隆，会清除本地改动和残留文件）`
                );
                if (!clean) return;
                await UpdaterModule.reinstall();
            }
            UpdaterModule.cleanupLocalState();
            toast.success('已更新，正在重新加载…');
            setTimeout(() => location.reload(), 900);
        } catch (error) {
            toast.error(`检查更新失败：${error.message}`);
        } finally {
            button?.classList.remove('fa-spin');
        }
    });

    $(document).on('click.miscBeautify', '.sub-setting-toggle', function () {
        $(this)
            .next('.sub-setting-content')
            .stop(true, true)
            .slideToggle(200);

        $(this)
            .find('.sub-setting-icon')
            .toggleClass('up');
    });
}

function waitForExtensionSettings() {
    const tryInitialize = () => {
        if (
            $('#extensions_settings').length &&
            typeof script !== 'undefined'
        ) {
            initializeCombinedExtension();
            return true;
        }

        return false;
    };

    if (tryInitialize()) return;

    const observer = new MutationObserver(() => {
        if (tryInitialize()) {
            observer.disconnect();
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
}

$(document).ready(() => {
    setTimeout(waitForExtensionSettings, 1000);
});
