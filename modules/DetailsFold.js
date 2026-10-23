import * as script from '../../../../../script.js';

export const DetailsFoldModule = {
    name: 'details_fold',

    initialized: false,

    styleId: 'details-fold-enhancer-style',

    buttonClass: 'st-details-fold-button',
    gridClass: 'st-details-fold-grid',
    innerClass: 'st-details-fold-inner',
    openClass: 'st-details-fold-open',

    // CSS 属性选择器使用完整的 data-* 属性名。
    animationAttr: 'data-st-details-fold-animation',
    generatedAttr: 'data-st-details-fold-generated',

    // dataset 访问必须使用驼峰形式，不能写成 data-st-details-fold。
    statusKey: 'stDetailsFold',

    animationDuration: 420,
    animationEasing: 'cubic-bezier(0.22, 1, 0.36, 1)',

    documents: new Map(),
    iframeRecords: new Map(),
    eventUnsubscribers: [],
    scanTimers: new Map(),

    rootObserver: null,
    boundClickHandler: null,

    init() {
        if (this.initialized) {
            console.log('[details_fold] 已经初始化，跳过重复初始化。');
            return;
        }

        this.initialized = true;
        this.boundClickHandler = this.handleClick.bind(this);

        console.log('[details_fold] 开始初始化。');

        this.observeDocument(document);
        this.observeIframes();
        this.bindAppEvents();

        console.log('[details_fold] 初始化完成。', {
            details: document.querySelectorAll('details').length,
            body: Boolean(document.body),
        });
    },

    cleanup() {
        if (!this.initialized) return;

        this.initialized = false;

        for (const timer of this.scanTimers.values()) {
            clearTimeout(timer);
        }

        this.scanTimers.clear();

        for (const [doc, record] of this.documents) {
            record.observer?.disconnect();

            doc.removeEventListener(
                'click',
                this.boundClickHandler,
                true
            );

            doc.removeEventListener(
                'toggle',
                record.toggleHandler,
                true
            );

            this.restoreDocument(doc);
            this.removeOwnStyles(doc);
        }

        this.documents.clear();

        this.rootObserver?.disconnect();
        this.rootObserver = null;

        for (const [iframe, record] of this.iframeRecords) {
            iframe.removeEventListener('load', record.loadHandler);
        }

        this.iframeRecords.clear();

        for (const unsubscribe of this.eventUnsubscribers) {
            try {
                unsubscribe();
            } catch (_) {
                // 忽略单个事件解绑错误。
            }
        }

        this.eventUnsubscribers = [];
        this.boundClickHandler = null;

        console.log('[details_fold] 已清理。');
    },

    installStyles(doc) {
        if (!doc?.documentElement) return;
        if (doc.getElementById(this.styleId)) return;

        const style = doc.createElement('style');
        style.id = this.styleId;

        style.textContent = `
            details[${this.animationAttr}="true"] > .${this.gridClass} {
                display: grid !important;
                grid-template-rows: 0fr !important;
                transition:
                    grid-template-rows ${this.animationDuration}ms ${this.animationEasing} !important;
            }

            details[${this.animationAttr}="true"].${this.openClass} > .${this.gridClass} {
                grid-template-rows: 1fr !important;
            }

            details[${this.animationAttr}="true"] > .${this.gridClass} > .${this.innerClass} {
                min-height: 0 !important;
                overflow: hidden !important;
            }

            .${this.buttonClass} {
                position: relative;
                box-sizing: border-box;
                display: block;
                width: 100%;
                margin: 10px 0 0;
                padding: 8px 0 4px;
                border: 0;
                background: transparent;
                color: inherit;
                font: inherit;
                font-size: 0.8em;
                line-height: 1.4;
                text-align: center;
                opacity: 0.7;
                cursor: pointer;
                user-select: none;
                transition: opacity 180ms ease;
            }

            .${this.buttonClass}::before {
                content: "";
                position: absolute;
                top: 0;
                right: 0;
                left: 0;
                border-top: 1px dashed currentColor;
                opacity: 0.7;
                pointer-events: none;
            }

            .${this.buttonClass}:hover,
            .${this.buttonClass}:focus-visible {
                opacity: 1;
            }

            .${this.buttonClass}:focus-visible {
                outline: 2px solid currentColor;
                outline-offset: 2px;
            }

            @media (prefers-reduced-motion: reduce) {
                details[${this.animationAttr}="true"] > .${this.gridClass} {
                    transition: none !important;
                }
            }
        `;

        (doc.head || doc.documentElement).appendChild(style);
    },

    removeOwnStyles(doc) {
        doc?.getElementById(this.styleId)?.remove();
    },

    observeDocument(doc) {
        if (!doc) return;

        if (!doc.body) {
            console.warn('[details_fold] 文档尚未准备好，等待 body 创建。');

            const retry = () => {
                if (!this.initialized) return;

                if (doc.body) {
                    this.observeDocument(doc);
                } else {
                    requestAnimationFrame(retry);
                }
            };

            requestAnimationFrame(retry);
            return;
        }

        if (this.documents.has(doc)) return;

        this.installStyles(doc);

        const toggleHandler = (event) => {
            const details = event.target;

            if (
                !details ||
                details.tagName !== 'DETAILS'
            ) {
                return;
            }

            this.syncOpenClass(details);

            if (!details.open) {
                this.clearCloseTimer(details);
            }
        };

        const observer = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    this.processAddedNode(node, doc);
                }
            }
        });

        doc.addEventListener(
            'click',
            this.boundClickHandler,
            true
        );

        doc.addEventListener(
            'toggle',
            toggleHandler,
            true
        );

        this.documents.set(doc, {
            observer,
            toggleHandler,
        });

        observer.observe(doc.body, {
            childList: true,
            subtree: true,
        });

        // 处理初始化时已经存在的折叠框。
        this.scanDetailsIn(doc.body, doc);

        console.log('[details_fold] 已开始观察文档。', {
            details: doc.querySelectorAll('details').length,
            url: doc.location?.href || 'unknown',
        });
    },

    processAddedNode(node, doc) {
        if (node.matches?.('details')) {
            this.setupDetails(node, doc);
        }

        node.querySelectorAll?.('details').forEach((details) => {
            this.setupDetails(details, doc);
        });
    },

    scanDetailsIn(root, doc) {
        if (!root) return;

        if (root.matches?.('details')) {
            this.setupDetails(root, doc);
        }

        root.querySelectorAll?.('details').forEach((details) => {
            this.setupDetails(details, doc);
        });
    },

    setupDetails(details, doc) {
        if (!details || !details.isConnected) return;

        const summary = this.getDirectSummary(details);

        if (!summary) {
            details.dataset[this.statusKey] = 'skip';
            return;
        }

        // 已经添加过按钮时，只同步状态，不重复处理。
        if (this.getButton(details)) {
            this.syncOpenClass(details);
            return;
        }

        const existingGrid = this.getDirectGrid(details);

        if (existingGrid) {
            const inner = this.getDirectInner(existingGrid);

            if (!inner) {
                details.dataset[this.statusKey] = 'button-only';
                this.addButton(details, doc, details);
                return;
            }

            details.dataset[this.statusKey] = 'animated';
            details.setAttribute(this.animationAttr, 'true');

            this.syncOpenClass(details);
            this.addButton(details, doc, inner);

            return;
        }

        const currentStatus = details.dataset[this.statusKey];

        if (currentStatus === 'skip') {
            return;
        }

        if (
            currentStatus === 'button-only' ||
            this.hasSizeTransition(details) ||
            this.hasUnsafeContent(details)
        ) {
            details.dataset[this.statusKey] = 'button-only';
            this.addButton(details, doc, details);
            return;
        }

        this.wrapDetailsContent(details, doc);
    },

    wrapDetailsContent(details, doc) {
        const summary = this.getDirectSummary(details);

        if (!summary) return;

        const grid = doc.createElement('div');
        grid.className = this.gridClass;
        grid.setAttribute(this.generatedAttr, 'true');

        const inner = doc.createElement('div');
        inner.className = this.innerClass;
        inner.setAttribute(this.generatedAttr, 'true');

        for (const node of Array.from(details.childNodes)) {
            if (node === summary) continue;

            // 不移动页面已有的 style 节点。
            if (
                node.nodeType === Node.ELEMENT_NODE &&
                node.tagName === 'STYLE'
            ) {
                continue;
            }

            inner.appendChild(node);
        }

        grid.appendChild(inner);
        details.appendChild(grid);

        details.dataset[this.statusKey] = 'animated';
        details.setAttribute(this.animationAttr, 'true');

        this.syncOpenClass(details);
        this.addButton(details, doc, inner);

        console.debug('[details_fold] 已处理 details。', details);
    },

    restoreDocument(doc) {
        doc.querySelectorAll('details').forEach((details) => {
            this.clearCloseTimer(details);

            const button = this.getButton(details);
            button?.remove();

            const grid = this.getDirectGrid(details);

            if (
                !grid ||
                grid.getAttribute(this.generatedAttr) !== 'true'
            ) {
                details.classList.remove(this.openClass);
                details.removeAttribute(this.animationAttr);
                delete details.dataset[this.statusKey];
                return;
            }

            const inner = this.getDirectInner(grid);

            if (inner) {
                while (inner.firstChild) {
                    details.insertBefore(inner.firstChild, grid);
                }
            }

            grid.remove();

            details.classList.remove(this.openClass);
            details.removeAttribute(this.animationAttr);
            delete details.dataset[this.statusKey];
        });
    },

    getDirectSummary(details) {
        return Array.from(details.children).find(
            (child) => child.tagName === 'SUMMARY'
        ) || null;
    },

    getDirectGrid(details) {
        return Array.from(details.children).find(
            (child) =>
                child.classList.contains(this.gridClass) &&
                child.getAttribute(this.generatedAttr) === 'true'
        ) || null;
    },

    getDirectInner(grid) {
        return Array.from(grid.children).find(
            (child) =>
                child.classList.contains(this.innerClass) &&
                child.getAttribute(this.generatedAttr) === 'true'
        ) || null;
    },

    getButton(details) {
        const directButton = Array.from(details.children).find(
            (child) =>
                child.classList.contains(this.buttonClass) &&
                child.getAttribute(this.generatedAttr) === 'true'
        );

        if (directButton) {
            return directButton;
        }

        const grid = this.getDirectGrid(details);
        const inner = grid && this.getDirectInner(grid);

        if (!inner) return null;

        return Array.from(inner.children).find(
            (child) =>
                child.classList.contains(this.buttonClass) &&
                child.getAttribute(this.generatedAttr) === 'true'
        ) || null;
    },

    createButton(doc) {
        const button = doc.createElement('button');

        button.type = 'button';
        button.className = this.buttonClass;
        button.setAttribute(this.generatedAttr, 'true');
        button.setAttribute('aria-label', '收起此折叠框');
        button.textContent = '▴ 点击收起 ▴';

        return button;
    },

    addButton(details, doc, container) {
        if (this.getButton(details)) return;

        const target = container || details;
        target.appendChild(this.createButton(doc));
    },

    hasSizeTransition(details) {
        const win = details.ownerDocument.defaultView;

        if (!win) return false;

        const elements = [
            details,
            ...details.querySelectorAll('*'),
        ];

        return elements.some((element) => {
            const style = win.getComputedStyle(element);

            const properties = style.transitionProperty
                .split(',')
                .map((property) => property.trim().toLowerCase());

            return properties.some((property) =>
                property === 'all' ||
                property === 'height' ||
                property === 'max-height' ||
                property === 'min-height' ||
                property === 'block-size' ||
                property === 'max-block-size' ||
                property === 'min-block-size' ||
                property === 'grid-template-rows'
            );
        });
    },

    hasUnsafeContent(details) {
        const riskySelector = [
            'input',
            'select',
            'textarea',
            'button',
            'label',
            'iframe',
            'video',
            'audio',
            'canvas',
            'script',
            'slot',
            'template',
            'form',
        ].join(',');

        for (const node of details.childNodes) {
            if (
                node.nodeType === Node.TEXT_NODE &&
                !node.textContent.trim()
            ) {
                continue;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) {
                continue;
            }

            if (
                node.tagName === 'SUMMARY' ||
                node.tagName === 'STYLE'
            ) {
                continue;
            }

            if (
                node.matches(riskySelector) ||
                node.querySelector(riskySelector) ||
                node.localName.includes('-')
            ) {
                return true;
            }
        }

        return false;
    },

    syncOpenClass(details) {
        details.classList.toggle(
            this.openClass,
            details.open
        );
    },

    clearCloseTimer(details) {
        if (details._stDetailsFoldTimer !== undefined) {
            clearTimeout(details._stDetailsFoldTimer);
            delete details._stDetailsFoldTimer;
        }
    },

    openDetails(details) {
        this.clearCloseTimer(details);

        if (!details.open) {
            details.open = true;
        }

        if (details.dataset[this.statusKey] !== 'animated') {
            return;
        }

        details.classList.remove(this.openClass);

        // 强制浏览器先应用关闭状态，再触发打开动画。
        void details.offsetHeight;

        const win = details.ownerDocument.defaultView || window;
        const requestFrame =
            win.requestAnimationFrame ||
            ((callback) => setTimeout(callback, 0));

        requestFrame(() => {
            if (
                details.isConnected &&
                details.open
            ) {
                details.classList.add(this.openClass);
            }
        });
    },

    closeDetails(details) {
        if (!details.open) return;

        this.clearCloseTimer(details);

        if (details.dataset[this.statusKey] !== 'animated') {
            details.open = false;
            return;
        }

        details.classList.remove(this.openClass);

        const summary = this.getDirectSummary(details);

        if (
            summary &&
            summary.getBoundingClientRect().top < 0
        ) {
            summary.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }

        details._stDetailsFoldTimer = setTimeout(() => {
            delete details._stDetailsFoldTimer;

            if (
                details.isConnected &&
                !details.classList.contains(this.openClass)
            ) {
                details.open = false;
            }
        }, this.animationDuration + 30);
    },

    toggleDetails(details) {
        if (
            details.open &&
            details.classList.contains(this.openClass)
        ) {
            this.closeDetails(details);
        } else {
            this.openDetails(details);
        }
    },

    handleClick(event) {
        const target = event.target;

        if (
            !target ||
            typeof target.closest !== 'function'
        ) {
            return;
        }

        const button = target.closest(
            `.${this.buttonClass}[${this.generatedAttr}="true"]`
        );

        if (button) {
            const details = button.closest('details');

            if (!details) return;

            event.preventDefault();
            event.stopPropagation();

            this.closeDetails(details);
            return;
        }

        const summary = target.closest('summary');

        if (!summary) return;

        const details = summary.parentElement;

        if (
            !details ||
            details.tagName !== 'DETAILS'
        ) {
            return;
        }

        if (details.dataset[this.statusKey] !== 'animated') {
            return;
        }

        // 动画模式下阻止原生瞬间开合。
        event.preventDefault();
        event.stopPropagation();

        this.toggleDetails(details);
    },

    bindAppEvents() {
        const eventSource = script?.eventSource;
        const eventTypes = script?.event_types;

        if (!eventSource || !eventTypes) {
            console.warn(
                '[details_fold] 未找到 script.eventSource，将仅依赖 MutationObserver。'
            );
            return;
        }

        const eventNames = [
            eventTypes.CHARACTER_MESSAGE_RENDERED,
            eventTypes.MESSAGE_SWIPED,
            eventTypes.MESSAGE_DELETED,
            eventTypes.CHAT_CHANGED,
        ].filter(Boolean);

        for (const eventName of new Set(eventNames)) {
            const handler = () => {
                for (const doc of this.documents.keys()) {
                    this.scheduleDocumentScan(doc);
                }
            };

            eventSource.on(eventName, handler);

            this.eventUnsubscribers.push(() => {
                if (typeof eventSource.off === 'function') {
                    eventSource.off(eventName, handler);
                } else if (
                    typeof eventSource.removeListener === 'function'
                ) {
                    eventSource.removeListener(eventName, handler);
                }
            });
        }
    },

    scheduleDocumentScan(doc) {
        if (!doc) return;

        const oldTimer = this.scanTimers.get(doc);

        if (oldTimer !== undefined) {
            clearTimeout(oldTimer);
        }

        const timer = setTimeout(() => {
            this.scanTimers.delete(doc);

            if (!this.initialized) return;

            this.scanDetailsIn(doc.body, doc);
        }, 80);

        this.scanTimers.set(doc, timer);
    },

    observeIframes() {
        const trackIframes = (root) => {
            if (!root) return;

            if (root.matches?.('iframe')) {
                this.trackIframe(root);
            }

            root.querySelectorAll?.('iframe').forEach((iframe) => {
                this.trackIframe(iframe);
            });
        };

        trackIframes(document);

        if (!document.body) return;

        this.rootObserver = new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE) {
                        continue;
                    }

                    trackIframes(node);
                }
            }
        });

        this.rootObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    },

    trackIframe(iframe) {
        if (!iframe || this.iframeRecords.has(iframe)) {
            return;
        }

        const loadHandler = () => {
            try {
                const frameDocument = iframe.contentDocument;

                if (!frameDocument) return;

                this.observeDocument(frameDocument);
                this.scheduleDocumentScan(frameDocument);
            } catch (_) {
                // 跨域 iframe 无法访问。
            }
        };

        this.iframeRecords.set(iframe, {
            loadHandler,
        });

        iframe.addEventListener('load', loadHandler);

        // 兼容 iframe 已经加载完成后才绑定监听器的情况。
        loadHandler();
    },
};
