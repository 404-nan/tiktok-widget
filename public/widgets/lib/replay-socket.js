// ES5 ウィジェット向けに WebSocket 再接続時の replay と重複除外を共通化する。

(function (global) {
  'use strict';

  function sequence(value) {
    var number = Number(value);
    return isFinite(number) && Math.floor(number) === number && number >= 0 ? number : null;
  }

  function connect(url, onMessage, reconnectDelay, onOpen, onClose) {
    var epoch = null;
    var lastSeq = null;
    var recent = [];
    var seen = {};
    var socket = null;
    var retry = null;
    var stopped = false;
    var delay = reconnectDelay == null ? 2000 : reconnectDelay;

    function clearSeen() {
      recent = [];
      seen = {};
    }

    function cursorUrl() {
      var params = [];
      if (lastSeq !== null && epoch) {
        params.push('since=' + encodeURIComponent(String(lastSeq)));
        params.push('epoch=' + encodeURIComponent(epoch));
      }
      if (!params.length) return url;
      return url + (url.indexOf('?') === -1 ? '?' : '&') + params.join('&');
    }

    function receive(event) {
      var message;
      try { message = JSON.parse(event.data); } catch (error) { onMessage(event); return; }
      if (message.type === 'hello') {
        var sameEpoch = epoch !== null && epoch === message.epoch;
        if (!sameEpoch) {
          clearSeen();
          lastSeq = sequence(message.seq);
        } else if (message.gap) clearSeen();
        else if (lastSeq === null) lastSeq = sequence(message.seq);
        epoch = message.epoch || null;
      } else {
        var seq = sequence(message.seq);
        if (seq === null && message.event) seq = sequence(message.event.id);
        if (seq !== null) {
          if (seen[seq] || (lastSeq !== null && seq <= lastSeq)) return;
          seen[seq] = true;
          recent.push(seq);
          if (recent.length > 1000) delete seen[recent.shift()];
          lastSeq = seq;
        }
      }
      onMessage(event);
    }

    function open() {
      if (stopped) return;
      try {
        socket = new WebSocket(cursorUrl());
      } catch (error) {
        retry = setTimeout(open, delay);
        return;
      }
      socket.onopen = function () { if (onOpen) onOpen(); };
      socket.onmessage = receive;
      socket.onclose = function () {
        if (onClose) onClose();
        if (!stopped) retry = setTimeout(open, delay);
      };
      socket.onerror = function () {
        try { socket.close(); } catch (error) {}
      };
    }

    open();
    return {
      close: function () {
        stopped = true;
        clearTimeout(retry);
        if (socket) socket.close();
      }
    };
  }

  global.twReplaySocket = { connect: connect };
}(window));
