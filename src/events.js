// プロセス内のイベントバス。ルーレット結果やボス・メディア・ガチャが名前付きで知らせる。
// Hub の WebSocket 配信とは別に、サーバー内の仕組み同士をつなぐ。

import { EventEmitter } from 'node:events';

export function createEventBus() {
  const ee = new EventEmitter();
  ee.setMaxListeners(0);
  return {
    on(type, fn) {
      ee.on(type, fn);
      return () => ee.off(type, fn);
    },
    off(type, fn) {
      ee.off(type, fn);
    },
    emit(type, payload) {
      const extra = payload && typeof payload === 'object' ? payload : payload === undefined ? {} : { value: payload };
      const event = { ...extra, type, ts: Date.now() };
      ee.emit(type, event);
      ee.emit('*', event);
      return event;
    },
    listenerCount(type) {
      return ee.listenerCount(type);
    },
  };
}
