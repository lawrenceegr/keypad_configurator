const LINE_DELIM = '\n';

export class KeypadSerial {
  constructor() {
    this.port = null;
    this.writer = null;
    this.reader = null;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = '';
    this.onEvent = null;
    this.onClose = null;
  }

  get connected() {
    return this.port !== null;
  }

  async connect() {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: 115200 });
    this.port = port;
    this.writer = port.writable.getWriter();
    this.readLoop();
  }

  async disconnect() {
    const port = this.port;
    this.port = null;
    if (this.reader) {
      try {
        await this.reader.cancel();
      } catch (e) {}
    }
    if (this.writer) {
      try {
        this.writer.releaseLock();
      } catch (e) {}
    }
    if (port) {
      try {
        await port.close();
      } catch (e) {}
    }
    this.writer = null;
    this.reader = null;
    for (const entry of this.pending.values()) {
      entry.reject(new Error('disconnected'));
    }
    this.pending.clear();
    if (this.onClose) {
      this.onClose();
    }
  }

  async readLoop() {
    const decoder = new TextDecoder();
    while (this.port && this.port.readable) {
      this.reader = this.port.readable.getReader();
      try {
        for (;;) {
          const { value, done } = await this.reader.read();
          if (done) {
            break;
          }
          this.buffer += decoder.decode(value, { stream: true });
          this.drainLines();
        }
      } catch (e) {
        break;
      } finally {
        try {
          this.reader.releaseLock();
        } catch (e) {}
        this.reader = null;
      }
    }
    if (this.port) {
      this.disconnect();
    }
  }

  drainLines() {
    let idx;
    while ((idx = this.buffer.indexOf(LINE_DELIM)) >= 0) {
      const line = this.buffer.slice(0, idx).trim();
      this.buffer = this.buffer.slice(idx + 1);
      if (line) {
        this.handleLine(line);
      }
    }
  }

  handleLine(line) {
    let msg;
    try {
      msg = JSON.parse(line);
    } catch (e) {
      return;
    }
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const entry = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      entry.resolve(msg);
      return;
    }
    if (msg.evt && this.onEvent) {
      this.onEvent(msg);
    }
  }

  send(cmd, timeoutMs = 2000) {
    const id = this.nextId++;
    const payload = JSON.stringify({ id, ...cmd }) + LINE_DELIM;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('timeout: ' + cmd.cmd));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg);
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        },
      });
      const data = new TextEncoder().encode(payload);
      this.writer.write(data).catch((err) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      });
    });
  }
}
