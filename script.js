import * as script from '../../../../script.js';
import { extension_settings } from '../../../extensions.js';

import { ModelDisplayModule } from './modules/ModelDisplay.js';
import { PlaceholderModule, SloganInjectionModule } from './modules/Placeholder.js';
import { GlobalFontModule, FontObserverModule } from './modules/GlobalFont.js';
import { QuickRefreshModule } from './modules/QuickRefresh.js';

function initializeCombinedExtension() {
    try {
        // 全局字体模块前置初始化以获取 docContext 供哨兵使用
        GlobalFontModule.init();
        FontObserverModule.init(GlobalFontModule.docContext);

        const combinedSettingsHtml = `
            <div id="misc_beautify_settings" class="inline-drawer">
                <div class="inline-drawer-toggle inline-drawer-header"><b>小美化集</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
                <div class="inline-drawer-content" style="display: none;">

                    <div class="version-row">
                        <i id="misc_quick_refresh_btn" class="fa-solid fa-arrows-rotate" title="刷新页面 (F5)"></i>
                        <span class="version-indicator" id="model_display_version_indicator"></span>
                    </div>

                    <!-- 模型名称显示 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_model_display_toggle" ${ModelDisplayModule.getSettings().enabled ? 'checked' : ''}><span>模型名称显示</span></label>
                    <div id="model_display_settings_panel" class="sub-setting-container" style="${ModelDisplayModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle">
                            <b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>
                        <div class="sub-setting-content" style="display: none;">
                             ${ModelDisplayModule.renderSettingsHtml()}
                        </div>
                    </div>

                    <!-- 输入框文字替换 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_placeholder_toggle" ${PlaceholderModule.getSettings().enabled ? 'checked' : ''}><span>输入框文字替换</span></label>
                    <div id="placeholder_settings_panel" class="sub-setting-container" style="${PlaceholderModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle">
                            <b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>
                        <div class="sub-setting-content" style="display: none;">
                             ${PlaceholderModule.renderSettingsHtml()}
                        </div>
                    </div>

                    <!-- 全局字体替换 -->
                    <label class="checkbox_label"><input type="checkbox" id="misc_global_font_toggle" ${GlobalFontModule.getSettings().enabled ? 'checked' : ''}><span>全局字体替换</span></label>
                    <div id="global_font_settings_panel" class="sub-setting-container" style="${GlobalFontModule.getSettings().enabled ? '' : 'display: none;'}">
                        <div class="sub-setting-toggle">
                            <b>详细设置</b><div class="sub-setting-icon fa-solid fa-chevron-down"></div>
                        </div>
                        <div class="sub-setting-content" style="display: none;">
                             ${GlobalFontModule.renderSettingsHtml()}
                        </div>
                    </div>

                </div>
            </div>
        `;
        $('#extensions_settings').append(combinedSettingsHtml);

        // --- 主控事件绑定 ---
        $(document).on('change', '#misc_model_display_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            const settings = ModelDisplayModule.getSettings();
            settings.enabled = en;
            $('#model_display_settings_panel').toggle(en);
            ModelDisplayModule.rerenderAllModelNames(!en);
            if(en) ModelDisplayModule.startObservers(); else ModelDisplayModule.stopObservers();
            script.saveSettingsDebounced();
        });

        $(document).on('change', '#misc_placeholder_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            const settings = PlaceholderModule.getSettings();
            settings.enabled = en;
            $('#placeholder_settings_panel').toggle(en);
            if(en) PlaceholderModule.init(); else {
                const textarea = document.getElementById(PlaceholderModule.TEXTAREA_ID);
                if (textarea) textarea.placeholder = PlaceholderModule.resolveFallbackPlaceholder(textarea);
                PlaceholderModule.stopPlaceholderObserver();
            }
            script.saveSettingsDebounced();
        });

        $(document).on('change', '#misc_global_font_toggle', e => {
            const en = $(e.currentTarget).is(':checked');
            const settings = GlobalFontModule.getSettings();
            settings.enabled = en;
            $('#global_font_settings_panel').toggle(en);
            GlobalFontModule.saveSettings();
        });

        $(document).on('click', '.sub-setting-toggle', function() {
            $(this).next('.sub-setting-content').slideToggle(200);
            $(this).find('.sub-setting-icon').toggleClass('up');
        });

        // --- 子模块事件绑定与初始化 ---
        ModelDisplayModule.bindSettingsEvents();
        PlaceholderModule.bindSettingsEvents();
        GlobalFontModule.bindSettingsEvents();
        QuickRefreshModule.init(); // 该模块直接包含事件绑定

        ModelDisplayModule.init();
        PlaceholderModule.init();
        SloganInjectionModule.init();

        if (GlobalFontModule.getSettings().enabled && GlobalFontModule.getActiveFontName()) {
            FontObserverModule.start();
        }

        console.log('[小美化集] 初始化完成。');
    } catch (e) {
        console.error('[小美化集] 初始化时发生致命错误:', e);
    }
}

$(document).ready(() => {
    setTimeout(() => {
        const interval = setInterval(() => {
            if ($('#extensions_settings').length && typeof script !== 'undefined') {
                clearInterval(interval);
                initializeCombinedExtension();
            }
        }, 500);
    }, 1000);
});
