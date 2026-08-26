export const QuickRefreshModule = {
    name: 'quick_refresh',
    init() {
        this.bindEvents();
        console.log('[模块-快捷刷新] 初始化成功。');
    },
    bindEvents() {
        $(document).off('click.quickRefresh').on('click.quickRefresh', '#misc_quick_refresh_btn', () => {
            if (confirm('确定要重新载入(刷新)整个页面吗？\n\n注意：如果有未保存的文本或设置可能会丢失。')) {
                window.location.reload();
            }
        });
    }
};