import "@testing-library/jest-dom/vitest";

class DummyEventSource {
    constructor(url, options) {
        this.url = url;
        this.options = options;
        this.listeners = {};
    }
    addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
    }
    removeEventListener(type, listener) {
        if (this.listeners[type]) {
            this.listeners[type] = this.listeners[type].filter(l => l !== listener);
        }
    }
    dispatchEvent(event) {
        const list = this.listeners[event.type] || [];
        list.forEach(l => l(event));
    }
    close() { }
}

globalThis.EventSource = DummyEventSource;

